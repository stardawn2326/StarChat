import { randomUUID } from 'node:crypto';
import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  protocol,
  screen,
  Tray
} from 'electron';
import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_ROLE_PACKAGE } from '../shared/default-role';
import type {
  ChatEvent,
  ChatMessage,
  CursorUpdate,
  DisplaySummary,
  PetDragPoint,
  PetResizeStart,
  PetInputMode,
  PublicAppState,
  CubismDebugCommand,
  CubismDebugMetricRequest,
  RoleIdRequest,
  RoleSaveRequest,
  SaveSettingsRequest,
  SettingsPreviewDetail,
  StartChatRequest
} from '../shared/ipc';
import { SEMANTIC_ACTIONS, SEMANTIC_EXPRESSIONS, validateRolePackage } from '../shared/role-package';
import type { CubismRuntimeMetrics } from '../shared/cubism';
import type { PresentationEvent, PresentationLayer } from '../shared/presentation';
import { clampPetWindowBounds, nextPetResizeBounds, type WindowBounds } from '../shared/window-contract';
import { petInteractionEnabled, petInteractionSettingsForEnabled } from '../shared/pet-interaction';
import { streamChatCompletion } from './api/openai-compatible';
import { SettingsStore } from './settings-store';
import { inspectExternalLive2DModel } from './live2d-importer';
import { nextPetDragBounds } from './window-drag';
import { buildCompanionSystemPrompt, companionSummary, recordCompanionExchange } from '../shared/companion';
import { synthesizeCosyVoice } from './tts/cosyvoice';
import { ensureCosyVoiceService, stopManagedCosyVoiceService } from './tts/cosyvoice-service';
import { VoiceProfileStore } from './voice-profile-store';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
let petWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let clickTargetWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let settingsStore: SettingsStore;
let voiceProfileStore: VoiceProfileStore;
let isQuitting = false;
let restoringPetBounds = false;
let petBoundsPersistTimer: ReturnType<typeof setTimeout> | null = null;
let registeredSettingsShortcut = '';
const INTERACTION_SHORTCUT = 'CommandOrControl+Alt+I';
let petDragStart: { point: PetDragPoint; bounds: Electron.Rectangle } | null = null;
let petResizeStart: { request: PetResizeStart; bounds: Electron.Rectangle; display: Electron.Display } | null = null;
let petModelEditMode = false;
let petBoundsRestored = false;
let petRendererReady = false;
let petStartupShowPending = true;
let cursorTimer: ReturnType<typeof setInterval> | null = null;
let lastCursorPoint: { x: number; y: number } | null = null;
let latestCubismMetrics: CubismRuntimeMetrics | null = null;
const activeRequests = new Map<string, AbortController>();

const LIVE2D_PROTOCOL = 'live2d';
const LIVE2D_MODEL_BASE = 'live2d://model/';
const CLICK_TARGET_TITLE = 'BAOYIN_CLICK_TARGET';
const interactionTestEnabled = process.env.BAOYIN_INTERACTION_TEST === '1' || process.argv.includes('--baoyin-interaction-test');
const singleInstanceLock = app.requestSingleInstanceLock();

function cosyVoiceProjectRoots(): string[] {
  const portableExecutableDir = process.env.PORTABLE_EXECUTABLE_DIR;
  return [
    process.env.BAOYIN_COSYVOICE_PROJECT_ROOT ?? '',
    portableExecutableDir ? resolve(portableExecutableDir, '..') : '',
    resolve(app.getAppPath(), '..'),
    resolve(dirname(process.execPath), '..'),
    process.cwd()
  ].filter(Boolean);
}

if (!singleInstanceLock) {
  void app.quit();
} else {
  app.on('second-instance', () => {
    settingsWindow?.show();
    settingsWindow?.focus();
    showPetWindowInactive();
  });
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: LIVE2D_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
]);

function contentTypeFor(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.json')) return 'application/json; charset=utf-8';
  if (lower.endsWith('.vert') || lower.endsWith('.frag')) return 'text/plain; charset=utf-8';
  if (lower.endsWith('.wav')) return 'audio/wav';
  return 'application/octet-stream';
}

function isAllowedModelAsset(relativePath: string): boolean {
  const lower = relativePath.toLowerCase();
  return [
    '.model3.json',
    '.moc3',
    '.physics3.json',
    '.cdi3.json',
    '.exp3.json',
    '.motion3.json',
    '.userdata3.json',
    '.pose3.json',
    '.png',
    '.wav'
  ].some((suffix) => lower.endsWith(suffix));
}

function safeFileUnder(rootDirectory: string, requestedPath: string): string | null {
  const normalized = requestedPath.replaceAll('\\', '/');
  if (
    !normalized ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:/.test(normalized) ||
    normalized.split('/').some((part) => part === '..')
  ) {
    return null;
  }

  const realRoot = realpathSync(rootDirectory);
  const candidate = resolve(realRoot, ...normalized.split('/'));
  if (!existsSync(candidate) || !statSync(candidate).isFile()) {
    return null;
  }

  const realCandidate = realpathSync(candidate);
  const outside = relative(realRoot, realCandidate);
  if (outside === '' || outside.startsWith('..') || isAbsolute(outside)) {
    return null;
  }
  return realCandidate;
}

function responseForFile(filePath: string): Response {
  return new Response(new Uint8Array(readFileSync(filePath)), {
    status: 200,
    headers: {
      'content-type': contentTypeFor(filePath),
      'cache-control': 'no-store',
      'access-control-allow-origin': '*'
    }
  });
}

function notFoundResponse(): Response {
  return new Response('Live2D asset is not available', {
    status: 404,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'access-control-allow-origin': '*'
    }
  });
}

function activeModelDirectory(): string | null {
  if (!settingsStore) {
    return null;
  }
  const inspected = inspectExternalLive2DModel(getStore().readSettings().live2dModelPath);
  return inspected.status === 'ready' || inspected.status === 'ready_with_warnings'
    ? inspected.directoryPath
    : null;
}

function registerLive2DProtocol(): void {
  protocol.handle(LIVE2D_PROTOCOL, async (request) => {
    let parsed: URL;
    try {
      parsed = new URL(request.url);
    } catch {
      return notFoundResponse();
    }

    const requestedPath = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
    if (parsed.hostname === 'model') {
      const modelDirectory = activeModelDirectory();
      if (!modelDirectory || !isAllowedModelAsset(requestedPath)) {
        return notFoundResponse();
      }
      try {
        const filePath = safeFileUnder(modelDirectory, requestedPath);
        return filePath ? responseForFile(filePath) : notFoundResponse();
      } catch {
        return notFoundResponse();
      }
    }

    if (parsed.hostname === 'sdk') {
      const shaderDirectory = app.isPackaged
        ? resolve(__dirname, '../renderer/live2d-shaders')
        : resolve(__dirname, '../../vendor/live2d-sdk-web/Framework/Shaders/WebGL');
      try {
        const filePath = safeFileUnder(shaderDirectory, requestedPath);
        return filePath && /\.(vert|frag)$/i.test(filePath)
          ? responseForFile(filePath)
          : notFoundResponse();
      } catch {
        return notFoundResponse();
      }
    }

    return notFoundResponse();
  });
}

function getStore(): SettingsStore {
  if (!settingsStore) {
    throw new Error('设置存储尚未初始化');
  }
  return settingsStore;
}

function getPublicState(): PublicAppState {
  const store = getStore();
  const settings = store.readSettings();
  const live2d = inspectExternalLive2DModel(settings.live2dModelPath);
  const roles = store.readRolePackages();
  const role = roles.find((item) => item.id === settings.activeRoleId) ?? roles[0] ?? DEFAULT_ROLE_PACKAGE;
  const companion = store.readCompanionState(role.id);
  return {
    settings,
    hasApiKey: store.hasApiKey(),
    role,
    roles,
    live2d,
    companion: companionSummary(companion, role.personality.relationshipStages),
    voices: voiceProfileStore.list()
  };
}

function sendChatEvent(sender: Electron.WebContents, event: ChatEvent): void {
  if (!sender.isDestroyed()) {
    sender.send('chat:event', event);
  }
}

function sendAssistantPresentation(event: PresentationEvent): void {
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send('presentation:event', event);
  }
}

function rendererTarget(role: 'pet' | 'settings'): { url?: string; file?: string; query?: Record<string, string> } {
  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  if (rendererUrl) {
    const target = new URL(rendererUrl);
    target.searchParams.set('window', role);
    return { url: target.toString() };
  }
  return { file: join(__dirname, '../renderer/index.html'), query: { window: role } };
}

function loadRenderer(window: BrowserWindow, role: 'pet' | 'settings'): void {
  const target = rendererTarget(role);
  if (target.url) {
    void window.loadURL(target.url);
  } else if (target.file) {
    void window.loadFile(target.file, { query: target.query });
  }
}

function displaySummary(display: Electron.Display): DisplaySummary {
  return {
    id: display.id,
    label: display.label || `显示器 ${display.id}`,
    bounds: display.bounds,
    workArea: display.workArea
  };
}

function selectedDisplay(): Electron.Display {
  const configuredId = getStore().readSettings().petDisplayId;
  return (
    screen.getAllDisplays().find((display) => display.id === configuredId) ?? screen.getPrimaryDisplay()
  );
}

function safePetBounds(input: Electron.Rectangle, display: Electron.Display): Electron.Rectangle {
  return clampPetWindowBounds(input, display.workArea);
}

function restorePetBounds(): void {
  if (!petWindow || petWindow.isDestroyed()) {
    return;
  }
  const settings = getStore().readSettings();
  const display = selectedDisplay();
  const workArea = display.workArea;
  const initial = settings.petBounds ?? {
    x: workArea.x + workArea.width - 454,
    y: workArea.y + Math.max(16, Math.round((workArea.height - 620) / 2)),
    width: 430,
    height: 600
  };
  restoringPetBounds = true;
  petWindow.setBounds(safePetBounds(initial, display));
  restoringPetBounds = false;
}

function persistPetBounds(immediate = false): void {
  if (!petWindow || petWindow.isDestroyed() || restoringPetBounds || petResizeStart || isQuitting) {
    return;
  }
  if (petBoundsPersistTimer) {
    clearTimeout(petBoundsPersistTimer);
    petBoundsPersistTimer = null;
  }
  const write = (): void => {
    petBoundsPersistTimer = null;
    if (petWindow && !petWindow.isDestroyed() && !isQuitting) {
      getStore().save({ petBounds: petWindow.getBounds() });
    }
  };
  if (immediate) {
    write();
  } else {
    petBoundsPersistTimer = setTimeout(write, 180);
  }
}

function sendPetBoundsChanged(): void {
  if (!petWindow || petWindow.isDestroyed()) {
    return;
  }
  const bounds = petWindow.getBounds();
  for (const window of [petWindow, settingsWindow]) {
    if (window && !window.isDestroyed()) {
      window.webContents.send('pet:bounds-changed', bounds);
    }
  }
}

function syncPetWindowResizable(): void {
  if (!petWindow || petWindow.isDestroyed()) {
    return;
  }
  // Custom edge gestures own resizing. Native DWM resize paints a white
  // non-client strip on transparent frameless windows.
  petWindow.setResizable(false);
}

function applyPetWindowSettings(): void {
  if (!petWindow || petWindow.isDestroyed()) {
    return;
  }
  const settings = getStore().readSettings();
  petWindow.setAlwaysOnTop(true, 'floating', 1);
  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  petWindow.setOpacity(settings.petWindowOpacity);
  syncPetWindowResizable();
}

function showPetWindowInactive(): void {
  if (!petWindow || petWindow.isDestroyed() || isQuitting) {
    return;
  }
  if (!petBoundsRestored || !petRendererReady) {
    petStartupShowPending = true;
    return;
  }
  petStartupShowPending = false;
  petWindow?.showInactive();
}

function maybeShowPetWindow(): void {
  if (petStartupShowPending) {
    showPetWindowInactive();
  }
}

function cancelPetPointerTransactions(): void {
  const hadTransaction = Boolean(petDragStart || petResizeStart);
  petDragStart = null;
  petResizeStart = null;
  syncPetWindowResizable();
  if (hadTransaction) {
    persistPetBounds(true);
    sendPetBoundsChanged();
  }
}

function createPetWindow(): void {
  petWindow = new BrowserWindow({
    width: 430,
    height: 600,
    title: '',
    minWidth: 240,
    minHeight: 240,
    frame: false,
    thickFrame: false,
    roundedCorners: false,
    autoHideMenuBar: true,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    show: false,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      preload: join(__dirname, '../preload/index.cjs')
    }
  });

  petWindow?.setTitle('');
  petWindow.setMenuBarVisibility(false);
  petWindow.setBackgroundColor('#00000000');
  applyPetWindowSettings();
  petWindow.setIgnoreMouseEvents(true, { forward: true });
  petWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  petWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[pet-renderer:${level}] ${message} (${sourceId}:${line})`);
  });
  petWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[pet-renderer] did-fail-load ${errorCode} ${errorDescription} ${validatedURL}`);
  });
  petWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[pet-renderer] render-process-gone ${details.reason}`);
  });
  restorePetBounds();
  petBoundsRestored = true;
  loadRenderer(petWindow, 'pet');
  petWindow.once('ready-to-show', () => {
    restorePetBounds();
    petBoundsRestored = true;
    maybeShowPetWindow();
  });
  petWindow.on('move', () => {
    persistPetBounds();
    sendPetBoundsChanged();
    arrangeInteractionTestWindow();
  });
  petWindow.on('resize', () => {
    persistPetBounds();
    sendPetBoundsChanged();
    arrangeInteractionTestWindow();
  });
  petWindow.on('blur', () => {
    cancelPetPointerTransactions();
  });
  petWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      petWindow?.hide();
    }
  });
  petWindow.on('closed', () => {
    petWindow = null;
    petBoundsRestored = false;
    petRendererReady = false;
    petStartupShowPending = true;
  });
}

function createSettingsWindow(): void {
  settingsWindow = new BrowserWindow({
    width: 900,
    height: 880,
    minWidth: 640,
    minHeight: 640,
    frame: false,
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    resizable: true,
    hasShadow: false,
    show: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(__dirname, '../preload/index.cjs')
    }
  });
  settingsWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  settingsWindow.webContents.on('did-finish-load', () => {
    // Keep wheel, touchpad and keyboard scrolling while removing the native
    // scrollbar chrome from the custom settings window.
    void settingsWindow?.webContents.insertCSS(`
      html, body, * { scrollbar-width: none !important; -ms-overflow-style: none !important; }
      html::-webkit-scrollbar, body::-webkit-scrollbar, *::-webkit-scrollbar {
        width: 0 !important; height: 0 !important; display: none !important;
      }
    `).catch((error) => console.warn('[settings-window] scrollbar CSS injection failed', error));
  });
  loadRenderer(settingsWindow, 'settings');
  settingsWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      settingsWindow?.hide();
    }
  });
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

function arrangeInteractionTestWindow(): void {
  if (!interactionTestEnabled || !clickTargetWindow || clickTargetWindow.isDestroyed() || !petWindow || petWindow.isDestroyed()) {
    return;
  }
  // Align the test page's client area with the PetWindow so its corner button
  // is a deterministic lower-window click target.
  clickTargetWindow.setContentBounds(petWindow.getBounds());
  // Keep the real lower target in the foreground Z-order while the transparent
  // Pet remains above it. The target must not be a second always-on-top peer:
  // otherwise a click-through assertion can be satisfied by a different app.
  clickTargetWindow.setAlwaysOnTop(true, 'floating', -1);
  petWindow.setAlwaysOnTop(true, 'floating', 1);
}

function createInteractionTestWindow(): void {
  if (!interactionTestEnabled) {
    return;
  }
  clickTargetWindow = new BrowserWindow({
    width: 430,
    height: 600,
    // This is a real lower native window used only by the click-through
    // evidence harness; it must be visible for User32 to receive the click.
    show: true,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    title: CLICK_TARGET_TITLE,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  clickTargetWindow.on('closed', () => {
    clickTargetWindow = null;
  });
  const html = `<!doctype html><meta charset="utf-8"><title>${CLICK_TARGET_TITLE}</title><style>body{margin:0;background:#fff8d8;color:#2d2410;font:16px sans-serif}button{position:absolute;left:20px;top:20px;padding:12px 18px;border:2px solid #5b481b;border-radius:8px;background:#ffd968;color:#2d2410;font-weight:700}#status{position:absolute;left:20px;top:76px}</style><button id="click-target-button">CLICK TARGET</button><div id="status">NOT_CLICKED</div><script>document.getElementById('click-target-button').addEventListener('click',()=>{document.getElementById('status').textContent='CLICKED';document.title='${CLICK_TARGET_TITLE}_CLICKED';document.body.dataset.clicked='true';});</script>`;
  void clickTargetWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  clickTargetWindow.once('ready-to-show', () => {
    arrangeInteractionTestWindow();
    // Keep the test-only native window addressable by the User32 evidence
    // harness. A packaged frameless BrowserWindow may otherwise retain the
    // renderer's app title even though its CDP page title is correct.
    clickTargetWindow?.setTitle(CLICK_TARGET_TITLE);
    app.focus({ steal: true });
    clickTargetWindow?.show();
    clickTargetWindow?.focus();
    // Showing inactive keeps the lower target as the foreground input window;
    // the Pet is still rendered above it through the floating Z-order level.
    showPetWindowInactive();
  });
}

function sendStateChanged(): void {
  const state = getPublicState();
  for (const window of [petWindow, settingsWindow]) {
    if (window && !window.isDestroyed()) {
      window.webContents.send('state:changed', state);
    }
  }
}

function centerPetWindow(): void {
  if (!petWindow || petWindow.isDestroyed()) {
    return;
  }
  const display = selectedDisplay();
  const workArea = display.workArea;
  const bounds = petWindow.getBounds();
  restoringPetBounds = true;
  petWindow.setBounds(safePetBounds({
    x: workArea.x + Math.round((workArea.width - bounds.width) / 2),
    y: workArea.y + Math.round((workArea.height - bounds.height) / 2),
    width: bounds.width,
    height: bounds.height
  }, display));
  restoringPetBounds = false;
  persistPetBounds(true);
  sendStateChanged();
  arrangeInteractionTestWindow();
}

function togglePetLock(): void {
  const enabled = petInteractionEnabled(getStore().readSettings());
  const next = getStore().save(petInteractionSettingsForEnabled(!enabled));
  if (next.petLocked && petModelEditMode) {
    setPetModelEditMode(false);
  }
  applyPetInputMode(petInteractionEnabled(next) ? 'interactive' : 'passthrough');
  sendStateChanged();
}

function toggleCursorTracking(): void {
  getStore().save({ cursorTrackingEnabled: !getStore().readSettings().cursorTrackingEnabled });
  sendStateChanged();
}

function applyPetInputMode(mode: PetInputMode, force = false): void {
  if (!petWindow || petWindow.isDestroyed()) {
    return;
  }
  const settings = getStore().readSettings();
  const interactive = mode === 'interactive' && (force || petModelEditMode || petInteractionEnabled(settings));
  petWindow.setIgnoreMouseEvents(!interactive, { forward: true });
}

function setPetModelEditMode(enabled: boolean): void {
  petModelEditMode = enabled && petInteractionEnabled(getStore().readSettings());
  syncPetWindowResizable();
  applyPetInputMode(petModelEditMode ? 'interactive' : 'passthrough', petModelEditMode);
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send('pet:model-edit-mode', petModelEditMode);
  }
}

function togglePetModelEditMode(): void {
  setPetModelEditMode(!petModelEditMode);
}

function togglePetInteractionMode(): void {
  togglePetLock();
}

function startCursorPolling(): void {
  if (cursorTimer) {
    return;
  }
  cursorTimer = setInterval(() => {
    if (!petWindow || petWindow.isDestroyed() || !petWindow.isVisible()) {
      return;
    }
    const point = screen.getCursorScreenPoint();
    const bounds = petWindow.getBounds();
    const moving = !lastCursorPoint || point.x !== lastCursorPoint.x || point.y !== lastCursorPoint.y;
    lastCursorPoint = point;
    const update: CursorUpdate = {
      screenX: point.x,
      screenY: point.y,
      localX: (point.x - bounds.x) / Math.max(1, bounds.width),
      localY: (point.y - bounds.y) / Math.max(1, bounds.height),
      windowWidth: bounds.width,
      windowHeight: bounds.height,
      insideWindow: point.x >= bounds.x && point.x <= bounds.x + bounds.width && point.y >= bounds.y && point.y <= bounds.y + bounds.height,
      moving,
      timestamp: Date.now()
    };
    petWindow.webContents.send('cursor:update', update);
  }, 33);
}

function stopCursorPolling(): void {
  if (cursorTimer) {
    clearInterval(cursorTimer);
    cursorTimer = null;
  }
  lastCursorPoint = null;
}

function toggleSettings(): void {
  if (!settingsWindow || settingsWindow.isDestroyed()) {
    createSettingsWindow();
    settingsWindow?.show();
    settingsWindow?.focus();
    return;
  }
  if (settingsWindow.isVisible()) {
    settingsWindow.hide();
  } else {
    settingsWindow.show();
    settingsWindow.focus();
  }
}

function createTray(): void {
  const iconPath = app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(app.getAppPath(), 'build', 'icon.png');
  tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 32, height: 32 }));
  tray.setToolTip('白音 AI 助手 · 外部 Live2D 桌宠');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '打开设置', click: () => { settingsWindow?.show(); settingsWindow?.focus(); } },
      { label: '开启/关闭桌宠交互', click: togglePetInteractionMode },
      { label: '显示/隐藏桌宠', click: () => petWindow?.isVisible() ? petWindow.hide() : showPetWindowInactive() },
      { label: '桌宠回中', click: centerPetWindow },
      { type: 'separator' },
      { label: '退出白音', click: () => app.quit() }
    ])
  );
  tray.on('double-click', toggleSettings);
}

function registerSettingsShortcut(): void {
  const shortcut = getStore().readSettings().settingsShortcut;
  if (registeredSettingsShortcut && registeredSettingsShortcut !== shortcut) {
    globalShortcut.unregister(registeredSettingsShortcut);
    registeredSettingsShortcut = '';
  }
  if (!shortcut || registeredSettingsShortcut === shortcut) {
    return;
  }
  if (globalShortcut.register(shortcut, toggleSettings)) {
    registeredSettingsShortcut = shortcut;
  }
}

function registerInteractionShortcut(): void {
  globalShortcut.register(INTERACTION_SHORTCUT, togglePetInteractionMode);
}

function showPetContextMenu(): void {
  if (!petWindow || petWindow.isDestroyed()) {
    return;
  }
  const locked = !petInteractionEnabled(getStore().readSettings());
  Menu.buildFromTemplate([
    { label: '打开设置', click: () => { settingsWindow?.show(); settingsWindow?.focus(); } },
    { label: locked ? '开启桌宠交互' : '关闭交互并锁定', click: togglePetInteractionMode },
    { label: '桌宠回中', click: centerPetWindow },
    { type: 'separator' },
    { label: '退出白音', click: () => app.quit() }
  ]).popup({ window: petWindow });
}

function normalizeHistory(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter(
      (message): message is ChatMessage =>
        typeof message === 'object' &&
        message !== null &&
        ['user', 'assistant', 'system'].includes((message as ChatMessage).role) &&
        typeof (message as ChatMessage).content === 'string'
    )
    .slice(-20);
}

async function runChat(
  sender: Electron.WebContents,
  requestId: string,
  request: StartChatRequest,
  controller: AbortController
): Promise<void> {
  const settings = getStore().readSettings();
  const apiKey = getStore().readSecrets().apiKey;
  const message = request.message.trim();
  if (!apiKey) {
    throw new Error('请先在设置中保存 API Key');
  }
  if (!message) {
    throw new Error('消息不能为空');
  }

  const snapshot = getStore().createPersonalityRequestSnapshot();
  const before = getStore().readCompanionState(snapshot.roleId);
  const messages: ChatMessage[] = [
    { role: 'system', content: buildCompanionSystemPrompt(snapshot, before) },
    ...(settings.systemPrompt ? [{ role: 'system', content: settings.systemPrompt } as ChatMessage] : []),
    ...normalizeHistory(request.history).filter((item) => item.role !== 'system'),
    { role: 'user', content: message }
  ];

  let responseText = '';
  let beganReply = false;
  const thinking = snapshot.semanticMappings.thinking;
  sendAssistantPresentation({ type: 'expression', name: thinking?.expression ?? 'confused_blank', source: 'assistant', layer: 'reply_state' });
  sendAssistantPresentation({ type: 'action', name: thinking?.action ?? 'thinking', source: 'assistant', layer: 'reply_state' });
  for await (const delta of streamChatCompletion({
    settings,
    apiKey,
    messages,
    signal: controller.signal
  })) {
    responseText += delta;
    if (!beganReply) {
      beganReply = true;
      sendAssistantPresentation({ type: 'expression', name: 'caring_smile', source: 'assistant', layer: 'reply_state' });
      sendAssistantPresentation({ type: 'action', name: 'lean_forward', source: 'assistant', layer: 'reply_state' });
    }
    sendChatEvent(sender, { type: 'delta', requestId, delta });
  }
  const nextCompanion = getStore().saveCompanionState(recordCompanionExchange(before, snapshot, message, responseText));
  sendChatEvent(sender, { type: 'complete', requestId, response: responseText, companion: companionSummary(nextCompanion, snapshot.relationshipStages) });
  sendStateChanged();
}

function registerIpc(): void {
  ipcMain.handle('state:get', () => getPublicState());
  ipcMain.handle('tts:synthesize', async (event, request: { text?: unknown }) => {
    if (BrowserWindow.fromWebContents(event.sender) !== settingsWindow) throw new Error('只允许设置窗口请求语音');
    const text = typeof request?.text === 'string' ? request.text : '';
    const settings = getStore().readSettings();
    const profile = settings.cosyVoiceMode === 'zero-shot'
      ? voiceProfileStore.list().find((item) => item.id === settings.activeVoiceProfileId)
      : undefined;
    if (settings.cosyVoiceMode === 'zero-shot' && !profile) throw new Error('请先导入并选择一个自定义音色');
    await ensureCosyVoiceService(settings.cosyVoiceBaseUrl, cosyVoiceProjectRoots(), settings.cosyVoiceMode);
    return synthesizeCosyVoice(text, settings, profile ? {
      promptText: profile.promptText,
      promptWav: new Uint8Array(readFileSync(voiceProfileStore.audioPath(profile.id)))
    } : undefined);
  });
  ipcMain.handle('voices:import', async (event, request: { name?: unknown; promptText?: unknown }) => {
    if (BrowserWindow.fromWebContents(event.sender) !== settingsWindow) throw new Error('只允许设置窗口导入音色');
    const result = await dialog.showOpenDialog(settingsWindow!, {
      title: '选择 3–30 秒参考 WAV', properties: ['openFile'], filters: [{ name: 'WAV 音频', extensions: ['wav'] }]
    });
    if (!result.canceled && result.filePaths[0]) {
      const profile = voiceProfileStore.importWav(result.filePaths[0], {
        name: typeof request?.name === 'string' ? request.name : '',
        promptText: typeof request?.promptText === 'string' ? request.promptText : ''
      });
      getStore().save({ cosyVoiceMode: 'zero-shot', activeVoiceProfileId: profile.id });
      sendStateChanged();
    }
    return getPublicState();
  });
  ipcMain.handle('voices:activate', (event, request: { id?: unknown }) => {
    if (BrowserWindow.fromWebContents(event.sender) !== settingsWindow) throw new Error('只允许设置窗口切换音色');
    const id = typeof request?.id === 'string' ? request.id : null;
    if (id && !voiceProfileStore.list().some((item) => item.id === id)) throw new Error('音色不存在');
    getStore().save({ cosyVoiceMode: id ? 'zero-shot' : 'sft', activeVoiceProfileId: id });
    sendStateChanged(); return getPublicState();
  });
  ipcMain.handle('voices:delete', (event, request: { id?: unknown }) => {
    if (BrowserWindow.fromWebContents(event.sender) !== settingsWindow) throw new Error('只允许设置窗口删除音色');
    const id = typeof request?.id === 'string' ? request.id : '';
    voiceProfileStore.delete(id);
    if (getStore().readSettings().activeVoiceProfileId === id) getStore().save({ cosyVoiceMode: 'sft', activeVoiceProfileId: null });
    sendStateChanged(); return getPublicState();
  });
  ipcMain.handle('voices:preview', async (event, request: { id?: unknown; text?: unknown }) => {
    if (BrowserWindow.fromWebContents(event.sender) !== settingsWindow) throw new Error('只允许设置窗口试听音色');
    const profile = voiceProfileStore.list().find((item) => item.id === request?.id);
    if (!profile) throw new Error('音色不存在');
    const settings = getStore().readSettings();
    await ensureCosyVoiceService(settings.cosyVoiceBaseUrl, cosyVoiceProjectRoots(), 'zero-shot');
    return synthesizeCosyVoice(typeof request.text === 'string' ? request.text : '你好，我是白音。', settings, {
      promptText: profile.promptText,
      promptWav: new Uint8Array(readFileSync(voiceProfileStore.audioPath(profile.id)))
    });
  });
  ipcMain.handle('settings:save', (_event, request: SaveSettingsRequest) => {
    const store = getStore();
    const previousSettings = store.readSettings();
    const previousPath = previousSettings.live2dModelPath;
    const candidate = {
      ...store.readSettings(),
      ...request.settings
    };
    const live2d = inspectExternalLive2DModel(candidate.live2dModelPath);
    if (live2d.status === 'invalid') {
      throw new Error(live2d.issues[0] ?? '外部 Live2D 模型路径无效');
    }
    if (
      candidate.live2dModelPath &&
      candidate.live2dModelPath !== previousPath &&
      request.licenseAccepted !== true
    ) {
      throw new Error('切换外部模型前，请确认你已获得该模型及其资源的使用许可。');
    }
    const activeRoleId = getStore().readRolePackages().some((role) => role.id === candidate.activeRoleId)
      ? candidate.activeRoleId
      : DEFAULT_ROLE_PACKAGE.id;
    const next = store.save(
      { ...request.settings, activeRoleId },
      request.apiKey,
      request.clearApiKey,
      live2d.adapter
    );
    if (next.petLocked && petModelEditMode) {
      setPetModelEditMode(false);
    }
    applyPetWindowSettings();
    if (next.petDisplayId !== previousSettings.petDisplayId) {
      restorePetBounds();
    }
    if (petWindow && !petWindow.isDestroyed() && next.petBounds) {
      const previousBounds = previousSettings.petBounds;
      const boundsChanged = !previousBounds || ['x', 'y', 'width', 'height'].some((key) => previousBounds[key as keyof typeof previousBounds] !== next.petBounds?.[key as keyof typeof next.petBounds]);
      if (boundsChanged) {
        petWindow.setBounds(safePetBounds(next.petBounds, selectedDisplay()));
        persistPetBounds();
      }
    }
    registerSettingsShortcut();
    sendStateChanged();
    return getPublicState();
  });
  ipcMain.handle('roles:save', (event, request: RoleSaveRequest) => {
    if (BrowserWindow.fromWebContents(event.sender) !== settingsWindow) {
      throw new Error('只有设置窗口可以保存角色包');
    }
    const role = validateRolePackage(request?.role);
    getStore().saveRolePackage(role);
    if (getStore().readSettings().activeRoleId === role.id) sendStateChanged();
    return getPublicState();
  });
  ipcMain.handle('roles:activate', (event, request: RoleIdRequest) => {
    if (BrowserWindow.fromWebContents(event.sender) !== settingsWindow) {
      throw new Error('只有设置窗口可以切换角色包');
    }
    const role = getStore().readRolePackages().find((item) => item.id === request?.id);
    if (!role) throw new Error('角色包不存在');
    getStore().save({ activeRoleId: role.id });
    sendStateChanged();
    return getPublicState();
  });
  ipcMain.handle('roles:delete', (event, request: RoleIdRequest) => {
    if (BrowserWindow.fromWebContents(event.sender) !== settingsWindow) {
      throw new Error('只有设置窗口可以删除角色包');
    }
    if (request?.id === DEFAULT_ROLE_PACKAGE.id) throw new Error('默认白音人格不可删除');
    getStore().deleteRolePackage(request?.id ?? '');
    if (getStore().readSettings().activeRoleId === request?.id) getStore().save({ activeRoleId: DEFAULT_ROLE_PACKAGE.id });
    sendStateChanged();
    return getPublicState();
  });
  ipcMain.handle('roles:import', async (event) => {
    if (BrowserWindow.fromWebContents(event.sender) !== settingsWindow) {
      throw new Error('只有设置窗口可以导入角色包');
    }
    const result = await dialog.showOpenDialog(settingsWindow!, {
      title: '导入白音角色包',
      properties: ['openFile'],
      filters: [{ name: 'JSON 角色包', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePaths[0]) return getPublicState();
    const imported = validateRolePackage(JSON.parse(readFileSync(result.filePaths[0], 'utf8')));
    const id = imported.id === DEFAULT_ROLE_PACKAGE.id ? `role.${randomUUID()}` : imported.id;
    getStore().saveRolePackage({ ...imported, id });
    sendStateChanged();
    return getPublicState();
  });
  ipcMain.handle('roles:export', async (event, request: RoleIdRequest) => {
    if (BrowserWindow.fromWebContents(event.sender) !== settingsWindow) {
      throw new Error('只有设置窗口可以导出角色包');
    }
    const role = getStore().readRolePackages().find((item) => item.id === request?.id);
    if (!role) throw new Error('角色包不存在');
    const result = await dialog.showSaveDialog(settingsWindow!, {
      title: '导出白音角色包',
      defaultPath: `${role.id}.role.json`,
      filters: [{ name: 'JSON 角色包', extensions: ['json'] }]
    });
    if (!result.canceled && result.filePath) writeFileSync(result.filePath, JSON.stringify(role, null, 2), 'utf8');
    return result.filePath ?? null;
  });
  ipcMain.on('cubism:debug-command', (event, command: CubismDebugCommand) => {
    if (BrowserWindow.fromWebContents(event.sender) !== settingsWindow || !isSafeCubismDebugCommand(command)) {
      return;
    }
    if (petWindow && !petWindow.isDestroyed()) {
      petWindow.webContents.send('cubism:debug-command', command);
    }
  });
  ipcMain.on('cubism:metrics', (event, request: CubismDebugMetricRequest) => {
    if (BrowserWindow.fromWebContents(event.sender) !== petWindow || !isSafeCubismMetrics(request)) {
      return;
    }
    latestCubismMetrics = request.metrics;
  });
  ipcMain.handle('cubism:metrics', (event) => {
    const sourceWindow = BrowserWindow.fromWebContents(event.sender);
    if (sourceWindow !== settingsWindow && sourceWindow !== petWindow) {
      return null;
    }
    return latestCubismMetrics;
  });
  ipcMain.handle('live2d:inspect', (_event, request: { path: string }) =>
    inspectExternalLive2DModel(request?.path ?? null)
  );
  ipcMain.handle('live2d:choose-file', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择 Live2D model3.json',
      properties: ['openFile'],
      filters: [{ name: 'Live2D model3', extensions: ['model3.json'] }]
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
  ipcMain.handle('live2d:choose-directory', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择 Live2D 模型目录',
      properties: ['openDirectory']
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
  ipcMain.handle('display:list', () => screen.getAllDisplays().map(displaySummary));
  ipcMain.handle('window:visibility', (event) => {
    const sourceWindow = BrowserWindow.fromWebContents(event.sender);
    return {
      role: sourceWindow === petWindow ? 'pet' : 'settings',
      petVisible: Boolean(petWindow && !petWindow.isDestroyed() && petWindow.isVisible()),
      settingsVisible: Boolean(settingsWindow && !settingsWindow.isDestroyed() && settingsWindow.isVisible())
    };
  });
  ipcMain.on('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });
  ipcMain.on('window:close', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window === settingsWindow) {
      settingsWindow?.hide();
    } else if (window === petWindow) {
      petWindow?.hide();
    }
  });
  ipcMain.on('settings:show', () => {
    if (!settingsWindow || settingsWindow.isDestroyed()) {
      createSettingsWindow();
    }
    settingsWindow?.show();
    settingsWindow?.focus();
  });
  ipcMain.on('settings:hide', () => settingsWindow?.hide());
  ipcMain.on('settings:toggle', toggleSettings);
  ipcMain.on('pet:runtime-ready', (event) => {
    if (BrowserWindow.fromWebContents(event.sender) !== petWindow) {
      return;
    }
    petRendererReady = true;
    maybeShowPetWindow();
  });
  ipcMain.on('pet:show', (event) => {
    const sourceWindow = BrowserWindow.fromWebContents(event.sender);
    if (sourceWindow === settingsWindow || sourceWindow === petWindow) {
      showPetWindowInactive();
      petWindow?.setAlwaysOnTop(true, 'floating', 1);
    }
  });
  ipcMain.on('pet:center', (event) => {
    const sourceWindow = BrowserWindow.fromWebContents(event.sender);
    if (sourceWindow === settingsWindow || sourceWindow === petWindow) {
      centerPetWindow();
    }
  });
  ipcMain.handle('pet:bounds', (event) => {
    const sourceWindow = BrowserWindow.fromWebContents(event.sender);
    if (sourceWindow !== settingsWindow && sourceWindow !== petWindow) {
      return null;
    }
    return petWindow && !petWindow.isDestroyed() ? petWindow.getBounds() : null;
  });
  ipcMain.on('pet:preview-bounds', (event, input: WindowBounds) => {
    if (BrowserWindow.fromWebContents(event.sender) !== settingsWindow || !petWindow || petWindow.isDestroyed()) {
      return;
    }
    if (![input?.x, input?.y, input?.width, input?.height].every(Number.isFinite)) {
      return;
    }
    restoringPetBounds = true;
    petWindow.setBounds(safePetBounds(input, selectedDisplay()));
    restoringPetBounds = false;
    sendPetBoundsChanged();
  });
  ipcMain.on('pet:context-menu', (event) => {
    if (BrowserWindow.fromWebContents(event.sender) === petWindow) {
      showPetContextMenu();
    }
  });
  ipcMain.on('pet:set-input-mode', (event, mode: PetInputMode) => {
    if (BrowserWindow.fromWebContents(event.sender) !== petWindow) {
      return;
    }
    if (mode === 'interactive' || mode === 'passthrough') {
      applyPetInputMode(mode);
    }
  });
  ipcMain.on('pet:toggle-model-edit', (event) => {
    const sourceWindow = BrowserWindow.fromWebContents(event.sender);
    if (sourceWindow === settingsWindow || sourceWindow === petWindow) {
      togglePetModelEditMode();
    }
  });
  ipcMain.on('pet:drag-start', (event, point: PetDragPoint) => {
    if (
      BrowserWindow.fromWebContents(event.sender) === petWindow &&
      petInteractionEnabled(getStore().readSettings()) &&
      Number.isFinite(point?.screenX) &&
      Number.isFinite(point?.screenY) &&
      petWindow
    ) {
      petDragStart = { point, bounds: petWindow.getBounds() };
      // The custom renderer drag is position-only. Keep the native resize
      // frame disabled while User32 holds the mouse button, so a transparent
      // frameless hit-test cannot resize the BrowserWindow.
      petWindow.setResizable(false);
    }
  });
  ipcMain.on('pet:drag-move', (event, point: PetDragPoint) => {
    if (BrowserWindow.fromWebContents(event.sender) !== petWindow || !petDragStart || !petWindow) {
      return;
    }
    const nextBounds = nextPetDragBounds(petDragStart.bounds, petDragStart.point, point);
    petWindow.setPosition(nextBounds.x, nextBounds.y);
  });
  ipcMain.on('pet:drag-end', (event) => {
    if (BrowserWindow.fromWebContents(event.sender) === petWindow) {
      petDragStart = null;
      syncPetWindowResizable();
      persistPetBounds(true);
    }
  });
  ipcMain.on('pet:resize-start', (event, request: PetResizeStart) => {
    if (BrowserWindow.fromWebContents(event.sender) !== petWindow || !petWindow || !petInteractionEnabled(getStore().readSettings())) return;
    if (!request || !Number.isFinite(request.screenX) || !Number.isFinite(request.screenY) || !['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].includes(request.edge)) return;
    petResizeStart = { request, bounds: petWindow.getBounds(), display: selectedDisplay() };
  });
  ipcMain.on('pet:resize-move', (event, point: PetDragPoint) => {
    if (BrowserWindow.fromWebContents(event.sender) !== petWindow || !petWindow || !petResizeStart) return;
    const next = nextPetResizeBounds(petResizeStart.bounds, petResizeStart.request, point, petResizeStart.request.edge);
    petWindow.setBounds(safePetBounds(next, petResizeStart.display));
  });
  ipcMain.on('pet:resize-end', (event) => {
    if (BrowserWindow.fromWebContents(event.sender) !== petWindow) return;
    petResizeStart = null;
    persistPetBounds(true);
  });
  ipcMain.on('presentation:emit', (event, payload: PresentationEvent) => {
    const sourceWindow = BrowserWindow.fromWebContents(event.sender);
    if (sourceWindow !== settingsWindow || !isSafePresentationEvent(payload)) {
      return;
    }
    if (petWindow && !petWindow.isDestroyed()) {
      petWindow.webContents.send('presentation:event', payload);
    }
  });
  ipcMain.on('baoyin:settings-preview', (event, detail: SettingsPreviewDetail) => {
    const source = BrowserWindow.fromWebContents(event.sender);
    if (source === petWindow && detail?.domain === 'settings') {
      if (!detail.patch || Object.keys(detail.patch).some((key) => key !== 'modelViewportByModel')) return;
      settingsWindow?.webContents.send('baoyin:settings-preview', detail);
      return;
    }
    if (source !== settingsWindow || !detail || detail.domain !== 'presentation') return;
    if (!detail.patch || typeof detail.patch !== 'object') return;
    const allowed = new Set(['bodyFollowStrength', 'bodyLag', 'inertiaStrength', 'idleSwayStrength', 'physicsEnabled']);
    if (Object.keys(detail.patch).some((key) => !allowed.has(key))) return;
    petWindow?.webContents.send('baoyin:settings-preview', detail);
  });
  ipcMain.handle('chat:start', (event, request: StartChatRequest) => {
    const requestId = randomUUID();
    const controller = new AbortController();
    activeRequests.set(requestId, controller);
    void runChat(event.sender, requestId, request, controller)
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : '对话请求失败';
        sendChatEvent(event.sender, { type: 'error', requestId, message });
      })
      .finally(() => activeRequests.delete(requestId));
    return requestId;
  });
  ipcMain.handle('chat:cancel', (_event, requestId: string) => {
    activeRequests.get(requestId)?.abort();
  });
}

if (singleInstanceLock) {
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    settingsStore = new SettingsStore(app.getPath('userData'));
    voiceProfileStore = new VoiceProfileStore(app.getPath('userData'));
    const settings = settingsStore.readSettings();
    void ensureCosyVoiceService(settings.cosyVoiceBaseUrl, cosyVoiceProjectRoots(), settings.cosyVoiceMode)
      .catch((error: unknown) => console.warn('CosyVoice startup failed:', error));
    registerLive2DProtocol();
    registerIpc();
    createPetWindow();
    createSettingsWindow();
    createInteractionTestWindow();
    createTray();
    registerSettingsShortcut();
    registerInteractionShortcut();
    startCursorPolling();
    app.on('activate', () => {
      showPetWindowInactive();
    });
  });
}

app.on('window-all-closed', () => {
  if (isQuitting && process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  persistPetBounds(true);
  isQuitting = true;
  stopCursorPolling();
  stopManagedCosyVoiceService();
  globalShortcut.unregisterAll();
  tray?.destroy();
  tray = null;
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send('runtime:release');
  }
  if (clickTargetWindow && !clickTargetWindow.isDestroyed()) {
    clickTargetWindow.destroy();
    clickTargetWindow = null;
  }
  for (const controller of activeRequests.values()) {
    controller.abort();
  }
});

function isSafePresentationEvent(value: unknown): value is PresentationEvent {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const event = value as Partial<PresentationEvent>;
  if (event.type === 'speech') {
    const mouthOpen = event.mouthOpen;
    const mouthForm = event.mouthForm;
    const timestamp = event.timestamp;
    return event.source === 'assistant'
      && typeof event.speaking === 'boolean'
      && (mouthOpen === undefined || (Number.isFinite(mouthOpen) && mouthOpen >= 0 && mouthOpen <= 1))
      && (mouthForm === undefined || (Number.isFinite(mouthForm) && mouthForm >= -1 && mouthForm <= 1))
      && (timestamp === undefined || Number.isFinite(timestamp));
  }
  if (event.source !== 'system' && event.source !== 'assistant') {
    return false;
  }
  const layers: PresentationLayer[] = [
    'manual', 'safety', 'special_action', 'dialogue_emotion', 'reply_state',
    'cursor_gaze', 'idle_action', 'breathing_blink'
  ];
  const eventLayer = (event as { layer?: PresentationLayer }).layer;
  if (eventLayer !== undefined && !layers.includes(eventLayer)) {
    return false;
  }
  if (event.type === 'expression') {
    return SEMANTIC_EXPRESSIONS.includes(event.name as (typeof SEMANTIC_EXPRESSIONS)[number]);
  }
  if (event.type === 'action') {
    return SEMANTIC_ACTIONS.includes(event.name as (typeof SEMANTIC_ACTIONS)[number]);
  }
  if (event.type === 'control') {
    return event.source === 'system' && (event.name === 'stop_action' || event.name === 'stop_expression' || event.name === 'neutral');
  }
  return false;
}

const DEBUG_PARAMETER_IDS = new Set([
  'ParamAngleX', 'ParamAngleY', 'ParamAngleZ',
  'ParamBodyAngleX', 'ParamBodyAngleY', 'ParamBodyAngleZ',
  'ParamEyeBallX', 'ParamEyeBallY', 'ParamEyeLOpen', 'ParamEyeROpen',
  'ParamBrowLX', 'ParamBrowRX', 'ParamBrowLY', 'ParamBrowRY',
  'ParamMouthOpenY', 'ParamMouthForm', 'ParamBreath'
]);

function isSafeCubismDebugCommand(value: unknown): value is CubismDebugCommand {
  if (!value || typeof value !== 'object') return false;
  const command = value as Partial<CubismDebugCommand>;
  if (command.type === 'reset') return true;
  if (command.type === 'control') {
    return command.name === 'neutral' || command.name === 'stop_expression' || command.name === 'stop_action';
  }
  if (command.type !== 'parameter' || !command.patch || typeof command.patch !== 'object') return false;
  const patch = command.patch;
  return DEBUG_PARAMETER_IDS.has(patch.id) && Number.isFinite(patch.value) &&
    (patch.weight === undefined || Number.isFinite(patch.weight));
}

function isSafeCubismMetrics(value: unknown): value is CubismDebugMetricRequest {
  if (!value || typeof value !== 'object' || !('metrics' in value)) return false;
  const metrics = (value as { metrics?: unknown }).metrics;
  return Boolean(metrics && typeof metrics === 'object' &&
    typeof (metrics as { status?: unknown }).status === 'string' &&
    typeof (metrics as { fps?: unknown }).fps === 'number' &&
    typeof (metrics as { frameCount?: unknown }).frameCount === 'number');
}
