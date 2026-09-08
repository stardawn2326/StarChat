import { randomUUID } from 'node:crypto';
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  protocol,
  safeStorage,
  screen,
  shell,
  Tray
} from 'electron';
import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_ROLE_PACKAGE, isBuiltinRoleId } from '../shared/default-role';
import type {
  AgentApproveRequest,
  AgentEvent,
  AgentRespondRequest,
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
  CubismRuntimeCommand,
  CubismRuntimeCommandResult,
  ConnectionTestRequest,
  ConnectionTestResult,
  Live2DModelIdRequest,
  Live2DModelImportResult,
  Live2DRuntimeFailure,
  RoleIdRequest,
  RoleSaveRequest,
  SaveSettingsRequest,
  SettingsPreviewDetail,
  StartChatRequest
} from '../shared/ipc';
import { sanitizeAgentStartRequest, type AgentStartRequest } from '../shared/agent';
import { SEMANTIC_ACTIONS, SEMANTIC_EXPRESSIONS, validateRolePackage } from '../shared/role-package';
import type { CubismRuntimeCapabilities, CubismRuntimeMetrics, CubismRuntimePhase, CubismRuntimeResult, CubismRuntimeStatus } from '../shared/cubism';
import { isSafeCubismRuntimeCommand } from '../shared/cubism-runtime-command';
import type { PresentationEvent, PresentationLayer } from '../shared/presentation';
import { clampPetWindowBounds, nextPetResizeBounds, sameWindowBounds, type PetBoundsChange, type PetPointerOperation, type WindowBounds } from '../shared/window-contract';
import { petInteractionEnabled, petInteractionSettingsForEnabled } from '../shared/pet-interaction';
import { streamChatCompletion, testChatConnection } from './api/openai-compatible';
import { createSafeStorageAdapter, SettingsStore } from './settings-store';
import { inspectExternalLive2DModel } from './live2d-importer';
import { Live2DModelRegistry, Live2DModelRegistryError, type Live2DModelInspection } from './live2d-model-registry';
import { nextPetDragBounds } from './window-drag';
import { buildCompanionSystemPrompt, companionSummary, recordCompanionExchange } from '../shared/companion';
import { synthesizeCosyVoice } from './tts/cosyvoice';
import { ensureCosyVoiceService, stopManagedCosyVoiceService } from './tts/cosyvoice-service';
import { VoiceProfileStore } from './voice-profile-store';
import { CubismRuntimeSession } from './cubism-runtime-session';
import { AgentStore } from './agent-store';
import { AgentService } from './agent-service';
import { SessionStore } from './session-store';
import { MemoryStore } from './memory-store';
import { MemoryService } from './memory-service';
import { migrateLegacyCompanionMemories } from './memory-migration';
import { migrateMemorySchema } from './memory-schema-migration';
import { Live2DAdapterStore } from './live2d-adapter-store';
import { personalMemoryScope } from '../shared/memory-scope';
import type { SessionRenameRequest, SessionSnapshot, WorkspaceTrustState } from '../shared/session';
import { createOpenAICompatibleAgentModel, classifyAmbiguousWithModel } from './agent-model';
import { routeTurn } from './agent-router';
import { commitWorkbenchStaged, formatWorkbenchShare, inspectWorkbench, normalizeWorkbenchUrl, previewWorkbenchFile, readWorkbenchDiff, runWorkbenchCommand } from './workbench-service';
import { runVerification } from './agent-tools';
import { isIpcWindow, requireIpcWindow } from './ipc-guard';
import {
  resolveWorkbenchWindowState,
  WORKBENCH_MIN_SIZE
} from './window-state';
import { migrateLegacyStarChatData } from './brand-migration';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
let petWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let clickTargetWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let settingsStore: SettingsStore;
let voiceProfileStore: VoiceProfileStore;
let live2dRegistry: Live2DModelRegistry;
let live2dAdapterStore: Live2DAdapterStore;
let agentStore: AgentStore;
let agentService: AgentService;
let sessionStore: SessionStore;
let memoryService: MemoryService;
let isQuitting = false;
let restoringPetBounds = false;
let petBoundsPersistTimer: ReturnType<typeof setTimeout> | null = null;
let workbenchWindowPersistTimer: ReturnType<typeof setTimeout> | null = null;
let registeredSettingsShortcut = '';
const INTERACTION_SHORTCUT = 'CommandOrControl+Alt+I';
let petDragStart: { point: PetDragPoint; bounds: Electron.Rectangle } | null = null;
let petResizeStart: { request: PetResizeStart; bounds: Electron.Rectangle; display: Electron.Display } | null = null;
let petModelEditMode = false;
let petBoundsRestored = false;
let petRendererReady = false;
let petRuntimeCommandSubscribed = false;
let petStartupShowPending = false;
let workbenchCharacterVisible = true;
let cursorTimer: ReturnType<typeof setInterval> | null = null;
let lastCursorPoint: { x: number; y: number } | null = null;
let latestCubismMetrics: CubismRuntimeMetrics | null = null;
let activePetContextMenu: { menu: Menu; owner: BrowserWindow | null } | null = null;
interface PendingCubismRuntimeCommand {
  command: CubismRuntimeCommand;
  resolve: (result: CubismRuntimeResult) => void;
  timer: ReturnType<typeof setTimeout>;
  retryTimer: ReturnType<typeof setTimeout> | null;
  identity: string | null;
  attempts: number;
}

const pendingCubismRuntimeCommands = new Map<string, PendingCubismRuntimeCommand>();
const cubismRuntimeSession = new CubismRuntimeSession();
const activeRequests = new Map<string, AbortController>();
const agentTaskSenders = new Map<string, Electron.WebContents>();

interface PendingLive2DSwitch {
  token: string;
  previousPath: string | null;
  previousModelId: string | null;
  previousAdapter: ReturnType<Live2DAdapterStore['read']>;
  candidate: Live2DModelInspection;
  resolve: (state: PublicAppState) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

let pendingLive2DSwitch: PendingLive2DSwitch | null = null;

const LIVE2D_PROTOCOL = 'live2d';
const LIVE2D_MODEL_BASE = 'live2d://model/';
const CLICK_TARGET_TITLE = 'STARCHAT_CLICK_TARGET';
const interactionTestEnabled = process.env.STARCHAT_INTERACTION_TEST === '1' || process.argv.includes('--starchat-interaction-test');
const singleInstanceLock = app.requestSingleInstanceLock();

function appIconPath(): string {
  return app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(app.getAppPath(), 'build', 'icon.png');
}

function trayIconPath(): string {
  return app.isPackaged ? join(process.resourcesPath, 'tray-32.png') : join(app.getAppPath(), 'build', 'tray-32.png');
}

function cosyVoiceProjectRoots(): string[] {
  const portableExecutableDir = process.env.PORTABLE_EXECUTABLE_DIR;
  return [
    process.env.STARCHAT_COSYVOICE_PROJECT_ROOT ?? '',
    portableExecutableDir ? resolve(portableExecutableDir, '..') : '',
    resolve(app.getAppPath(), '..'),
    resolve(dirname(process.execPath), '..'),
    process.cwd()
  ].filter(Boolean);
}

function agentWorkspaceRoot(): string {
  const configured = process.env.STARCHAT_AGENT_WORKSPACE_ROOT?.trim();
  return configured && isAbsolute(configured) ? configured : resolve(app.getAppPath(), '..');
}

if (!singleInstanceLock) {
  void app.quit();
} else {
  app.on('second-instance', () => {
    showSettingsWindow();
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

function getLive2DRegistry(): Live2DModelRegistry {
  if (!live2dRegistry) {
    throw new Error('Live2D 模型注册表尚未初始化');
  }
  return live2dRegistry;
}

function getLive2DAdapterStore(): Live2DAdapterStore {
  if (!live2dAdapterStore) {
    throw new Error('Live2D 适配器存储尚未初始化');
  }
  return live2dAdapterStore;
}

function getPublicState(): PublicAppState {
  const store = getStore();
  const settings = store.readSettings();
  const registry = getLive2DRegistry();
  const legacyRecord = registry.ensureLegacyPath(settings.live2dModelPath);
  if (legacyRecord && registry.current()?.id !== legacyRecord.id) {
    registry.setCurrentModel(legacyRecord.id);
  }
  const adapterStore = getLive2DAdapterStore();
  adapterStore.migrateLegacy(join(app.getPath('userData'), 'live2d-adapter.json'), registry.list());
  const inspectedLive2d = inspectExternalLive2DModel(settings.live2dModelPath);
  const currentRecord = settings.live2dModelPath ? registry.findByEntryPath(settings.live2dModelPath) : null;
  const resolvedAdapter = currentRecord ? adapterStore.resolve(currentRecord, inspectedLive2d.adapter) : inspectedLive2d.adapter;
  const live2d = resolvedAdapter && resolvedAdapter !== inspectedLive2d.adapter
    ? { ...inspectedLive2d, adapter: resolvedAdapter }
    : inspectedLive2d;
  const roles = store.readRolePackages();
  const role = roles.find((item) => item.id === settings.activeRoleId) ?? roles[0] ?? DEFAULT_ROLE_PACKAGE;
  const companion = store.readCompanionState(role.id);
  return {
    settings,
    hasApiKey: store.hasApiKey(),
    role,
    roles,
    live2d,
    live2dModels: registry.list(),
    companion: companionSummary(companion, role.personality.relationshipStages, memoryService?.listProfile(role.id).length ?? 0),
    voices: voiceProfileStore.list(),
    memories: memoryService?.listProfile(role.id) ?? []
  };
}

function sendChatEvent(sender: Electron.WebContents, event: ChatEvent): void {
  if (!sender.isDestroyed()) {
    sender.send('chat:event', event);
  }
}

function sendAgentEvent(event: AgentEvent): void {
  if (event.type === 'complete') {
    const task = agentStore?.get(event.taskId);
    if (task) {
      publishSessionSnapshot(sessionStore.appendMessage(task.sessionId, { role: 'assistant', content: event.result.summary }));
      recordMemoryForSession(task.roleId, task.sessionId, 'agent');
    }
  }
  const sender = agentTaskSenders.get(event.taskId);
  if (sender && !sender.isDestroyed()) sender.send('agent:event', event);
  if (event.type === 'complete' || event.type === 'error') agentTaskSenders.delete(event.taskId);
}

function recordMemoryForSession(roleId: string, sessionId: string, source: 'companion' | 'agent'): void {
  if (!memoryService || !sessionStore) return;
  const session = sessionStore.snapshot().sessions.find((item) => item.id === sessionId);
  if (!session) return;
  try {
    const context = sessionStore.sessionContext(sessionId);
    memoryService.recordConversation({
      roleId,
      sessionId,
      scope: context.contextType === 'personal'
        ? personalMemoryScope(sessionId)
        : { contextType: 'workspace', workspaceId: context.workspaceId, sessionId },
      source,
      messages: session.messages.map((message) => ({ role: message.role, content: message.content, createdAt: message.createdAt }))
    });
    sendStateChanged();
  } catch (error) {
    console.warn('Memory persistence skipped:', error);
  }
}

function publishSessionSnapshot(snapshot = sessionStore.snapshot()): SessionSnapshot {
  if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.webContents.send('sessions:changed', snapshot);
  return snapshot;
}

function getAgentService(): AgentService {
  if (!agentService) throw new Error('Agent 子系统尚未初始化');
  return agentService;
}

function agentContext(): import('./agent-service').AgentServiceContext {
  const store = getStore();
  const settings = store.readSettings();
  const roles = store.readRolePackages();
  const role = roles.find((item) => item.id === settings.activeRoleId) ?? roles[0] ?? DEFAULT_ROLE_PACKAGE;
  return { settings, apiKey: store.readSecrets().apiKey, roleId: role.id, live2dPath: settings.live2dModelPath };
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

function persistWorkbenchWindowState(immediate = false): void {
  if (!settingsWindow || settingsWindow.isDestroyed() || !settingsStore) return;
  if (workbenchWindowPersistTimer) {
    clearTimeout(workbenchWindowPersistTimer);
    workbenchWindowPersistTimer = null;
  }
  const write = (): void => {
    workbenchWindowPersistTimer = null;
    if (!settingsWindow || settingsWindow.isDestroyed()) return;
    const maximized = settingsWindow.isMaximized();
    const bounds = maximized ? settingsWindow.getNormalBounds() : settingsWindow.getBounds();
    getStore().saveWorkbenchWindowState({ version: 1, bounds, maximized });
  };
  if (immediate) write();
  else workbenchWindowPersistTimer = setTimeout(write, 180);
}

function sendPetBoundsChanged(): void {
  if (!petWindow || petWindow.isDestroyed()) {
    return;
  }
  const bounds = petWindow.getBounds();
  const operation: PetPointerOperation | null = petDragStart
    ? 'window-and-model-drag'
    : petResizeStart
      ? 'window-resize'
      : null;
  const change: PetBoundsChange = { bounds, operation };
  for (const window of [petWindow, settingsWindow]) {
    if (window && !window.isDestroyed()) {
      window.webContents.send('pet:bounds-changed', change);
    }
  }
}

function sendPetResizeViewportChanged(): void {
  if (!petWindow || petWindow.isDestroyed()) {
    return;
  }
  // The renderer needs the exact rectangle for every custom resize frame.
  // Keep this hot-path notification local to PetWindow: settings, persistence
  // and the normal move/resize broadcast remain end-of-gesture concerns.
  const change: PetBoundsChange = { bounds: petWindow.getBounds(), operation: 'window-resize' };
  petWindow.webContents.send('pet:bounds-changed', change);
}

function syncPetWindowResizable(): void {
  if (!petWindow || petWindow.isDestroyed()) {
    return;
  }
  // Custom edge gestures own resizing. Native DWM resize paints a white
  // non-client strip on transparent frameless windows.
  if (petWindow.isResizable()) {
    petWindow.setResizable(false);
  }
}

function applyPetWindowSettings(previousSettings?: ReturnType<SettingsStore['readSettings']>): void {
  if (!petWindow || petWindow.isDestroyed()) {
    return;
  }
  const settings = getStore().readSettings();
  if (!previousSettings || settings.alwaysOnTop !== previousSettings.alwaysOnTop) {
    petWindow.setAlwaysOnTop(true, 'floating', 1);
    petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }
  if (!previousSettings || settings.petWindowOpacity !== previousSettings.petWindowOpacity) {
    petWindow.setOpacity(settings.petWindowOpacity);
  }
}

function closePetContextMenu(): void {
  const active = activePetContextMenu;
  activePetContextMenu = null;
  if (!active) {
    return;
  }
  active.menu.closePopup(active.owner ?? undefined);
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
  if (petBoundsPersistTimer) {
    clearTimeout(petBoundsPersistTimer);
    petBoundsPersistTimer = null;
  }
  if (hadTransaction) {
    persistPetBounds(true);
    sendPetBoundsChanged();
    arrangeInteractionTestWindow();
  }
  applyPetInputMode(petInteractionEnabled(getStore().readSettings()) ? 'interactive' : 'passthrough');
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
    titleBarOverlay: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    focusable: false,
    show: false,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    icon: appIconPath(),
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
  petWindow.setIgnoreMouseEvents(true);
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
    if (petResizeStart) {
      return;
    }
    persistPetBounds();
    sendPetBoundsChanged();
    arrangeInteractionTestWindow();
  });
  petWindow.on('resize', () => {
    if (petResizeStart) {
      return;
    }
    persistPetBounds();
    sendPetBoundsChanged();
    arrangeInteractionTestWindow();
  });
  petWindow.on('blur', () => {
    closePetContextMenu();
    cancelPetPointerTransactions();
  });
  petWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      petWindow?.hide();
    }
  });
  petWindow.on('closed', () => {
    closePetContextMenu();
    for (const [requestId, pending] of pendingCubismRuntimeCommands) {
      clearTimeout(pending.timer);
      if (pending.retryTimer) clearTimeout(pending.retryTimer);
      pending.resolve(runtimeNotReadyResult(pending.command, '桌宠窗口已关闭，Cubism runtime 不可用。'));
      pendingCubismRuntimeCommands.delete(requestId);
    }
    cubismRuntimeSession.markFailed(cubismRuntimeSession.state().currentModelIdentity);
    petWindow = null;
    petBoundsRestored = false;
    petRendererReady = false;
    petRuntimeCommandSubscribed = false;
    petStartupShowPending = true;
  });
}

function createSettingsWindow(): void {
  const primaryWorkArea = screen.getPrimaryDisplay().workArea;
  const restoredWindowState = resolveWorkbenchWindowState(
    getStore().readWorkbenchWindowState(),
    screen.getAllDisplays().map((display) => display.workArea),
    primaryWorkArea
  );
  const targetWorkArea = screen.getDisplayMatching(restoredWindowState.bounds).workArea;
  settingsWindow = new BrowserWindow({
    ...restoredWindowState.bounds,
    minWidth: Math.min(WORKBENCH_MIN_SIZE.width, targetWorkArea.width),
    minHeight: Math.min(WORKBENCH_MIN_SIZE.height, targetWorkArea.height),
    frame: false,
    title: '',
    thickFrame: true,
    roundedCorners: false,
    autoHideMenuBar: true,
    titleBarOverlay: false,
    resizable: true,
    maximizable: true,
    hasShadow: false,
    show: false,
    transparent: true,
    backgroundColor: '#00000000',
    icon: appIconPath(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(__dirname, '../preload/index.cjs')
    }
  });
  settingsWindow.setTitle('');
  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.setBackgroundColor('#00000000');
  settingsWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  settingsWindow.on('focus', () => sendSettingsWindowFocusState(true));
  settingsWindow.on('blur', () => {
    closePetContextMenu();
    sendSettingsWindowFocusState(false);
  });
  settingsWindow.on('show', () => sendSettingsWindowFocusState(settingsWindow?.isFocused() === true));
  settingsWindow.on('hide', () => {
    sendSettingsWindowFocusState(false);
    persistWorkbenchWindowState(true);
  });
  settingsWindow.on('move', () => persistWorkbenchWindowState());
  settingsWindow.on('resize', () => persistWorkbenchWindowState());
  settingsWindow.on('maximize', () => {
    sendSettingsWindowMaximizedState(true);
    persistWorkbenchWindowState(true);
  });
  settingsWindow.on('unmaximize', () => {
    sendSettingsWindowMaximizedState(false);
    persistWorkbenchWindowState(true);
  });
  settingsWindow.webContents.on('did-finish-load', () => {
    sendSettingsWindowFocusState(settingsWindow?.isFocused() === true);
    sendSettingsWindowMaximizedState(settingsWindow?.isMaximized() === true);
    sendWorkbenchCharacterVisibility(workbenchCharacterVisible);
  });
  settingsWindow.once('ready-to-show', () => {
    if (isQuitting) return;
    settingsWindow?.show();
    settingsWindow?.focus();
  });
  loadRenderer(settingsWindow, 'settings');
  settingsWindow.on('close', (event) => {
    persistWorkbenchWindowState(true);
    if (!isQuitting) {
      event.preventDefault();
      settingsWindow?.hide();
    }
  });
  settingsWindow.on('closed', () => {
    if (workbenchWindowPersistTimer) {
      clearTimeout(workbenchWindowPersistTimer);
      workbenchWindowPersistTimer = null;
    }
    settingsWindow = null;
  });
  if (restoredWindowState.maximized) settingsWindow.maximize();
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

function sendSettingsWindowFocusState(active: boolean): void {
  if (!settingsWindow || settingsWindow.isDestroyed() || settingsWindow.webContents.isDestroyed()) {
    return;
  }
  settingsWindow.webContents.send('settings:window-focus', active);
}

function sendSettingsWindowMaximizedState(maximized: boolean): void {
  if (!settingsWindow || settingsWindow.isDestroyed() || settingsWindow.webContents.isDestroyed()) return;
  settingsWindow.webContents.send('window:maximized-changed', maximized);
}

function sendWorkbenchCharacterVisibility(visible: boolean): void {
  if (!settingsWindow || settingsWindow.isDestroyed() || settingsWindow.webContents.isDestroyed()) return;
  settingsWindow.webContents.send('workbench:character-visibility', visible);
}

function setWorkbenchCharacterVisible(visible: boolean): void {
  workbenchCharacterVisible = visible;
  sendWorkbenchCharacterVisibility(visible);
}

function inspectLive2DSelection(path: string): Live2DModelInspection {
  const registry = getLive2DRegistry();
  const existing = registry.findByEntryPath(path);
  if (existing) return registry.inspectModel(existing.id);
  return registry.importSelection(path);
}

function live2dSwitchError(stage: Live2DRuntimeFailure['stage'], message: string): Error {
  return new Error(`外部 Live2D 模型${stage === 'load' ? '加载' : stage === 'initialize' ? '初始化' : '渲染'}失败：${message}`);
}

function matchesPendingEntry(entryPath: unknown, pending: PendingLive2DSwitch): boolean {
  if (typeof entryPath !== 'string' || !entryPath.trim()) return false;
  try {
    return resolve(entryPath) === resolve(pending.candidate.record.entryPath);
  } catch {
    return false;
  }
}

function settlePendingLive2DSwitchSuccess(entryPath: unknown): void {
  const pending = pendingLive2DSwitch;
  if (!pending || !matchesPendingEntry(entryPath, pending)) return;
  clearTimeout(pending.timer);
  pendingLive2DSwitch = null;
  getLive2DRegistry().setCurrentModel(pending.candidate.record.id);
  sendStateChanged();
  pending.resolve(getPublicState());
}

function settlePendingLive2DSwitchFailure(notice: Live2DRuntimeFailure): void {
  const pending = pendingLive2DSwitch;
  if (!pending || !matchesPendingEntry(notice.entryPath, pending)) return;
  clearTimeout(pending.timer);
  pendingLive2DSwitch = null;
  const store = getStore();
  getLive2DRegistry().markRuntimeFailure(
    pending.candidate.record.id,
    String(notice.stage) + '：' + String(notice.message)
  );
  store.save({ live2dModelPath: pending.previousPath });
  getLive2DRegistry().setCurrentModel(pending.previousModelId);
  cubismRuntimeSession.setCurrentModel(pending.previousPath);
  sendStateChanged();
  pending.reject(live2dSwitchError(notice.stage, `${pending.candidate.record.entryPath}：${notice.message}`));
}

function waitForLive2DSwitch(
  previousSettings: ReturnType<SettingsStore['readSettings']>,
  candidate: Live2DModelInspection,
  previousAdapter: ReturnType<Live2DAdapterStore['read']>
): Promise<PublicAppState> {
  if (pendingLive2DSwitch) throw new Error('已有一个外部模型切换正在进行');
  const previousModelId = getLive2DRegistry().current()?.id ?? null;
  cubismRuntimeSession.setCurrentModel(candidate.record.entryPath);
  return new Promise<PublicAppState>((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => {
      settlePendingLive2DSwitchFailure({
        entryPath: candidate.record.entryPath,
        stage: 'initialize',
        message: '等待桌宠完成稳定初始化超时。'
      });
    }, 15000);
    pendingLive2DSwitch = {
      token: randomUUID(),
      previousPath: previousSettings.live2dModelPath,
      previousModelId,
      previousAdapter,
      candidate,
      resolve: resolvePromise,
      reject: rejectPromise,
      timer
    };
  });
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
  petWindow.setIgnoreMouseEvents(!interactive);
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

function unlockPetWindowForAdjustment(): void {
  const settings = getStore().readSettings();
  if (!petInteractionEnabled(settings)) {
    getStore().save(petInteractionSettingsForEnabled(true));
  }
  setPetModelEditMode(true);
  sendStateChanged();
}

function lockPetWindow(): void {
  const settings = getStore().readSettings();
  if (petInteractionEnabled(settings)) {
    getStore().save(petInteractionSettingsForEnabled(false));
  }
  setPetModelEditMode(false);
  sendStateChanged();
}

function startCursorPolling(): void {
  if (cursorTimer) {
    return;
  }
  cursorTimer = setInterval(() => {
    const targets = [petWindow, settingsWindow].filter((window): window is BrowserWindow => Boolean(window && !window.isDestroyed() && window.isVisible()));
    if (targets.length === 0) {
      return;
    }
    const point = screen.getCursorScreenPoint();
    const moving = !lastCursorPoint || point.x !== lastCursorPoint.x || point.y !== lastCursorPoint.y;
    lastCursorPoint = point;
    for (const target of targets) {
      const bounds = target.getBounds();
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
      target.webContents.send('cursor:update', update);
    }
  }, 33);
}

function stopCursorPolling(): void {
  if (cursorTimer) {
    clearInterval(cursorTimer);
    cursorTimer = null;
  }
  lastCursorPoint = null;
}

function togglePetMenuLock(): void {
  if (petInteractionEnabled(getStore().readSettings())) {
    lockPetWindow();
  } else {
    unlockPetWindowForAdjustment();
  }
}

function togglePetMenuVisibility(): void {
  if (petWindow?.isVisible()) {
    petWindow.hide();
    setWorkbenchCharacterVisible(true);
  } else {
    setWorkbenchCharacterVisible(false);
    showPetWindowInactive();
  }
}

function returnPetToWorkbench(): void {
  petWindow?.hide();
  setWorkbenchCharacterVisible(true);
  showSettingsWindow();
}

function buildPetMenu(): Menu {
  return Menu.buildFromTemplate([
    { label: '放回工作台', click: returnPetToWorkbench },
    { label: '解锁/锁定桌宠', click: togglePetMenuLock },
    { label: '显示/隐藏桌宠', click: togglePetMenuVisibility },
    { type: 'separator' },
    { label: '退出应用', click: () => app.quit() }
  ]);
}

function showSettingsWindow(): void {
  if (!settingsWindow || settingsWindow.isDestroyed()) {
    createSettingsWindow();
  }
  petWindow?.hide();
  setWorkbenchCharacterVisible(true);
  settingsWindow?.show();
  settingsWindow?.focus();
}

function toggleSettings(): void {
  if (!settingsWindow || settingsWindow.isDestroyed()) {
    showSettingsWindow();
    return;
  }
  if (settingsWindow.isVisible()) {
    settingsWindow.hide();
  } else {
    showSettingsWindow();
  }
}

function createTray(): void {
  const iconPath = trayIconPath();
  tray = new Tray(nativeImage.createFromPath(iconPath));
  tray.setToolTip('StarChat · 外部 Live2D 桌宠');
  tray.setContextMenu(buildPetMenu());
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
  closePetContextMenu();
  const menu = buildPetMenu();
  const menuOwner = settingsWindow && !settingsWindow.isDestroyed() ? settingsWindow : null;
  activePetContextMenu = { menu, owner: menuOwner };
  menu.once('menu-will-close', () => {
    if (activePetContextMenu?.menu === menu) {
      activePetContextMenu = null;
    }
  });
  // The hidden settings window supplies a stable native owner so Windows can
  // dismiss the popup on any outside click. Never use the transparent pet HWND:
  // activating it reintroduces the non-client white strip and focus regression.
  menu.popup({ window: menuOwner ?? undefined });
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

function bindAgentTaskSender(taskId: string, sender: Electron.WebContents): void {
  agentTaskSenders.set(taskId, sender);
  const task = getAgentService().get(taskId);
  if (task && !sender.isDestroyed()) sender.send('agent:event', { type: 'task', taskId, task, timestamp: Date.now() } satisfies AgentEvent);
}

function activeWorkbenchContext(): ReturnType<SessionStore['sessionContext']> {
  const sessionId = sessionStore.snapshot().activeSessionId;
  if (!sessionId) throw new Error('请先选择一个工作区会话');
  const context = sessionStore.sessionContext(sessionId);
  if (!context.workspaceRoot) throw new Error('当前是个人会话，请先选择工作区后再使用项目工具');
  return context;
}

function requireTrustedWorkspaceExecution(context: ReturnType<typeof activeWorkbenchContext>): void {
  if (context.trust !== 'trusted-execution') throw new Error('当前工作区未信任脚本执行，请在环境信息中允许执行后重试');
}

async function startRoutedChat(sender: Electron.WebContents, request: StartChatRequest): Promise<string> {
  const message = typeof request?.message === 'string' ? request.message.trim() : '';
  if (!message) throw new Error('消息不能为空');
  const execution = sessionStore.executionContext(typeof request?.sessionId === 'string' ? request.sessionId : '');
  const settings = getStore().readSettings();
  const requestedMode = request.mode === 'auto' || request.mode === 'companion' || request.mode === 'agent' ? request.mode : settings.assistantMode;
  const context = agentContext();
  const decision = await routeTurn({
    mode: requestedMode,
    message,
    classifyAmbiguous: requestedMode === 'auto' && context.apiKey
      ? () => classifyAmbiguousWithModel(settings, context.apiKey, message)
      : undefined
  });
  if (decision.route === 'agent') {
    publishSessionSnapshot(sessionStore.appendMessage(execution.sessionId, { role: 'user', content: message }));
    const started = await getAgentService().start({ message, mode: requestedMode, sessionId: execution.sessionId }, decision);
    bindAgentTaskSender(started.taskId, sender);
    return started.taskId;
  }
  const requestId = randomUUID();
  publishSessionSnapshot(sessionStore.appendMessage(execution.sessionId, { role: 'user', content: message }));
  const controller = new AbortController();
  activeRequests.set(requestId, controller);
  void runChat(sender, requestId, { ...request, message, mode: requestedMode }, controller)
    .catch((error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : '对话请求失败';
      sendChatEvent(sender, { type: 'error', requestId, message: errorMessage });
    })
    .finally(() => activeRequests.delete(requestId));
  return requestId;
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
  const memoryEnabled = settings.longTermMemoryEnabled;
  const sessionContext = sessionStore.sessionContext(request.sessionId);
  const memoryScope = sessionContext.contextType === 'personal'
    ? personalMemoryScope(request.sessionId)
    : { contextType: 'workspace' as const, workspaceId: sessionContext.workspaceId, sessionId: request.sessionId };
  const structuredMemoryContext = memoryService?.contextFor({ roleId: snapshot.roleId, scope: memoryScope, query: message, limit: 5 }) ?? '暂无可用长期记忆；不要编造用户经历。';
  const messages: ChatMessage[] = [
    { role: 'system', content: buildCompanionSystemPrompt(snapshot, before) },
    { role: 'system', content: `结构化长期记忆（${memoryEnabled ? '仅在自然相关时参考' : '已关闭'}）：\n${structuredMemoryContext}` },
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
  publishSessionSnapshot(sessionStore.appendMessage(request.sessionId, { role: 'assistant', content: responseText }));
  recordMemoryForSession(snapshot.roleId, request.sessionId, 'companion');
  sendChatEvent(sender, { type: 'complete', requestId, response: responseText, companion: companionSummary(nextCompanion, snapshot.relationshipStages, memoryService?.listProfile(snapshot.roleId).length ?? 0) });
  sendStateChanged();
}

function runtimeCommandPhase(command: CubismRuntimeCommand): CubismRuntimePhase {
  switch (command.type) {
    case 'capabilities': return 'capabilities';
    case 'play_expression': return 'expression';
    case 'play_motion': return 'motion';
    case 'stop_expression': return 'stop_expression';
    case 'stop_motion': return 'stop_motion';
    case 'reset': return 'reset';
  }
}

function emptyRuntimeCapabilities(): CubismRuntimeCapabilities {
  return { modelIdentity: null, expressions: [], motions: [], idleGroup: null };
}

function emptyRuntimeStatus(): CubismRuntimeStatus {
  return { modelIdentity: null, activeExpression: null, activeMotion: null };
}

function runtimeNotReadyResult(command: CubismRuntimeCommand, message: string): CubismRuntimeResult {
  return {
    ok: false,
    phase: runtimeCommandPhase(command),
    code: 'not_ready',
    message,
    status: emptyRuntimeStatus(),
    capabilities: emptyRuntimeCapabilities()
  };
}

function runtimeResultIdentity(result: CubismRuntimeResult): string | null {
  return result.capabilities.modelIdentity ?? result.status.modelIdentity;
}

function settleCubismRuntimePending(requestId: string, result: CubismRuntimeResult): void {
  const pending = pendingCubismRuntimeCommands.get(requestId);
  if (!pending) return;
  clearTimeout(pending.timer);
  if (pending.retryTimer) clearTimeout(pending.retryTimer);
  pendingCubismRuntimeCommands.delete(requestId);
  pending.resolve(result);
}

function dispatchPendingCubismRuntimeCommand(requestId: string): void {
  const pending = pendingCubismRuntimeCommands.get(requestId);
  if (!pending || !petWindow || petWindow.isDestroyed() || !petRuntimeCommandSubscribed) return;
  const currentIdentity = cubismRuntimeSession.state().currentModelIdentity;
  if (!currentIdentity || !cubismRuntimeSession.isReady(currentIdentity)) return;
  if (pending.attempts >= 2) {
    settleCubismRuntimePending(requestId, runtimeNotReadyResult(pending.command, '当前模型 runtime 身份未能稳定确认，请稍后重试。'));
    return;
  }
  pending.identity = currentIdentity;
  pending.attempts += 1;
  petWindow.webContents.send('cubism:runtime-command', { requestId, command: pending.command });
}

function flushPendingCubismRuntimeCommands(): void {
  for (const requestId of pendingCubismRuntimeCommands.keys()) {
    dispatchPendingCubismRuntimeCommand(requestId);
  }
}

function registerIpc(): void {
  const windows = (): { settingsWindow: BrowserWindow | null; petWindow: BrowserWindow | null } => ({ settingsWindow, petWindow });
  const isSettingsSender = (sender: Electron.WebContents): boolean => isIpcWindow(sender, 'settings', windows());
  const isPetSender = (sender: Electron.WebContents): boolean => isIpcWindow(sender, 'pet', windows());
  const isAppWindowSender = (sender: Electron.WebContents): boolean => isSettingsSender(sender) || isPetSender(sender);

  ipcMain.handle('state:get', (event) => {
    const windows = { settingsWindow, petWindow };
    if (!isIpcWindow(event.sender, 'settings', windows) && !isIpcWindow(event.sender, 'pet', windows)) {
      throw new Error('未知窗口不可读取应用状态');
    }
    return getPublicState();
  });
  ipcMain.handle('sessions:snapshot', (event) => {
    requireIpcWindow(event.sender, 'settings', { settingsWindow, petWindow });
    return sessionStore.snapshot();
  });
  ipcMain.handle('sessions:choose-workspace', async (event) => {
    requireIpcWindow(event.sender, 'settings', { settingsWindow, petWindow });
    const selected = await dialog.showOpenDialog(settingsWindow!, { title: '选择 StarChat 工作区', properties: ['openDirectory'] });
    if (selected.canceled || !selected.filePaths[0]) return sessionStore.snapshot();
    return publishSessionSnapshot(sessionStore.authorizeWorkspace(selected.filePaths[0], agentContext().roleId));
  });
  ipcMain.handle('sessions:select-workspace', (event, workspaceId: unknown) => {
    requireIpcWindow(event.sender, 'settings', { settingsWindow, petWindow });
    if (typeof workspaceId !== 'string') throw new Error('工作区选择请求无效');
    return publishSessionSnapshot(sessionStore.selectWorkspace(workspaceId, agentContext().roleId));
  });
  ipcMain.handle('sessions:create', (event, workspaceId: unknown) => {
    requireIpcWindow(event.sender, 'settings', { settingsWindow, petWindow });
    if (typeof workspaceId !== 'string') throw new Error('新建会话请求无效');
    return publishSessionSnapshot(sessionStore.createSession(workspaceId, agentContext().roleId));
  });
  ipcMain.handle('sessions:create-personal', (event) => {
    requireIpcWindow(event.sender, 'settings', { settingsWindow, petWindow });
    return publishSessionSnapshot(sessionStore.createPersonalSession(agentContext().roleId));
  });
  ipcMain.handle('sessions:set-trust', (event, request: { workspaceId?: unknown; trust?: unknown }) => {
    requireIpcWindow(event.sender, 'settings', { settingsWindow, petWindow });
    if (typeof request?.workspaceId !== 'string' || !['untrusted', 'read-only', 'trusted-execution'].includes(String(request.trust))) throw new Error('工作区信任请求无效');
    return publishSessionSnapshot(sessionStore.setWorkspaceTrust(request.workspaceId, request.trust as WorkspaceTrustState));
  });
  ipcMain.handle('sessions:select', (event, sessionId: unknown) => {
    requireIpcWindow(event.sender, 'settings', { settingsWindow, petWindow });
    if (typeof sessionId !== 'string') throw new Error('会话选择请求无效');
    return publishSessionSnapshot(sessionStore.selectSession(sessionId));
  });
  ipcMain.handle('sessions:rename', (event, request: SessionRenameRequest) => {
    requireIpcWindow(event.sender, 'settings', { settingsWindow, petWindow });
    if (!request || typeof request.sessionId !== 'string' || typeof request.title !== 'string') throw new Error('会话重命名请求无效');
    return publishSessionSnapshot(sessionStore.renameSession(request.sessionId, request.title));
  });
  ipcMain.handle('sessions:delete', (event, sessionId: unknown) => {
    requireIpcWindow(event.sender, 'settings', { settingsWindow, petWindow });
    if (typeof sessionId !== 'string') throw new Error('会话删除请求无效');
    return publishSessionSnapshot(sessionStore.deleteSession(sessionId, agentContext().roleId));
  });
  ipcMain.handle('workbench:inspect', (event, request: { kind?: unknown; path?: unknown }) => {
    requireIpcWindow(event.sender, 'settings', { settingsWindow, petWindow });
    const kind = request?.kind === 'resources' || request?.kind === 'source' ? request.kind : null;
    if (!kind) throw new Error('工作区检查类型无效');
    if (request.path !== undefined && typeof request.path !== 'string') throw new Error('工作区路径无效');
    return inspectWorkbench(activeWorkbenchContext().workspaceRoot, kind, request.path ?? '');
  });
  ipcMain.handle('workbench:preview-file', (event, request: { path?: unknown }) => {
    requireIpcWindow(event.sender, 'settings', { settingsWindow, petWindow });
    if (typeof request?.path !== 'string') throw new Error('文件预览请求无效');
    return previewWorkbenchFile(activeWorkbenchContext().workspaceRoot, request.path);
  });
  ipcMain.handle('workbench:diff', (event, request: { path?: unknown }) => {
    requireIpcWindow(event.sender, 'settings', { settingsWindow, petWindow });
    if (typeof request?.path !== 'string') throw new Error('差异读取请求无效');
    return readWorkbenchDiff(activeWorkbenchContext().workspaceRoot, request.path);
  });
  ipcMain.handle('workbench:verify', async (event, request: { script?: unknown }) => {
    requireIpcWindow(event.sender, 'settings', { settingsWindow, petWindow });
    if (typeof request?.script !== 'string') throw new Error('验证请求无效');
    const context = activeWorkbenchContext();
    requireTrustedWorkspaceExecution(context);
    return runVerification(context.workspaceRoot, request.script, new AbortController().signal);
  });
  ipcMain.handle('workbench:command', async (event, request: { command?: unknown }) => {
    requireIpcWindow(event.sender, 'settings', { settingsWindow, petWindow });
    if (typeof request?.command !== 'string') throw new Error('终端命令请求无效');
    const context = activeWorkbenchContext();
    if (request.command.trim().toLocaleLowerCase().startsWith('pnpm ')) requireTrustedWorkspaceExecution(context);
    return runWorkbenchCommand(context.workspaceRoot, request.command, new AbortController().signal);
  });
  ipcMain.handle('workbench:open-url', async (event, request: { url?: unknown }) => {
    requireIpcWindow(event.sender, 'settings', { settingsWindow, petWindow });
    if (typeof request?.url !== 'string') throw new Error('浏览器地址请求无效');
    const url = normalizeWorkbenchUrl(request.url);
    await shell.openExternal(url);
    return { ok: true as const, url };
  });
  ipcMain.handle('workbench:git-commit', async (event, request: { message?: unknown }) => {
    requireIpcWindow(event.sender, 'settings', { settingsWindow, petWindow });
    if (typeof request?.message !== 'string') throw new Error('Git 提交请求无效');
    const context = activeWorkbenchContext();
    requireTrustedWorkspaceExecution(context);
    return commitWorkbenchStaged(context.workspaceRoot, request.message, new AbortController().signal);
  });
  ipcMain.handle('workbench:share', (event) => {
    requireIpcWindow(event.sender, 'settings', { settingsWindow, petWindow });
    const summary = formatWorkbenchShare(inspectWorkbench(activeWorkbenchContext().workspaceRoot, 'source'));
    clipboard.writeText(summary.text);
    return summary;
  });
  ipcMain.handle('window:toggle-maximize', (event, requestedState?: unknown) => {
    const targetWindow = requireIpcWindow(event.sender, 'settings', { settingsWindow, petWindow });
    const shouldMaximize = typeof requestedState === 'boolean' ? requestedState : !targetWindow.isMaximized();
    if (shouldMaximize && !targetWindow.isMaximized()) targetWindow.maximize();
    if (!shouldMaximize && targetWindow.isMaximized()) targetWindow.unmaximize();
    persistWorkbenchWindowState(true);
    const maximized = targetWindow.isMaximized();
    sendSettingsWindowMaximizedState(maximized);
    return maximized;
  });
  ipcMain.handle('window:is-maximized', (event) => {
    const targetWindow = requireIpcWindow(event.sender, 'settings', { settingsWindow, petWindow });
    return targetWindow.isMaximized();
  });
  ipcMain.handle('api:test-connection', async (event, request: ConnectionTestRequest): Promise<ConnectionTestResult> => {
    requireIpcWindow(event.sender, 'settings', { settingsWindow, petWindow });
    const apiKey = typeof request?.apiKey === 'string' && request.apiKey.trim() ? request.apiKey.trim() : getStore().readSecrets().apiKey;
    if (!apiKey) throw new Error('请先输入或保存 API Key');
    const current = getStore().readSettings();
    await testChatConnection({ ...current, apiBaseUrl: request.apiBaseUrl, model: request.model }, apiKey);
    return { ok: true, message: '连接成功，服务已返回有效响应。' };
  });
  ipcMain.handle('tts:synthesize', async (event, request: { text?: unknown }) => {
    requireIpcWindow(event.sender, 'settings', { settingsWindow, petWindow });
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
    requireIpcWindow(event.sender, 'settings', { settingsWindow, petWindow });
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
    requireIpcWindow(event.sender, 'settings', { settingsWindow, petWindow });
    const id = typeof request?.id === 'string' ? request.id : null;
    if (id && !voiceProfileStore.list().some((item) => item.id === id)) throw new Error('音色不存在');
    getStore().save({ cosyVoiceMode: id ? 'zero-shot' : 'sft', activeVoiceProfileId: id });
    sendStateChanged(); return getPublicState();
  });
  ipcMain.handle('voices:delete', (event, request: { id?: unknown }) => {
    requireIpcWindow(event.sender, 'settings', { settingsWindow, petWindow });
    const id = typeof request?.id === 'string' ? request.id : '';
    voiceProfileStore.delete(id);
    if (getStore().readSettings().activeVoiceProfileId === id) getStore().save({ cosyVoiceMode: 'sft', activeVoiceProfileId: null });
    sendStateChanged(); return getPublicState();
  });
  ipcMain.handle('voices:preview', async (event, request: { id?: unknown; text?: unknown }) => {
    requireIpcWindow(event.sender, 'settings', { settingsWindow, petWindow });
    const profile = voiceProfileStore.list().find((item) => item.id === request?.id);
    if (!profile) throw new Error('音色不存在');
    const settings = getStore().readSettings();
    await ensureCosyVoiceService(settings.cosyVoiceBaseUrl, cosyVoiceProjectRoots(), 'zero-shot');
    const activeRoleName = getStore().readActiveRolePackage().identity.name;
    return synthesizeCosyVoice(typeof request.text === 'string' ? request.text : `你好，我是${activeRoleName}。`, settings, {
      promptText: profile.promptText,
      promptWav: new Uint8Array(readFileSync(voiceProfileStore.audioPath(profile.id)))
    });
  });
  ipcMain.handle('memory:list', (event) => {
    requireIpcWindow(event.sender, 'settings', { settingsWindow, petWindow });
    const role = getStore().readActiveRolePackage();
    return memoryService?.listProfile(role.id) ?? [];
  });
  ipcMain.handle('memory:delete', (event, request: { id?: unknown }): PublicAppState => {
    requireIpcWindow(event.sender, 'settings', { settingsWindow, petWindow });
    if (!request || typeof request.id !== 'string' || !request.id.trim()) throw new Error('记忆删除请求无效');
    const role = getStore().readActiveRolePackage();
    memoryService?.deleteProfile(role.id, request.id.trim());
    sendStateChanged();
    return getPublicState();
  });
  ipcMain.handle('memory:clear', (event): PublicAppState => {
    requireIpcWindow(event.sender, 'settings', { settingsWindow, petWindow });
    const role = getStore().readActiveRolePackage();
    memoryService?.clearRoleMemory(role.id);
    sendStateChanged();
    return getPublicState();
  });
  ipcMain.handle('memory:review', (event, request: { id?: unknown; action?: unknown }): PublicAppState => {
    requireIpcWindow(event.sender, 'settings', { settingsWindow, petWindow });
    if (!request || typeof request.id !== 'string' || !request.id.trim() || (request.action !== 'confirm' && request.action !== 'delete')) {
      throw new Error('记忆审核请求无效');
    }
    const role = getStore().readActiveRolePackage();
    if (request.action === 'confirm') memoryService?.reviewProfile(role.id, request.id.trim(), 'active');
    else memoryService?.deleteProfile(role.id, request.id.trim());
    sendStateChanged();
    return getPublicState();
  });
  ipcMain.handle('memory:review-all', (event, request: { action?: unknown }): PublicAppState => {
    requireIpcWindow(event.sender, 'settings', { settingsWindow, petWindow });
    if (!request || (request.action !== 'confirm' && request.action !== 'delete')) throw new Error('记忆批量审核请求无效');
    const role = getStore().readActiveRolePackage();
    const pending = memoryService?.listPendingProfile(role.id) ?? [];
    for (const memory of pending) {
      if (request.action === 'confirm') memoryService?.reviewProfile(role.id, memory.id, 'active');
      else memoryService?.deleteProfile(role.id, memory.id);
    }
    sendStateChanged();
    return getPublicState();
  });
  ipcMain.handle('settings:save', async (event, request: SaveSettingsRequest) => {
    requireIpcWindow(event.sender, 'settings', { settingsWindow, petWindow });
    const store = getStore();
    const previousSettings = store.readSettings();
    const candidate = {
      ...store.readSettings(),
      ...request.settings
    };
    const modelPathChanged = Object.prototype.hasOwnProperty.call(request.settings ?? {}, 'live2dModelPath')
      && candidate.live2dModelPath !== previousSettings.live2dModelPath;
    let live2d = inspectExternalLive2DModel(candidate.live2dModelPath);
    let candidateInspection: Live2DModelInspection | null = null;
    if (modelPathChanged && candidate.live2dModelPath) {
      try {
        candidateInspection = inspectLive2DSelection(candidate.live2dModelPath);
        live2d = candidateInspection.state;
      } catch (error) {
        if (error instanceof Live2DModelRegistryError && error.state) {
          throw new Error(`${error.state.message}${error.state.issues[0] ? `：${error.state.issues[0]}` : ''}`);
        }
        throw error;
      }
      if (!['ready', 'ready_with_warnings'].includes(live2d.status)) {
        throw new Error(`${live2d.message}${live2d.issues[0] ? `：${live2d.issues[0]}` : ''}`);
      }
      candidate.live2dModelPath = candidateInspection.record.entryPath;
    } else if (live2d.status === 'invalid') {
      throw new Error(live2d.issues[0] ?? '外部 Live2D 模型路径无效');
    }
    const activeRoleId = getStore().readRolePackages().some((role) => role.id === candidate.activeRoleId)
      ? candidate.activeRoleId
      : DEFAULT_ROLE_PACKAGE.id;
    const adapterStore = getLive2DAdapterStore();
    const previousModel = previousSettings.live2dModelPath ? getLive2DRegistry().findByEntryPath(previousSettings.live2dModelPath) : null;
    const previousAdapter = previousModel ? adapterStore.read(previousModel.id) : null;
    const settingsToSave = {
      ...request.settings,
      ...(modelPathChanged ? { live2dModelPath: candidate.live2dModelPath } : {}),
      activeRoleId
    };
    const next = store.save(
      settingsToSave,
      request.apiKey,
      request.clearApiKey
    );
    const targetModel = candidateInspection?.record
      ?? (candidate.live2dModelPath ? getLive2DRegistry().findByEntryPath(candidate.live2dModelPath) : null);
    if (targetModel && request.live2dAdapter?.overrides) {
      adapterStore.save(targetModel.id, request.live2dAdapter.overrides);
    }
    if (next.petLocked && petModelEditMode) {
      setPetModelEditMode(false);
    }
    applyPetWindowSettings(previousSettings);
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
    const pending = modelPathChanged && candidateInspection
      ? waitForLive2DSwitch(previousSettings, candidateInspection, previousAdapter)
      : null;
    if (modelPathChanged && !candidateInspection) {
      getLive2DRegistry().setCurrentModel(null);
      cubismRuntimeSession.setCurrentModel(null);
    }
    sendStateChanged();
    return pending ?? getPublicState();
  });
  ipcMain.handle('roles:save', (event, request: RoleSaveRequest) => {
    requireIpcWindow(event.sender, 'settings', { settingsWindow, petWindow });
    const role = validateRolePackage(request?.role);
    getStore().saveRolePackage(role);
    if (getStore().readSettings().activeRoleId === role.id) sendStateChanged();
    return getPublicState();
  });
  ipcMain.handle('roles:activate', (event, request: RoleIdRequest) => {
    requireIpcWindow(event.sender, 'settings', { settingsWindow, petWindow });
    const role = getStore().readRolePackages().find((item) => item.id === request?.id);
    if (!role) throw new Error('角色包不存在');
    getStore().save({ activeRoleId: role.id });
    sendStateChanged();
    return getPublicState();
  });
  ipcMain.handle('roles:delete', (event, request: RoleIdRequest) => {
    requireIpcWindow(event.sender, 'settings', { settingsWindow, petWindow });
    if (isBuiltinRoleId(request?.id ?? '')) throw new Error('内置角色不可删除，请先复制为自定义角色');
    getStore().deleteRolePackage(request?.id ?? '');
    if (getStore().readSettings().activeRoleId === request?.id) getStore().save({ activeRoleId: DEFAULT_ROLE_PACKAGE.id });
    sendStateChanged();
    return getPublicState();
  });
  ipcMain.handle('roles:import', async (event) => {
    requireIpcWindow(event.sender, 'settings', { settingsWindow, petWindow });
    const result = await dialog.showOpenDialog(settingsWindow!, {
      title: '导入 StarChat 角色包',
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
    requireIpcWindow(event.sender, 'settings', { settingsWindow, petWindow });
    const role = getStore().readRolePackages().find((item) => item.id === request?.id);
    if (!role) throw new Error('角色包不存在');
    const result = await dialog.showSaveDialog(settingsWindow!, {
      title: '导出 StarChat 角色包',
      defaultPath: `${role.id}.role.json`,
      filters: [{ name: 'JSON 角色包', extensions: ['json'] }]
    });
    if (!result.canceled && result.filePath) writeFileSync(result.filePath, JSON.stringify(role, null, 2), 'utf8');
    return result.filePath ?? null;
  });
  ipcMain.on('cubism:debug-command', (event, command: CubismDebugCommand) => {
    if (!isSettingsSender(event.sender) || !isSafeCubismDebugCommand(command)) {
      return;
    }
    if (petWindow && !petWindow.isDestroyed()) {
      petWindow.webContents.send('cubism:debug-command', command);
    }
  });
  ipcMain.handle('cubism:runtime-command', (event, command: CubismRuntimeCommand): Promise<CubismRuntimeResult> => {
    if (!isSettingsSender(event.sender) || !isSafeCubismRuntimeCommand(command)) {
      throw new Error('无效的 Cubism runtime 命令');
    }
    if (!petWindow || petWindow.isDestroyed()) {
      return Promise.resolve(runtimeNotReadyResult(command, '桌宠窗口尚未启动。'));
    }
    const requestId = randomUUID();
    return new Promise<CubismRuntimeResult>((resolvePromise) => {
      const timer = setTimeout(() => {
        const pending = pendingCubismRuntimeCommands.get(requestId);
        if (!pending) return;
        settleCubismRuntimePending(requestId, runtimeNotReadyResult(command, '等待当前模型 Cubism runtime ready 超时，模型仍保持可见。'));
      }, 8000);
      pendingCubismRuntimeCommands.set(requestId, { command, resolve: resolvePromise, timer, retryTimer: null, identity: null, attempts: 0 });
      dispatchPendingCubismRuntimeCommand(requestId);
    });
  });
  ipcMain.on('cubism:runtime-result', (event, payload: CubismRuntimeCommandResult) => {
    if (!isPetSender(event.sender) || !payload || typeof payload.requestId !== 'string') {
      return;
    }
    const pending = pendingCubismRuntimeCommands.get(payload.requestId);
    if (!pending) return;
    const identity = runtimeResultIdentity(payload.result);
    const identityMatches = identity ? cubismRuntimeSession.isReady(identity) : false;
    if (!identityMatches && pending.attempts < 2) {
      pending.retryTimer = setTimeout(() => {
        pending.retryTimer = null;
        dispatchPendingCubismRuntimeCommand(payload.requestId);
      }, 180);
      return;
    }
    if (!identityMatches) {
      settleCubismRuntimePending(payload.requestId, runtimeNotReadyResult(pending.command, '收到的 runtime 结果属于旧模型或未绑定模型，已丢弃。'));
      return;
    }
    settleCubismRuntimePending(payload.requestId, payload.result);
  });
  ipcMain.on('pet:runtime-command-ready', (event) => {
    if (!isPetSender(event.sender)) return;
    petRuntimeCommandSubscribed = true;
    flushPendingCubismRuntimeCommands();
  });
  ipcMain.on('cubism:metrics', (event, request: CubismDebugMetricRequest) => {
    if (!isPetSender(event.sender) || !isSafeCubismMetrics(request)) {
      return;
    }
    latestCubismMetrics = request.metrics;
  });
  ipcMain.handle('cubism:metrics', (event) => {
    if (!isAppWindowSender(event.sender)) {
      return null;
    }
    return latestCubismMetrics;
  });
  ipcMain.handle('live2d:inspect', (event, request: { path: string }) => {
    requireIpcWindow(event.sender, 'settings', { settingsWindow, petWindow });
    const path = request?.path ?? '';
    if (path.toLowerCase().endsWith('.zip')) {
      return getLive2DRegistry().importSelection(path).state;
    }
    return inspectExternalLive2DModel(path);
  });
  ipcMain.handle('live2d:import', (event, request: { path?: unknown }): Live2DModelImportResult => {
    requireIpcWindow(event.sender, 'settings', { settingsWindow, petWindow });
    const path = typeof request?.path === 'string' ? request.path : '';
    if (!path.trim()) throw new Error('没有选择外部 Live2D 模型');
    const imported = getLive2DRegistry().importSelection(path);
    return { ...imported, models: getLive2DRegistry().list() };
  });
  ipcMain.handle('live2d:remove', (event, request: Live2DModelIdRequest): PublicAppState => {
    requireIpcWindow(event.sender, 'settings', { settingsWindow, petWindow });
    const record = getLive2DRegistry().list().find((candidate) => candidate.id === request?.id);
    if (!record) throw new Error('模型记录不存在');
    if (getStore().readSettings().live2dModelPath === record.entryPath) {
      getStore().save({ live2dModelPath: null });
      getLive2DRegistry().setCurrentModel(null);
    }
    getLive2DAdapterStore().remove(record.id);
    getLive2DRegistry().removeModel(record.id);
    sendStateChanged();
    return getPublicState();
  });
  ipcMain.handle('live2d:choose-file', async (event) => {
    requireIpcWindow(event.sender, 'settings', { settingsWindow, petWindow });
    const result = await dialog.showOpenDialog({
      title: '选择 Live2D model3.json 或 ZIP 模型包',
      properties: ['openFile'],
      filters: [{ name: 'Live2D model3 / ZIP', extensions: ['model3.json', 'zip', 'json'] }]
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
  ipcMain.handle('live2d:choose-directory', async (event) => {
    requireIpcWindow(event.sender, 'settings', { settingsWindow, petWindow });
    const result = await dialog.showOpenDialog({
      title: '选择 Live2D 模型目录',
      properties: ['openDirectory']
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
  ipcMain.handle('display:list', (event) => {
    requireIpcWindow(event.sender, 'settings', windows());
    return screen.getAllDisplays().map(displaySummary);
  });
  ipcMain.handle('window:visibility', (event) => {
    if (!isAppWindowSender(event.sender)) throw new Error('未知窗口不可读取窗口状态');
    const sourceWindow = isPetSender(event.sender) ? petWindow : settingsWindow;
    return {
      role: sourceWindow === petWindow ? 'pet' : 'settings',
      petVisible: Boolean(petWindow && !petWindow.isDestroyed() && petWindow.isVisible()),
      settingsVisible: Boolean(settingsWindow && !settingsWindow.isDestroyed() && settingsWindow.isVisible())
    };
  });
  ipcMain.on('window:minimize', (event) => {
    if (!isAppWindowSender(event.sender)) return;
    (isPetSender(event.sender) ? petWindow : settingsWindow)?.minimize();
  });
  ipcMain.on('window:close', (event) => {
    if (!isAppWindowSender(event.sender)) return;
    const window = isPetSender(event.sender) ? petWindow : settingsWindow;
    if (window === settingsWindow) {
      settingsWindow?.hide();
    } else if (window === petWindow) {
      petWindow?.hide();
    }
  });
  ipcMain.on('settings:show', (event) => {
    if (!isAppWindowSender(event.sender)) return;
    showSettingsWindow();
  });
  ipcMain.on('settings:hide', (event) => {
    if (!isAppWindowSender(event.sender)) return;
    settingsWindow?.hide();
  });
  ipcMain.on('settings:toggle', (event) => {
    if (!isAppWindowSender(event.sender)) return;
    toggleSettings();
  });
  ipcMain.on('pet:runtime-ready', (event, request?: { entryPath?: unknown }) => {
    if (!isPetSender(event.sender)) {
      return;
    }
    petRendererReady = true;
    const entryPath = typeof request?.entryPath === 'string' ? request.entryPath : null;
    if (cubismRuntimeSession.markReady(entryPath)) {
      settingsWindow?.webContents.send('cubism:runtime-ready', entryPath);
      flushPendingCubismRuntimeCommands();
    }
    settlePendingLive2DSwitchSuccess(request?.entryPath);
    maybeShowPetWindow();
  });
  ipcMain.on('pet:runtime-failed', (event, request?: Live2DRuntimeFailure) => {
    if (!isPetSender(event.sender)) return;
    petRendererReady = true;
    cubismRuntimeSession.markFailed(request?.entryPath ?? null);
    if (request && (request.stage === 'load' || request.stage === 'initialize' || request.stage === 'render')) {
      settlePendingLive2DSwitchFailure(request);
    }
    maybeShowPetWindow();
  });
  ipcMain.on('pet:show', (event) => {
    if (isAppWindowSender(event.sender)) {
      setWorkbenchCharacterVisible(false);
      showPetWindowInactive();
      petWindow?.setAlwaysOnTop(true, 'floating', 1);
    }
  });
  ipcMain.on('pet:toggle', (event) => {
    if (!isAppWindowSender(event.sender)) return;
    if (petWindow?.isVisible()) {
      petWindow.hide();
      setWorkbenchCharacterVisible(true);
    } else {
      setWorkbenchCharacterVisible(false);
      showPetWindowInactive();
    }
  });
  ipcMain.on('pet:center', (event) => {
    if (isAppWindowSender(event.sender)) {
      centerPetWindow();
    }
  });
  ipcMain.handle('pet:bounds', (event) => {
    if (!isAppWindowSender(event.sender)) {
      return null;
    }
    return petWindow && !petWindow.isDestroyed() ? petWindow.getBounds() : null;
  });
  ipcMain.on('pet:preview-bounds', (event, input: WindowBounds) => {
    if (!isSettingsSender(event.sender) || !petWindow || petWindow.isDestroyed()) {
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
    if (isPetSender(event.sender)) {
      showPetContextMenu();
    }
  });
  ipcMain.on('pet:set-input-mode', (event, mode: PetInputMode) => {
    if (!isPetSender(event.sender)) {
      return;
    }
    if (mode === 'interactive' || mode === 'passthrough') {
      applyPetInputMode(mode);
    }
  });
  ipcMain.on('pet:toggle-model-edit', (event) => {
    if (isAppWindowSender(event.sender)) {
      togglePetModelEditMode();
    }
  });
  ipcMain.on('pet:pointer-cancel', (event) => {
    if (isPetSender(event.sender)) {
      cancelPetPointerTransactions();
    }
  });
  ipcMain.on('pet:drag-start', (event, point: PetDragPoint) => {
    if (
      isPetSender(event.sender) &&
      petInteractionEnabled(getStore().readSettings()) &&
      Number.isFinite(point?.screenX) &&
      Number.isFinite(point?.screenY) &&
      petWindow
    ) {
      // A new Alt-drag is authoritative. Drop any stale transaction before
      // capturing its immutable window dimensions.
      cancelPetPointerTransactions();
      petDragStart = { point, bounds: petWindow.getBounds() };
      // Keep the native resize frame disabled while User32 holds the mouse
      // button. The drag move sends a complete immutable rectangle so this
      // transparent frameless hit-test cannot resize the BrowserWindow.
      petWindow.setResizable(false);
    }
  });
  ipcMain.on('pet:drag-move', (event, point: PetDragPoint) => {
    if (!isPetSender(event.sender) || !petDragStart || !petWindow) {
      return;
    }
    const nextBounds = nextPetDragBounds(petDragStart.bounds, petDragStart.point, point);
    petWindow.setBounds(nextBounds);
  });
  ipcMain.on('pet:drag-end', (event) => {
    if (!isPetSender(event.sender) || !petDragStart) {
      return;
    }
    petDragStart = null;
    syncPetWindowResizable();
    persistPetBounds(true);
  });
  ipcMain.on('pet:resize-start', (event, request: PetResizeStart) => {
    if (!isPetSender(event.sender) || !petWindow || !petInteractionEnabled(getStore().readSettings())) return;
    if (!request || !Number.isFinite(request.screenX) || !Number.isFinite(request.screenY) || !['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].includes(request.edge)) return;
    // A new valid resize is authoritative. If a pointerup was lost, do not
    // let an old drag or resize transaction permanently block the next gesture.
    cancelPetPointerTransactions();
    petResizeStart = { request, bounds: petWindow.getBounds(), display: selectedDisplay() };
  });
  ipcMain.on('pet:resize-move', (event, point: PetDragPoint) => {
    if (!isPetSender(event.sender) || !petWindow || petDragStart || !petResizeStart) return;
    if (!Number.isFinite(point?.screenX) || !Number.isFinite(point?.screenY)) return;
    const next = nextPetResizeBounds(petResizeStart.bounds, petResizeStart.request, point, petResizeStart.request.edge);
    const safeNext = safePetBounds(next, petResizeStart.display);
    if (!sameWindowBounds(petWindow.getBounds(), safeNext)) {
      petWindow.setBounds(safeNext);
      sendPetResizeViewportChanged();
    }
  });
  ipcMain.on('pet:resize-end', (event) => {
    if (!isPetSender(event.sender) || !petResizeStart) return;
    petResizeStart = null;
    persistPetBounds(true);
    sendPetBoundsChanged();
    arrangeInteractionTestWindow();
  });
  ipcMain.on('presentation:emit', (event, payload: PresentationEvent) => {
    if (!isSettingsSender(event.sender) || !isSafePresentationEvent(payload)) {
      return;
    }
    if (petWindow && !petWindow.isDestroyed()) {
      petWindow.webContents.send('presentation:event', payload);
    }
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.webContents.send('presentation:event', payload);
    }
  });
  ipcMain.on('starchat:settings-preview', (event, detail: SettingsPreviewDetail) => {
    if (isPetSender(event.sender) && detail?.domain === 'settings') {
      if (!detail.patch || Object.keys(detail.patch).some((key) => key !== 'modelViewportByModel')) return;
      settingsWindow?.webContents.send('starchat:settings-preview', detail);
      return;
    }
    if (isSettingsSender(event.sender) && detail?.domain === 'settings') {
      if (!detail.patch || typeof detail.patch !== 'object') return;
      const allowed = new Set(['cursorTrackingEnabled', 'cursorEyeWeight', 'cursorHeadWeight', 'cursorBodyWeight', 'cursorSmoothing', 'cursorMaxStep', 'cursorRangeX', 'cursorRangeY', 'cursorIdleMotion']);
      if (Object.keys(detail.patch).some((key) => !allowed.has(key))) return;
      petWindow?.webContents.send('starchat:settings-preview', detail);
      return;
    }
    if (!isSettingsSender(event.sender) || !detail || detail.domain !== 'presentation') return;
    if (!detail.patch || typeof detail.patch !== 'object') return;
    const allowed = new Set(['bodyFollowStrength', 'bodyLag', 'inertiaStrength', 'idleSwayStrength', 'physicsEnabled']);
    if (Object.keys(detail.patch).some((key) => !allowed.has(key))) return;
    petWindow?.webContents.send('starchat:settings-preview', detail);
  });
  ipcMain.handle('chat:start', (event, request: StartChatRequest) => {
    requireIpcWindow(event.sender, 'settings', { settingsWindow, petWindow });
    return startRoutedChat(event.sender, request);
  });
  ipcMain.handle('chat:cancel', async (event, requestId: string) => {
    requireIpcWindow(event.sender, 'settings', { settingsWindow, petWindow });
    if (typeof requestId !== 'string') return;
    activeRequests.get(requestId)?.abort();
    if (!activeRequests.has(requestId)) await getAgentService().cancel(requestId).catch(() => undefined);
  });
  ipcMain.handle('agent:start', async (event, request: AgentStartRequest) => {
    requireIpcWindow(event.sender, 'settings', { settingsWindow, petWindow });
    const started = await getAgentService().start(sanitizeAgentStartRequest(request));
    bindAgentTaskSender(started.taskId, event.sender);
    return started;
  });
  ipcMain.handle('agent:retry', async (event, taskId: unknown) => {
    requireIpcWindow(event.sender, 'settings', { settingsWindow, petWindow });
    if (typeof taskId !== 'string') throw new Error('Agent 重试请求无效');
    const started = await getAgentService().retry(taskId);
    bindAgentTaskSender(started.taskId, event.sender);
    return started;
  });
  ipcMain.handle('agent:cancel', async (event, taskId: unknown) => {
    requireIpcWindow(event.sender, 'settings', { settingsWindow, petWindow });
    if (typeof taskId !== 'string') throw new Error('Agent 任务请求无效');
    await getAgentService().cancel(taskId);
  });
  ipcMain.handle('agent:approve', async (event, request: AgentApproveRequest) => {
    requireIpcWindow(event.sender, 'settings', { settingsWindow, petWindow });
    if (!request || typeof request.taskId !== 'string' || typeof request.requestId !== 'string' || typeof request.approved !== 'boolean') throw new Error('Agent 审批请求无效');
    await getAgentService().approve(request.taskId, request.requestId, request.approved);
  });
  ipcMain.handle('agent:respond', async (event, request: AgentRespondRequest) => {
    requireIpcWindow(event.sender, 'settings', { settingsWindow, petWindow });
    if (!request || typeof request.taskId !== 'string' || typeof request.requestId !== 'string' || typeof request.value !== 'string') throw new Error('Agent 输入请求无效');
    await getAgentService().respond(request.taskId, request.requestId, request.value);
  });
  ipcMain.handle('agent:list', (event) => {
    requireIpcWindow(event.sender, 'settings', { settingsWindow, petWindow });
    return getAgentService().list();
  });
  ipcMain.handle('agent:get', (event, taskId: unknown) => {
    requireIpcWindow(event.sender, 'settings', { settingsWindow, petWindow });
    if (typeof taskId !== 'string') throw new Error('Agent 任务请求无效');
    return getAgentService().get(taskId);
  });
}

if (singleInstanceLock) {
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    app.setAppUserModelId('com.starchat.desktop');
    const userDataDir = app.getPath('userData');
    const appDataDir = app.getPath('appData');
    migrateLegacyStarChatData(userDataDir, [
      join(appDataDir, '白音 AI 助手'),
      join(appDataDir, '白音AI助手'),
      join(appDataDir, 'baoyin')
    ]);
    settingsStore = new SettingsStore(userDataDir, createSafeStorageAdapter(safeStorage));
    voiceProfileStore = new VoiceProfileStore(userDataDir);
    live2dRegistry = new Live2DModelRegistry(userDataDir);
    live2dAdapterStore = new Live2DAdapterStore(userDataDir);
    agentStore = new AgentStore(join(userDataDir, 'agent-tasks.json'));
    sessionStore = new SessionStore(join(userDataDir, 'workbench-sessions.json'));
    sessionStore.ensurePersonalSession(settingsStore.readSettings().activeRoleId);
    const memoryPath = join(userDataDir, 'memory.json');
    const schemaMigration = migrateMemorySchema(memoryPath, (sessionId) => sessionStore.sessionContext(sessionId));
    if (schemaMigration.migrated) console.info(`记忆 schema ${schemaMigration.fromVersion} → 3，迁移 ${schemaMigration.migratedProfileCount} 条资料、${schemaMigration.migratedEpisodicCount} 条事件、${schemaMigration.migratedSummaryCount} 条摘要，隔离 ${schemaMigration.quarantinedCount} 条`);
    const memoryStore = new MemoryStore(memoryPath);
    const migratedMemoryCount = migrateLegacyCompanionMemories(settingsStore, memoryStore);
    if (migratedMemoryCount > 0) console.info(`已迁移 ${migratedMemoryCount} 条旧版伴侣记忆`);
    memoryService = new MemoryService({
      store: memoryStore,
      enabled: () => settingsStore.readSettings().longTermMemoryEnabled
    });
    agentService = new AgentService({
      store: agentStore,
      resolveExecutionContext: (sessionId) => sessionStore.sessionContext(sessionId ?? sessionStore.snapshot().activeSessionId ?? ''),
      getContext: agentContext,
      createModel: (context) => {
        if (!context.apiKey) throw new Error('请先在设置中保存 API Key，Agent 才能执行模型步骤');
        return createOpenAICompatibleAgentModel(context.settings, context.apiKey);
      },
      classifyAmbiguous: async (message, context) => {
        if (!context.apiKey) throw new Error('没有 API Key');
        return classifyAmbiguousWithModel(context.settings, context.apiKey, message);
      },
      emit: sendAgentEvent
    });
    const settings = settingsStore.readSettings();
    cubismRuntimeSession.setCurrentModel(settings.live2dModelPath);
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
      showSettingsWindow();
    });
  });
}

app.on('browser-window-blur', (_event, window) => {
  if (window === petWindow || window === settingsWindow) {
    closePetContextMenu();
  }
});

app.on('window-all-closed', () => {
  if (isQuitting && process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  closePetContextMenu();
  persistPetBounds(true);
  persistWorkbenchWindowState(true);
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
  agentService?.shutdown();
  agentTaskSenders.clear();
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
  if (event.type === 'dialogue') {
    return event.source === 'system'
      && ['start', 'listening', 'replying', 'end'].includes(event.phase as string)
      && (event.timestamp === undefined || Number.isFinite(event.timestamp));
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
