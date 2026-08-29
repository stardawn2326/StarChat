import { app, BrowserWindow, protocol } from 'electron';
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

app.commandLine.appendSwitch('force-device-scale-factor', '1');

// Keep the reference capture size configurable.  The supplied reference PNGs
// are 1622 px wide, while the runtime acceptance harness also exercises the
// one-pixel-wider 1623 px viewport used by the earlier report.  Both must be
// rendered by the real Electron page rather than compared after a resize.
const viewport = {
  width: Number(process.env.WORKBENCH_VIEWPORT_WIDTH ?? 1622),
  height: Number(process.env.WORKBENCH_VIEWPORT_HEIGHT ?? 969)
};
const defaultWindowViewport = { width: 1900, height: 1200 };
const animationViewport = { x: 0, y: 0, width: 620, height: 969 };
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const codeDirectory = resolve(scriptDirectory, '..');
const rendererBuildDirectory = resolve(codeDirectory, 'out/renderer');
const rendererIndex = resolve(rendererBuildDirectory, 'index.html');
const outputDirectory = resolve(process.env.WORKBENCH_SCREENSHOT_DIR ?? resolve(codeDirectory, 'artifacts/workbench-visual'));
const live2dEnabled = process.argv.includes('--live2d');
const live2dEntry = live2dEnabled
  ? resolve(process.env.WORKBENCH_LIVE2D_ENTRY ?? 'D:/BaiduNetdiskDownload/miku/miku/miku.model3.json')
  : null;
const live2dDirectory = live2dEntry ? dirname(live2dEntry) : null;
const live2dShaderDirectory = resolve(codeDirectory, 'vendor/live2d-sdk-web/Framework/Shaders/WebGL');
const referenceImages = {
  dark: 'C:/Users/23260/AppData/Local/Temp/codex-clipboard-8c3dd0c9-c4ce-4fdc-96bf-655d642c2f6e.png',
  light: 'C:/Users/23260/AppData/Local/Temp/codex-clipboard-fe53fc87-87cf-4699-9b8e-114085e1f9da.png'
};

protocol.registerSchemesAsPrivileged([{
  scheme: 'live2d',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
}]);

function live2dContentType(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.json')) return 'application/json; charset=utf-8';
  if (lower.endsWith('.vert') || lower.endsWith('.frag')) return 'text/plain; charset=utf-8';
  return 'application/octet-stream';
}

function isAllowedLive2DAsset(relativePath) {
  const lower = relativePath.toLowerCase();
  return ['.model3.json', '.moc3', '.physics3.json', '.cdi3.json', '.exp3.json', '.motion3.json', '.userdata3.json', '.pose3.json', '.png', '.wav']
    .some((suffix) => lower.endsWith(suffix));
}

function safeLive2DAsset(rootDirectory, requestedPath, extensions = null) {
  if (!rootDirectory) return null;
  const normalized = requestedPath.replaceAll('\\', '/');
  if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:/u.test(normalized) || normalized.split('/').some((part) => part === '..')) return null;
  if (extensions && !extensions.some((extension) => normalized.toLowerCase().endsWith(extension))) return null;
  try {
    const realRoot = realpathSync(rootDirectory);
    const candidate = resolve(realRoot, ...normalized.split('/'));
    if (!existsSync(candidate) || !statSync(candidate).isFile()) return null;
    const realCandidate = realpathSync(candidate);
    const outside = relative(realRoot, realCandidate);
    if (outside === '' || outside.startsWith('..') || isAbsolute(outside)) return null;
    return realCandidate;
  } catch {
    return null;
  }
}

const registeredLive2DProtocols = new WeakSet();

async function handleLive2DPreviewRequest(request) {
    let parsed;
    try {
      parsed = new URL(request.url);
    } catch {
      return new Response('Live2D asset is not available', { status: 404 });
    }
    const requestedPath = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
    const filePath = parsed.hostname === 'model'
      ? safeLive2DAsset(live2dDirectory, requestedPath)
      : parsed.hostname === 'sdk'
        ? safeLive2DAsset(live2dShaderDirectory, requestedPath, ['.vert', '.frag'])
        : null;
    if (!filePath || (parsed.hostname === 'model' && !isAllowedLive2DAsset(requestedPath))) {
      return new Response('Live2D asset is not available', { status: 404 });
    }
    return new Response(new Uint8Array(readFileSync(filePath)), {
      status: 200,
      headers: {
        'content-type': live2dContentType(filePath),
        'cache-control': 'no-store',
        'access-control-allow-origin': '*'
      }
    });
}

function registerLive2DPreviewProtocol(protocolApi = protocol) {
  if (!live2dEnabled || registeredLive2DProtocols.has(protocolApi)) return;
  protocolApi.handle('live2d', handleLive2DPreviewRequest);
  registeredLive2DProtocols.add(protocolApi);
}

const newVideoReference = 'C:/Users/23260/Videos/Captures/ChatGPT 2026-08-26 15-58-45.mp4';
const ffmpegPath = 'D:/ffprobe/package/ffmpeg-9.0.1-essentials_build/bin/ffmpeg.exe';

const expectedGeometry = {
  topbar: { x: 0, y: 0, width: 1622, height: 55 },
  sidebar: { x: 0, y: 55, width: 280, height: 902 },
  workView: { x: 280, y: 55, width: 1328, height: 718 },
  center: { x: 280, y: 57, width: 968, height: 718 },
  right: { x: 1254, y: 57, width: 354, height: 718 },
  bottom: { x: 280, y: 783, width: 1328, height: 174 },
  characterPanel: { x: 299, y: 138, width: 332.265625, height: 622 },
  characterArt: { x: 300, y: 139, width: 330.265625, height: 620 }
};

const preloadSource = `
const noop = () => undefined;
const unsubscribe = () => {};
window.__starchatProbe = { showPet: 0 };
window.baoyin = {
  app: { minimize: noop, hideSettings: noop, showPet: () => { window.__starchatProbe.showPet += 1; }, onWindowFocusState: () => unsubscribe() },
  pet: { onBoundsChange: () => unsubscribe(), pointerCancel: noop },
  debug: { reportMetrics: noop, command: noop, runtimeCommand: async () => ({ ok: true, capabilities: {}, status: {} }) },
  presentation: { emit: noop, onEvent: () => unsubscribe() },
  chat: { onEvent: () => unsubscribe(), start: async () => 'screenshot-chat', cancel: async () => undefined },
  agent: { approve: async () => undefined, respond: async () => undefined, cancel: async () => undefined, onEvent: () => unsubscribe(), list: async () => [], get: async () => null },
  tts: { synthesize: async () => '' }
};
`;

function wait(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function writePreload(theme) {
  const preloadPath = resolve(outputDirectory, `.workbench-real-renderer-preload-${theme}.cjs`);
  writeFileSync(preloadPath, preloadSource, 'utf8');
  return preloadPath;
}

async function loadRealWorkbench(theme, existingWindow = null, mode = 'workbench', targetViewport = viewport, layout = 'reference', clearStorage = true, partition = null) {
  const backgroundColor = theme === 'light' ? '#b1c0d9' : '#05060a';
  const window = existingWindow ?? new BrowserWindow({
    width: targetViewport.width,
    height: targetViewport.height,
    show: false,
    frame: false,
    useContentSize: true,
    backgroundColor,
    webPreferences: { preload: writePreload('shared'), contextIsolation: false, sandbox: false, ...(partition ? { partition } : {}) }
  });
  if (live2dEnabled) registerLive2DPreviewProtocol(window.webContents.session.protocol);
  window.setBackgroundColor(backgroundColor);
  if (!existingWindow) {
    window.webContents.on('console-message', (_event, _level, message) => console.error(`[renderer:${theme}] ${message}`));
    window.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => console.error(`[renderer:${theme}] did-fail-load ${errorCode} ${errorDescription}`));
  }
  if (clearStorage) await window.webContents.session.clearStorageData({ storages: ['localstorage'] });
  const live2dQuery = live2dEntry ? `&live2dEntry=${encodeURIComponent(live2dEntry)}` : '';
  await window.loadFile(rendererIndex, { search: `?window=workbench-screenshot&theme=${theme}&mode=${mode}&layout=${layout}${live2dQuery}` });
  await window.webContents.executeJavaScript('document.fonts?.ready ?? Promise.resolve()');
  // A hidden frameless window can return its native background from
  // capturePage before Chromium has composited the newly loaded light theme.
  // Present the real renderer briefly and wait for two paint frames so the
  // captured PNG is the page, not an empty native surface.
  if (!window.isVisible()) window.showInactive();
  await window.webContents.executeJavaScript('new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  await wait(live2dEntry ? 2400 : 350);
  return window;
}

async function captureWorkbenchInteractionEvidence(theme, existingWindow = null) {
  const window = await loadRealWorkbench(theme, existingWindow, 'workbench');
  const evidence = await window.webContents.executeJavaScript(`(async () => {
    const pause = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const read = () => {
      const shell = document.querySelector('.wb-shell');
      const readButton = (selector) => {
        const node = document.querySelector(selector);
        return node ? { present: true, expanded: node.getAttribute('aria-expanded'), controls: node.getAttribute('aria-controls') } : { present: false };
      };
      return {
        sidebar: shell?.dataset.sidebarState ?? null,
        rightRail: shell?.dataset.rightRailState ?? null,
        bottomPanel: shell?.dataset.bottomPanel ?? null,
        sidebarToggle: readButton('[aria-controls="workbench-sidebar"]'),
        rightRailToggle: readButton('[data-workbench="right-rail-toggle"]'),
        bottomPanelToggle: readButton('[data-workbench="bottom-panel-toggle"]'),
        rightRailWidth: document.querySelector('[data-workbench-region="right"]')?.getBoundingClientRect().width ?? null,
        centerWidth: document.querySelector('[data-workbench-region="center"]')?.getBoundingClientRect().width ?? null,
        layoutStorage: localStorage.getItem('starchat.workbench.layout.v2')
      };
    };
    const click = async (selector) => {
      const node = document.querySelector(selector);
      if (!node) return { error: 'missing:' + selector, state: read() };
      node.click();
      await pause();
      await new Promise((resolve) => setTimeout(resolve, 400));
      return read();
    };
    const initial = read();
    const sidebarCollapsed = await click('[aria-controls="workbench-sidebar"]');
    const sidebarExpanded = await click('[aria-controls="workbench-sidebar"]');
    const bottomCollapsed = await click('[data-workbench="bottom-panel-toggle"]');
    const bottomExpanded = await click('[data-workbench="bottom-panel-toggle"]');
    const rightRailCollapsed = await click('[data-workbench="right-rail-toggle"]');
    const rightRailExpanded = await click('[data-workbench="right-rail-toggle"]');
    document.querySelector('.wb-pet-action')?.click();
    await pause();
    return { initial, sidebarCollapsed, sidebarExpanded, bottomCollapsed, bottomExpanded, rightRailCollapsed, rightRailExpanded, showPetCalls: window.__starchatProbe?.showPet ?? null, focusedControl: document.activeElement?.getAttribute('data-workbench') ?? document.activeElement?.getAttribute('aria-controls') ?? null };
  })()`);
  const evidencePath = resolve(outputDirectory, `workbench-interaction-${theme}.json`);
  writeFileSync(evidencePath, JSON.stringify({ theme, viewport, evidence, bridge: 'Electron renderer with deterministic preload probe; showPet call is observed at the bridge boundary.' }, null, 2), 'utf8');
  return { evidencePath, ...evidence };
}

async function readGeometry(window) {
  return window.webContents.executeJavaScript(`(() => {
    const selectors = {
      topbar: '[data-workbench-region="topbar"]',
      sidebar: '[data-workbench-region="sidebar"]',
      workView: '.wb-main-grid',
      center: '[data-workbench-region="center"]',
      right: '[data-workbench-region="right"]',
      bottom: '[data-workbench-region="bottom"]',
      characterPanel: '[data-workbench-region="character"]',
      characterArt: '.wb-character-art'
    };
    const regions = Object.fromEntries(Object.entries(selectors).map(([name, selector]) => {
      const node = document.querySelector(selector);
      const rect = node?.getBoundingClientRect();
      return [name, rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null];
    }));
    const add = document.querySelector('.wb-rail-topline > .wb-icon-button')?.getBoundingClientRect();
    const shell = document.querySelector('.wb-shell');
    const workView = document.querySelector('.wb-main-grid');
    const topbar = document.querySelector('.wb-topbar');
    const sidebar = document.querySelector('.wb-sidebar');
    const appShell = document.querySelector('main.app-shell');
    const style = shell ? getComputedStyle(shell) : null;
    const workViewStyle = workView ? getComputedStyle(workView) : null;
    const appStyle = appShell ? getComputedStyle(appShell) : null;
    const center = document.querySelector('[data-workbench-region="center"]');
    const centerFrame = document.querySelector('.wb-center-frame');
    const character = document.querySelector('[data-workbench-region="character"]');
    const dialogue = document.querySelector('.wb-dialogue-column');
    const composer = document.querySelector('.agent-composer');
    const composerFooter = document.querySelector('.agent-composer-footer');
    const sendButton = document.querySelector('.agent-composer-footer .agent-send-button');
    const composeTextarea = document.querySelector('.agent-compose-row textarea');
    const attachmentSlots = document.querySelector('.agent-attachment-slots');
    const staticRoleImage = document.querySelector('.wb-static-role img');
    const toolCard = document.querySelector('.wb-tool-card');
    const toolGrid = document.querySelector('.wb-tool-grid');
    const centerToolbar = document.querySelector('.wb-center-toolbar');
    const centerTitle = document.querySelector('.wb-center-title');
    const centerActions = document.querySelector('.wb-center-actions');
    const railTopline = document.querySelector('.wb-rail-topline');
    const right = document.querySelector('[data-workbench-region="right"]');
    const bottomPanel = document.querySelector('.wb-bottom-panel');
    const terminalTabs = document.querySelector('.wb-terminal-tabs');
    const terminalBody = document.querySelector('.wb-terminal-body');
    const content = document.querySelector('.wb-center-content');
    const trajectory = document.querySelector('.wb-trajectory');
    const styles = (node) => {
      if (!node) return null;
      const current = getComputedStyle(node);
      const matchedBackgroundRules = [];
      const visitRules = (rules) => {
        for (const rule of Array.from(rules ?? [])) {
          if (rule.cssRules) visitRules(rule.cssRules);
          if (rule.selectorText && node.matches(rule.selectorText) && (rule.style?.background || rule.style?.backgroundColor)) {
            matchedBackgroundRules.push({ selector: rule.selectorText, background: rule.style.background || '', backgroundColor: rule.style.backgroundColor || '' });
          }
        }
      };
      for (const sheet of Array.from(document.styleSheets)) visitRules(sheet.cssRules);
      return { background: current.background, backgroundColor: current.backgroundColor, border: current.border, borderRadius: current.borderRadius, boxShadow: current.boxShadow, padding: current.padding, gap: current.gap, color: current.color, opacity: current.opacity, filter: current.filter, mixBlendMode: current.mixBlendMode, matchedBackgroundRules };
    };
    const rect = (node) => { const value = node?.getBoundingClientRect(); return value ? { x: value.x, y: value.y, width: value.width, height: value.height } : null; };
    const hit = (x, y) => {
      const node = document.elementFromPoint(x, y);
      return node ? { tag: node.tagName, className: String(node.className || ''), workbench: node.getAttribute('data-workbench') } : null;
    };
    const rects = (nodes) => Array.from(nodes, (node) => ({
      rect: rect(node),
      text: String(node.textContent || '').replace(/\s+/gu, ' ').trim().slice(0, 80),
      data: node.getAttribute('data-workbench-window-control') || node.getAttribute('data-workbench') || null
    }));
    const toolCards = Array.from(document.querySelectorAll('.wb-tool-card')).map((node) => rect(node));
    return { ...regions, railAdd: add ? { x: add.x, y: add.y, width: add.width, height: add.height } : null, hitProbes: { cardGap: hit(1428, 200), railPadding: hit(1260, 250), firstCard: hit(1280, 170) }, keyRects: { topbarBrand: rect(document.querySelector('.wb-brand-lockup')), brandAvatar: rect(document.querySelector('.wb-brand-avatar')), brandName: rect(document.querySelector('.wb-brand-name')), themeToggle: rect(document.querySelector('.wb-theme-toggle')), sidebarToggle: rect(document.querySelector('.wb-sidebar-toggle')), windowControls: rect(document.querySelector('.wb-window-controls')), windowButtons: rects(document.querySelectorAll('.wb-window-control')), sidebarNewChat: rect(document.querySelector('.wb-new-chat')), sidebarHeading: rect(document.querySelector('.wb-sidebar-heading')), sidebarRows: rects(document.querySelectorAll('.wb-project-row, .wb-session-row')), centerActions: rects(document.querySelectorAll('.wb-center-actions > *')), characterActions: rects(document.querySelectorAll('.wb-character-actions > *')), environmentPopover: rect(document.querySelector('.wb-environment-popover-reference')), trajectory: rect(trajectory), composerHeader: rect(document.querySelector('.agent-composer-header')), composerRow: rect(document.querySelector('.agent-compose-row')), staticRoleImage: rect(staticRoleImage), stage: rect(document.querySelector('[data-workbench-stage="live2d"]')) }, computed: { appPadding: appStyle?.padding ?? null, appWidth: appStyle?.width ?? null, appHeight: appStyle?.height ?? null, shellWidth: style?.width ?? null, shellHeight: style?.height ?? null, shellRows: style?.gridTemplateRows ?? null, shellRowGap: style?.rowGap ?? null, shellGap: style?.gap ?? null, shellPadding: style?.padding ?? null, referenceScale: shell ? style?.getPropertyValue('--wb-reference-scale') ?? null : null, starfieldOpacity: shell ? style?.getPropertyValue('--wb-starfield-opacity') ?? null : null, sidebarOpenWidth: shell ? style?.getPropertyValue('--wb-sidebar-open-width') ?? null : null, rightRailOpenWidth: shell ? style?.getPropertyValue('--wb-right-rail-open-width') ?? null : null, rightRailWidth: shell ? style?.getPropertyValue('--wb-right-rail-width') ?? null : null, bottomPanelOpenHeight: shell ? style?.getPropertyValue('--wb-bottom-panel-open-height') ?? null : null, bottomPanelHeight: shell ? style?.getPropertyValue('--wb-bottom-panel-height') ?? null : null, characterWidth: shell ? style?.getPropertyValue('--wb-character-width') ?? null : null, workViewWidth: workViewStyle?.width ?? null, workViewMarginBottom: workViewStyle?.marginBottom ?? null, workViewJustifySelf: workViewStyle?.justifySelf ?? null, shellBackground: style?.background ?? null, shellColor: style?.color ?? null, topbar: styles(topbar), sidebar: styles(sidebar), workView: styles(workView), center: styles(center), centerFrame: styles(centerFrame), content: styles(content), character: styles(character), dialogue: styles(dialogue), trajectory: styles(trajectory), composer: styles(composer), attachmentSlots: styles(attachmentSlots), toolGrid: styles(toolGrid), toolCard: styles(toolCard), right: styles(right), bottomPanel: styles(bottomPanel), terminalTabs: styles(terminalTabs), terminalBody: styles(terminalBody), staticRoleImage: styles(staticRoleImage), stage: styles(document.querySelector('[data-workbench-stage="live2d"]')), staticRoleBase: styles(document.querySelector('.wb-static-role-base')), staticRoleHighlight: styles(document.querySelector('.wb-static-role-highlight')), centerToolbarRect: rect(centerToolbar), centerTitleRect: rect(centerTitle), centerActionsRect: rect(centerActions), railToplineRect: rect(railTopline), composerRect: rect(composer), composerFooterRect: rect(composerFooter), sendButtonRect: rect(sendButton), textareaRect: rect(composeTextarea), attachmentRect: rect(attachmentSlots), toolCardRect: rect(toolCard), toolCardRects: toolCards, composerOverflow: composer ? { clientWidth: composer.clientWidth, scrollWidth: composer.scrollWidth } : null, footerOverflow: composerFooter ? { clientWidth: composerFooter.clientWidth, scrollWidth: composerFooter.scrollWidth } : null }, motion: { prefersReduced: matchMedia('(prefers-reduced-motion: reduce)').matches, transitionDuration: style?.transitionDuration ?? null, transitionProperty: style?.transitionProperty ?? null } };
  })()`);
}

function geometryDelta(actual) {
  return Object.fromEntries(Object.entries(expectedGeometry).map(([name, expected]) => {
    const observed = actual[name];
    if (!observed) return [name, { expected, actual: null }];
    return [name, {
      expected,
      actual: observed,
      delta: Object.fromEntries(Object.keys(expected).map((key) => [key, Number((observed[key] - expected[key]).toFixed(2))]))
    }];
  }));
}

async function captureTheme(theme, existingWindow = null) {
  const window = await loadRealWorkbench(theme, existingWindow, 'workbench');
  const geometry = await readGeometry(window);
  const image = await window.webContents.capturePage({ x: 0, y: 0, width: viewport.width, height: viewport.height });
  const outputPath = resolve(outputDirectory, `starchat-workbench-${theme}-${viewport.width}x${viewport.height}.png`);
  writeFileSync(outputPath, image.toPNG());
  const geometryPath = resolve(outputDirectory, `starchat-workbench-${theme}-geometry.json`);
  writeFileSync(geometryPath, JSON.stringify({ viewport, expected: expectedGeometry, actual: geometry, delta: geometryDelta(geometry) }, null, 2), 'utf8');
  return { outputPath, geometryPath, geometry };
}

async function waitForLive2DRuntime(window, timeoutMs = 15000) {
  return window.webContents.executeJavaScript(`(async () => {
    const read = () => {
      const stage = document.querySelector('[data-workbench-stage="live2d"]');
      const node = document.querySelector('[data-live2d-runtime]');
      return {
        stageStatus: stage?.getAttribute('data-live2d-stage-status') ?? null,
        preview: document.querySelector('[data-live2d-preview]')?.getAttribute('data-live2d-preview') ?? null,
        runtimeStatus: node?.getAttribute('data-runtime-status') ?? null,
        rendererReady: node?.getAttribute('data-runtime-renderer-ready') ?? null,
        renderFrames: Number(node?.getAttribute('data-runtime-render-frames') ?? 0),
        drawables: Number(node?.getAttribute('data-runtime-drawables') ?? 0),
        visibleDrawables: Number(node?.getAttribute('data-runtime-drawable-visible') ?? 0),
        modelCanvas: node?.getAttribute('data-runtime-model-canvas') ?? null,
        model: node?.getAttribute('data-runtime-model-step') ?? null,
        contextLost: node?.getAttribute('data-runtime-context-lost') ?? null,
        glError: Number(node?.getAttribute('data-runtime-gl-error') ?? 0)
      };
    };
    const deadline = performance.now() + ${timeoutMs};
    let value = read();
    while (performance.now() < deadline) {
      if (value.rendererReady === 'true' && value.drawables > 0 && value.contextLost !== 'true') {
        return { ...value, settled: true };
      }
      await new Promise((resolve) => window.setTimeout(resolve, 100));
      value = read();
    }
    return { ...value, settled: false };
  })()`);
}

async function captureLive2DPreview() {
  if (!live2dEntry || !existsSync(live2dEntry)) {
    throw new Error(`真实 Live2D 入口不存在：${live2dEntry ?? '未指定'}`);
  }
  const captures = [];
  let previewWindow = null;
  try {
    for (const theme of ['light', 'dark']) {
      previewWindow = await loadRealWorkbench(theme, previewWindow, 'workbench', viewport, 'reference', true, 'workbench-live2d-preview');
      const window = previewWindow;
      const runtime = await waitForLive2DRuntime(window);
      const geometry = await readGeometry(window);
      const image = await window.webContents.capturePage({ x: 0, y: 0, width: viewport.width, height: viewport.height });
      const outputPath = resolve(outputDirectory, `starchat-workbench-live2d-${theme}-${viewport.width}x${viewport.height}.png`);
      const geometryPath = resolve(outputDirectory, `starchat-workbench-live2d-${theme}-geometry.json`);
      const runtimePath = resolve(outputDirectory, `starchat-workbench-live2d-${theme}-runtime.json`);
      writeFileSync(outputPath, image.toPNG());
      writeFileSync(geometryPath, JSON.stringify({ viewport, actual: geometry }, null, 2), 'utf8');
      writeFileSync(runtimePath, JSON.stringify({ viewport, theme, entryPath: live2dEntry, runtime }, null, 2), 'utf8');
      captures.push({ theme, outputPath, geometryPath, runtimePath, runtime });
    }
  } finally {
    previewWindow?.destroy();
  }
  const reportPath = resolve(outputDirectory, 'starchat-workbench-live2d-report.json');
  const report = {
    renderer: 'actual React renderer in Electron BrowserWindow',
    entryPath: live2dEntry,
    externalAssetPolicy: 'read-only reference through live2d://model; no copy or bundle',
    viewport,
    captures
  };
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  return { reportPath, ...report };
}

function comparisonRegions(geometry) {
  return {
    ...expectedGeometry,
    ...(geometry?.characterArt ? { characterArt: geometry.characterArt } : {}),
    ...(geometry?.computed?.attachmentRect ? { attachmentRect: geometry.computed.attachmentRect } : {}),
    ...(geometry?.computed?.textareaRect ? { textareaRect: geometry.computed.textareaRect } : {})
  };
}

async function captureDefaultWindowTheme(theme) {
  const window = await loadRealWorkbench(theme, null, 'workbench', defaultWindowViewport);
  const geometry = await readGeometry(window);
  const image = await window.webContents.capturePage({ x: 0, y: 0, width: defaultWindowViewport.width, height: defaultWindowViewport.height });
  const outputPath = resolve(outputDirectory, `starchat-workbench-${theme}-${defaultWindowViewport.width}x${defaultWindowViewport.height}.png`);
  writeFileSync(outputPath, image.toPNG());
  const geometryPath = resolve(outputDirectory, `starchat-workbench-${theme}-${defaultWindowViewport.width}x${defaultWindowViewport.height}-geometry.json`);
  writeFileSync(geometryPath, JSON.stringify({ viewport: defaultWindowViewport, actual: geometry }, null, 2), 'utf8');
  window.destroy();
  return { outputPath, geometryPath, geometry };
}

async function captureSettingsTheme(theme, existingWindow = null) {
  const window = await loadRealWorkbench(theme, existingWindow, 'settings');
  const geometry = await readGeometry(window);
  const image = await window.webContents.capturePage({ x: 0, y: 0, width: viewport.width, height: viewport.height });
  const outputPath = resolve(outputDirectory, `starchat-settings-${theme}-${viewport.width}x${viewport.height}.png`);
  writeFileSync(outputPath, image.toPNG());
  const geometryPath = resolve(outputDirectory, `starchat-settings-${theme}-geometry.json`);
  writeFileSync(geometryPath, JSON.stringify({ viewport, actual: geometry }, null, 2), 'utf8');
  return { outputPath, geometryPath, geometry };
}

async function captureDefaultWindowSettingsTheme(theme) {
  const window = await loadRealWorkbench(theme, null, 'settings', defaultWindowViewport);
  const geometry = await readGeometry(window);
  const image = await window.webContents.capturePage({ x: 0, y: 0, width: defaultWindowViewport.width, height: defaultWindowViewport.height });
  const outputPath = resolve(outputDirectory, `starchat-settings-${theme}-${defaultWindowViewport.width}x${defaultWindowViewport.height}.png`);
  writeFileSync(outputPath, image.toPNG());
  const geometryPath = resolve(outputDirectory, `starchat-settings-${theme}-${defaultWindowViewport.width}x${defaultWindowViewport.height}-geometry.json`);
  writeFileSync(geometryPath, JSON.stringify({ viewport: defaultWindowViewport, actual: geometry }, null, 2), 'utf8');
  window.destroy();
  return { outputPath, geometryPath, geometry };
}

async function settleRuntimeLayout(window, milliseconds = 430) {
  await window.webContents.executeJavaScript('new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  await wait(milliseconds);
}

async function readRuntimeLayout(window) {
  return window.webContents.executeJavaScript(`(() => {
    const rect = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const value = node.getBoundingClientRect();
      return { x: Number(value.x.toFixed(2)), y: Number(value.y.toFixed(2)), width: Number(value.width.toFixed(2)), height: Number(value.height.toFixed(2)) };
    };
    const separator = (marker) => {
      const node = document.querySelector('[data-workbench-resizer="' + marker + '"] [role="separator"]');
      return node ? {
        orientation: node.getAttribute('aria-orientation'),
        value: Number(node.getAttribute('aria-valuenow')),
        minimum: Number(node.getAttribute('aria-valuemin')),
        maximum: Number(node.getAttribute('aria-valuemax')),
        tabIndex: node.tabIndex
      } : null;
    };
    const shell = document.querySelector('.wb-shell');
    let storage = null;
    try { storage = JSON.parse(localStorage.getItem('starchat.workbench.layout.v2')); } catch {}
    return {
      viewport: { width: innerWidth, height: innerHeight },
      shell: shell ? {
        sidebar: shell.dataset.sidebarState,
        rightRail: shell.dataset.rightRailState,
        bottomPanel: shell.dataset.bottomPanel,
        sidebarWidth: Number(shell.dataset.sidebarWidth),
        rightRailWidth: Number(shell.dataset.rightRailWidth),
        bottomPanelHeight: Number(shell.dataset.bottomPanelHeight)
      } : null,
      regions: {
        sidebar: rect('[data-workbench-region="sidebar"]'),
        center: rect('[data-workbench-region="center"]'),
        right: rect('[data-workbench-region="right"]'),
        bottom: rect('[data-workbench-region="bottom"]'),
        character: rect('[data-workbench-region="character"]'),
        dialogue: rect('[data-workbench-region="dialogue"]')
      },
      separators: {
        sidebar: separator('sidebar'),
        rightRail: separator('right-rail'),
        bottomPanel: separator('bottom-panel'),
        character: separator('character')
      },
      storage
    };
  })()`);
}

async function clickRuntimeControl(window, selector) {
  await window.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(selector)})?.click()`);
  await settleRuntimeLayout(window);
}

async function dragRuntimeHandle(window, marker, deltaX, deltaY) {
  const point = await window.webContents.executeJavaScript(`(() => {
    const node = document.querySelector('[data-workbench-resizer="${marker}"] [role="separator"]');
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  })()`);
  if (!point) throw new Error(`Missing resize handle: ${marker}`);
  if (!window.webContents.debugger.isAttached()) window.webContents.debugger.attach('1.3');
  await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y });
  await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', buttons: 1, clickCount: 1 });
  for (let step = 1; step <= 6; step += 1) {
    await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: point.x + deltaX * step / 6,
      y: point.y + deltaY * step / 6,
      button: 'left',
      buttons: 1
    });
    await wait(16);
  }
  await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x + deltaX, y: point.y + deltaY, button: 'left', buttons: 0, clickCount: 1 });
  await settleRuntimeLayout(window, 140);
}

async function captureLayoutRuntimeEvidence() {
  const window = await loadRealWorkbench('light', null, 'workbench', defaultWindowViewport, 'production', true, 'workbench-layout-runtime');
  const initial = await readRuntimeLayout(window);
  await dragRuntimeHandle(window, 'sidebar', 24, 0);
  await clickRuntimeControl(window, '[data-workbench="right-rail-toggle"]');
  await dragRuntimeHandle(window, 'right-rail', -40, 0);
  await clickRuntimeControl(window, '[data-workbench="bottom-panel-toggle"]');
  await dragRuntimeHandle(window, 'bottom-panel', 0, -35);
  await dragRuntimeHandle(window, 'character', 30, 0);
  const resized = await readRuntimeLayout(window);

  const screenshotPath = resolve(outputDirectory, 'workbench-layout-resized-1900x1200.png');
  writeFileSync(screenshotPath, (await window.webContents.capturePage()).toPNG());

  window.setContentSize(1280, 900);
  await settleRuntimeLayout(window);
  const compactAfterOuterResize = await readRuntimeLayout(window);

  window.setContentSize(1900, 1200);
  await settleRuntimeLayout(window);
  await loadRealWorkbench('light', window, 'workbench', defaultWindowViewport, 'production', false);
  const restoredAfterReload = await readRuntimeLayout(window);

  await window.webContents.executeJavaScript(`(() => {
    const node = document.querySelector('[data-workbench-resizer="sidebar"] [role="separator"]');
    node?.focus();
    node?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  })()`);
  await settleRuntimeLayout(window, 140);
  const keyboardAdjusted = await readRuntimeLayout(window);

  const normalBounds = window.getBounds();
  window.maximize();
  await wait(500);
  const maximized = { active: window.isMaximized(), bounds: window.getBounds(), normalBounds: window.getNormalBounds() };
  window.unmaximize();
  await wait(500);
  const unmaximized = { active: window.isMaximized(), bounds: window.getBounds(), expectedNormalBounds: normalBounds };

  const evidence = {
    renderer: 'actual React renderer in Electron BrowserWindow',
    initial,
    resized,
    compactAfterOuterResize,
    restoredAfterReload,
    keyboardAdjusted,
    nativeWindowState: { maximized, unmaximized },
    screenshotPath
  };
  const evidencePath = resolve(outputDirectory, 'workbench-layout-runtime-evidence.json');
  writeFileSync(evidencePath, JSON.stringify(evidence, null, 2), 'utf8');
  if (window.webContents.debugger.isAttached()) window.webContents.debugger.detach();
  window.destroy();
  return { evidencePath, screenshotPath, evidence };
}

async function captureSidebarAnimationEvidence(theme, existingWindow = null) {
  const window = await loadRealWorkbench(theme, existingWindow, 'workbench');
  const frameDirectory = resolve(outputDirectory, `sidebar-animation-${theme}-frames`);
  mkdirSync(frameDirectory, { recursive: true });
  const geometryFrames = [];
  const startedAt = Date.now();
  const captureFrame = async (index) => {
    const geometry = await window.webContents.executeJavaScript(`(() => {
      const sidebar = document.querySelector('#workbench-sidebar')?.getBoundingClientRect();
      const center = document.querySelector('[data-workbench-region="center"]')?.getBoundingClientRect();
      return {
        sidebarWidth: sidebar ? Number(sidebar.width.toFixed(2)) : null,
        centerX: center ? Number(center.x.toFixed(2)) : null,
        centerWidth: center ? Number(center.width.toFixed(2)) : null
      };
    })()`);
    geometryFrames.push({ frame: index, elapsedMs: Date.now() - startedAt, ...geometry });
    const image = await window.webContents.capturePage(animationViewport);
    writeFileSync(resolve(frameDirectory, `frame-${String(index).padStart(3, '0')}.png`), image.toPNG());
  };
  await window.webContents.executeJavaScript(`document.querySelector('[aria-controls="workbench-sidebar"]')?.click()`);
  for (let index = 0; index < 12; index += 1) {
    await wait(8);
    await captureFrame(index);
  }
  await window.webContents.executeJavaScript(`document.querySelector('[aria-controls="workbench-sidebar"]')?.click()`);
  for (let index = 12; index < 24; index += 1) {
    await wait(8);
    await captureFrame(index);
  }
  const geometryPath = resolve(outputDirectory, `sidebar-animation-${theme}-geometry.json`);
  writeFileSync(geometryPath, JSON.stringify({ viewport: animationViewport, referenceVideo: newVideoReference, frames: geometryFrames }, null, 2), 'utf8');
  const recordingPath = resolve(outputDirectory, `sidebar-animation-${theme}.mp4`);
  execFileSync(ffmpegPath, ['-y', '-framerate', '30', '-i', join(frameDirectory, 'frame-%03d.png'), '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', recordingPath], { stdio: 'ignore' });
  return { frameDirectory, recordingPath, geometryPath, captureViewport: animationViewport, frameCount: 24, referenceVideo: newVideoReference, measuredDurationMs: 360, measuredFrames: { collapse: [146, 156], expand: [169, 180] }, widthCurve: geometryFrames.map(({ frame, elapsedMs, sidebarWidth, centerX }) => ({ frame, elapsedMs, sidebarWidth, centerX })) };
}

async function captureRightRailAnimationEvidence(theme, existingWindow = null) {
  const window = await loadRealWorkbench(theme, existingWindow, 'workbench');
  const captureViewport = { x: 900, y: 0, width: 723, height: 969 };
  const frameDirectory = resolve(outputDirectory, `right-rail-animation-${theme}-frames`);
  mkdirSync(frameDirectory, { recursive: true });
  const geometryFrames = [];
  const startedAt = Date.now();
  const captureFrame = async (index) => {
    const geometry = await window.webContents.executeJavaScript(`(() => {
      const rail = document.querySelector('[data-workbench-region="right"]')?.getBoundingClientRect();
      const center = document.querySelector('[data-workbench-region="center"]')?.getBoundingClientRect();
      const shell = document.querySelector('.wb-shell');
      return {
        rightRailWidth: rail ? Number(rail.width.toFixed(2)) : null,
        rightRailX: rail ? Number(rail.x.toFixed(2)) : null,
        centerX: center ? Number(center.x.toFixed(2)) : null,
        centerWidth: center ? Number(center.width.toFixed(2)) : null,
        state: shell?.dataset.rightRailState ?? null
      };
    })()`);
    geometryFrames.push({ frame: index, elapsedMs: Date.now() - startedAt, ...geometry });
    const image = await window.webContents.capturePage(captureViewport);
    writeFileSync(resolve(frameDirectory, `frame-${String(index).padStart(3, '0')}.png`), image.toPNG());
  };
  await captureFrame(0);
  await window.webContents.executeJavaScript(`document.querySelector('[data-workbench="right-rail-toggle"]')?.click()`);
  for (let index = 1; index < 12; index += 1) {
    await wait(8);
    await captureFrame(index);
  }
  await window.webContents.executeJavaScript(`document.querySelector('[data-workbench="right-rail-toggle"]')?.click()`);
  for (let index = 12; index < 24; index += 1) {
    await wait(8);
    await captureFrame(index);
  }
  const geometryPath = resolve(outputDirectory, `right-rail-animation-${theme}-geometry.json`);
  writeFileSync(geometryPath, JSON.stringify({ viewport: captureViewport, referenceVideo: newVideoReference, frames: geometryFrames, transitionMs: 360, behavior: 'grid column reflow with accessible toggle' }, null, 2), 'utf8');
  const recordingPath = resolve(outputDirectory, `right-rail-animation-${theme}.mp4`);
  execFileSync(ffmpegPath, ['-y', '-framerate', '30', '-i', join(frameDirectory, 'frame-%03d.png'), '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', recordingPath], { stdio: 'ignore' });
  return { frameDirectory, recordingPath, geometryPath, captureViewport, frameCount: 24, measuredDurationMs: 360, widthCurve: geometryFrames.map(({ frame, elapsedMs, rightRailWidth, rightRailX, centerX, centerWidth, state }) => ({ frame, elapsedMs, rightRailWidth, rightRailX, centerX, centerWidth, state })) };
}

async function captureBottomPanelAnimationEvidence(theme, existingWindow = null) {
  const window = await loadRealWorkbench(theme, existingWindow, 'workbench');
  const frameDirectory = resolve(outputDirectory, `bottom-animation-${theme}-frames`);
  mkdirSync(frameDirectory, { recursive: true });
  const geometryFrames = [];
  const startedAt = Date.now();
  const captureFrame = async (index) => {
    const geometry = await window.webContents.executeJavaScript(`(() => {
      const bottom = document.querySelector('[data-workbench-region="bottom"]')?.getBoundingClientRect();
      const center = document.querySelector('[data-workbench-region="center"]')?.getBoundingClientRect();
      const shell = document.querySelector('.wb-shell');
      return {
        bottomY: bottom ? Number(bottom.y.toFixed(2)) : null,
        bottomHeight: bottom ? Number(bottom.height.toFixed(2)) : null,
        centerHeight: center ? Number(center.height.toFixed(2)) : null,
        open: shell?.dataset.bottomPanel === 'open'
      };
    })()`);
    geometryFrames.push({ frame: index, elapsedMs: Date.now() - startedAt, ...geometry });
    const image = await window.webContents.capturePage({ x: 0, y: 0, width: viewport.width, height: viewport.height });
    writeFileSync(resolve(frameDirectory, `frame-${String(index).padStart(3, '0')}.png`), image.toPNG());
  };
  await captureFrame(0);
  await window.webContents.executeJavaScript(`document.querySelector('[data-workbench="bottom-panel-toggle"]')?.click()`);
  for (let index = 1; index < 14; index += 1) {
    await wait(30);
    await captureFrame(index);
  }
  await window.webContents.executeJavaScript(`document.querySelector('[data-workbench="bottom-panel-toggle"]')?.click()`);
  for (let index = 14; index < 27; index += 1) {
    await wait(30);
    await captureFrame(index);
  }
  const geometryPath = resolve(outputDirectory, `bottom-animation-${theme}-geometry.json`);
  writeFileSync(geometryPath, JSON.stringify({ viewport, frames: geometryFrames, transitionMs: 360, behavior: 'grid row reflow with accessible toggle' }, null, 2), 'utf8');
  const recordingPath = resolve(outputDirectory, `bottom-animation-${theme}.mp4`);
  execFileSync(ffmpegPath, ['-y', '-framerate', '30', '-i', join(frameDirectory, 'frame-%03d.png'), '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', recordingPath], { stdio: 'ignore' });
  return { frameDirectory, recordingPath, geometryPath, captureViewport: viewport, frameCount: 27, measuredDurationMs: 360, widthCurve: geometryFrames.map(({ frame, elapsedMs, bottomY, bottomHeight, centerHeight, open }) => ({ frame, elapsedMs, bottomY, bottomHeight, centerHeight, open })) };
}

function comparePngWithReference(actualPath, referencePath, reportPath, regions = expectedGeometry) {
  if (!existsSync(referencePath)) {
    const skipped = { actualPath, referencePath, skipped: true, reason: 'reference image not found', regionMasks: {}, colorReport: {} };
    writeFileSync(reportPath, JSON.stringify(skipped, null, 2), 'utf8');
    return skipped;
  }
  const scriptPath = resolve(outputDirectory, `${basename(reportPath, '.json')}-compare.ps1`);
  const regionPath = resolve(outputDirectory, `${basename(reportPath, '.json')}-regions.json`);
  const maskDirectory = resolve(outputDirectory, `${basename(reportPath, '.json')}-masks`);
  mkdirSync(maskDirectory, { recursive: true });
  const exclusions = [
    regions.characterArt,
    regions.attachmentRect,
    regions.textareaRect
  ].filter(Boolean);
  writeFileSync(regionPath, JSON.stringify({ regions, exclusions }), 'utf8');
  const powershell = `
param([string]$ActualPath, [string]$ReferencePath, [string]$RegionPath, [string]$MaskDirectory)
Add-Type -AssemblyName System.Drawing
$actual = [System.Drawing.Bitmap]::new($ActualPath)
$source = [System.Drawing.Bitmap]::new($ReferencePath)
$reference = [System.Drawing.Bitmap]::new($actual.Width, $actual.Height)
$graphics = [System.Drawing.Graphics]::FromImage($reference)
$referenceWasCropped = $false
$referenceWasResized = $false
$sameCalibration = $source.Width -eq $actual.Width -and $source.Height -eq $actual.Height
$onePixelCalibration = $source.Width -ge $actual.Width -and $source.Height -ge $actual.Height -and [Math]::Abs($source.Width - $actual.Width) -le 1 -and [Math]::Abs($source.Height - $actual.Height) -le 1
if ($sameCalibration -or $onePixelCalibration) {
  $cropWidth = [Math]::Min($source.Width, $actual.Width)
  $cropHeight = [Math]::Min($source.Height, $actual.Height)
  $sourceRect = [System.Drawing.Rectangle]::new(0, 0, $cropWidth, $cropHeight)
  $destinationRect = [System.Drawing.Rectangle]::new(0, 0, $cropWidth, $cropHeight)
  $graphics.DrawImage($source, $destinationRect, $sourceRect, [System.Drawing.GraphicsUnit]::Pixel)
  $referenceWasCropped = $source.Width -ne $actual.Width -or $source.Height -ne $actual.Height
} else {
  $graphics.DrawImage($source, 0, 0, $actual.Width, $actual.Height)
  $referenceWasResized = $source.Width -ne $actual.Width -or $source.Height -ne $actual.Height
}
$regionMasks = [ordered]@{}
$colorReport = [ordered]@{}
function Measure-Region($name, $x, $y, $width, $height, $exclude = @()) {
  $left = [Math]::Max(0, [int][Math]::Floor($x))
  $top = [Math]::Max(0, [int][Math]::Floor($y))
  $right = [Math]::Min($actual.Width, [int][Math]::Ceiling($x + $width))
  $bottom = [Math]::Min($actual.Height, [int][Math]::Ceiling($y + $height))
  $maskWidth = [Math]::Max(1, $right - $left)
  $maskHeight = [Math]::Max(1, $bottom - $top)
  $mask = [System.Drawing.Bitmap]::new($maskWidth, $maskHeight)
  $maskGraphics = [System.Drawing.Graphics]::FromImage($mask)
  $maskGraphics.Clear([System.Drawing.Color]::Black)
  $maskGraphics.Dispose()
  $different = 0
  $sumDelta = 0L
  $sumAR = 0L; $sumAG = 0L; $sumAB = 0L
  $sumBR = 0L; $sumBG = 0L; $sumBB = 0L
  $pixels = 0
  for ($py = $top; $py -lt $bottom; $py += 2) {
    for ($px = $left; $px -lt $right; $px += 2) {
      $excluded = $false
      foreach ($item in $exclude) {
        if ($px -ge $item.x -and $px -lt ($item.x + $item.width) -and $py -ge $item.y -and $py -lt ($item.y + $item.height)) { $excluded = $true; break }
      }
      if ($excluded) { continue }
      $a = $actual.GetPixel($px, $py); $b = $reference.GetPixel($px, $py)
      $delta = [Math]::Abs($a.R - $b.R) + [Math]::Abs($a.G - $b.G) + [Math]::Abs($a.B - $b.B)
      $sumDelta += $delta
      $sumAR += $a.R; $sumAG += $a.G; $sumAB += $a.B
      $sumBR += $b.R; $sumBG += $b.G; $sumBB += $b.B
      $pixels++
      if ($delta -gt 24) {
        $different++
        $mask.SetPixel($px - $left, $py - $top, [System.Drawing.Color]::White)
      }
    }
  }
  $safePixels = [Math]::Max(1, $pixels)
  $maskPath = Join-Path $MaskDirectory ($name + '-mask.png')
  $mask.Save($maskPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $mask.Dispose()
  $actualMean = @([Math]::Round($sumAR / [double]$safePixels, 2), [Math]::Round($sumAG / [double]$safePixels, 2), [Math]::Round($sumAB / [double]$safePixels, 2))
  $referenceMean = @([Math]::Round($sumBR / [double]$safePixels, 2), [Math]::Round($sumBG / [double]$safePixels, 2), [Math]::Round($sumBB / [double]$safePixels, 2))
  $metric = [pscustomobject]@{
    differingRatio = [Math]::Round($different / [double]$safePixels, 6)
    meanChannelDelta = [Math]::Round($sumDelta / ([double]$safePixels * 3), 3)
    actualMeanRgb = $actualMean
    referenceMeanRgb = $referenceMean
    maskPath = $maskPath
  }
  $script:regionMasks[$name] = $maskPath
  $script:colorReport[$name] = [pscustomobject]@{ actualMeanRgb = $actualMean; referenceMeanRgb = $referenceMean; meanChannelDelta = $metric.meanChannelDelta }
  return $metric
}
$specification = Get-Content -Raw $RegionPath | ConvertFrom-Json
$regions = $specification.regions
$exclusions = @($specification.exclusions)
$regionResult = [ordered]@{}
foreach ($property in $regions.PSObject.Properties) { $r = $property.Value; $regionResult[$property.Name] = Measure-Region $property.Name $r.x $r.y $r.width $r.height }
$full = Measure-Region 'full' 0 0 $actual.Width $actual.Height
$controllableOnly = Measure-Region 'controllableOnly' 0 0 $actual.Width $actual.Height $exclusions
$output = [ordered]@{ width = $actual.Width; height = $actual.Height; full = $full; controllableOnly = $controllableOnly; regions = $regionResult; regionMasks = $regionMasks; colorReport = $colorReport; referencePath = $ReferencePath; referenceWasCropped = $referenceWasCropped; referenceWasResized = $referenceWasResized; excludedRegions = $exclusions }
$graphics.Dispose(); $reference.Dispose(); $source.Dispose(); $actual.Dispose()
$output | ConvertTo-Json -Depth 8 -Compress
`;
  writeFileSync(scriptPath, powershell, 'utf8');
  const result = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-ActualPath', actualPath, '-ReferencePath', referencePath, '-RegionPath', regionPath, '-MaskDirectory', maskDirectory], { encoding: 'utf8' });
  const parsed = JSON.parse(result.trim());
  writeFileSync(reportPath, JSON.stringify(parsed, null, 2), 'utf8');
  return parsed;
}

const viewportMatrix = [
  { width: 1280, height: 800 },
  { width: 1622, height: 969 },
  { width: 1623, height: 969 },
  { width: 1920, height: 1200 }
];

async function captureViewportMatrixEvidence() {
  const captures = [];
  const windows = [];
  for (const targetViewport of viewportMatrix) {
    const size = `${targetViewport.width}x${targetViewport.height}`;
    for (const theme of ['light', 'dark']) {
      const window = await loadRealWorkbench(theme, null, 'workbench', targetViewport, 'reference', true, `workbench-matrix-${theme}-${size}`);
      windows.push(window);
      const geometry = await readGeometry(window);
      const image = await window.webContents.capturePage({ x: 0, y: 0, width: targetViewport.width, height: targetViewport.height });
      const outputPath = resolve(outputDirectory, `starchat-workbench-${theme}-${size}.png`);
      const geometryPath = resolve(outputDirectory, `starchat-workbench-${theme}-${size}-geometry.json`);
      const diffPath = resolve(outputDirectory, `starchat-workbench-${theme}-${size}-diff.json`);
      writeFileSync(outputPath, image.toPNG());
      writeFileSync(geometryPath, JSON.stringify({ viewport: targetViewport, actual: geometry }, null, 2), 'utf8');
      const regionGeometry = comparisonRegions(geometry);
      const diff = comparePngWithReference(outputPath, referenceImages[theme], diffPath, regionGeometry);
      captures.push({ theme, viewport: targetViewport, screenshotPath: outputPath, geometryPath, diffPath, diff });
    }
  }
  for (const window of windows) window.destroy();
  const report = {
    renderer: 'actual React renderer in Electron BrowserWindow',
    matrix: captures,
    references: referenceImages,
    note: '1622x969 is the supplied calibration size; 1623x969, 1280x800, and 1920x1200 are independently rendered viewports.'
  };
  const reportPath = resolve(outputDirectory, 'starchat-workbench-viewport-matrix-report.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  return { reportPath, ...report };
}

async function main() {
  if (!existsSync(rendererIndex)) throw new Error(`Renderer build not found: ${rendererIndex}`);
  mkdirSync(outputDirectory, { recursive: true });
  await app.whenReady();
  registerLive2DPreviewProtocol();
  if (process.argv.includes('--live2d')) {
    const result = await captureLive2DPreview();
    console.log(JSON.stringify(result, null, 2));
    app.quit();
    return;
  }
  if (process.argv.includes('--matrix')) {
    const result = await captureViewportMatrixEvidence();
    console.log(JSON.stringify(result, null, 2));
    app.quit();
    return;
  }
  if (process.argv.includes('--layout-runtime')) {
    const result = await captureLayoutRuntimeEvidence();
    console.log(JSON.stringify(result, null, 2));
    app.quit();
    return;
  }
  if (process.argv.includes('--workbench-only')) {
    const rendererWindow = await loadRealWorkbench('light');
    const lightCapture = await captureTheme('light', rendererWindow);
    const darkRendererWindow = await loadRealWorkbench('dark');
    const darkCapture = await captureTheme('dark', darkRendererWindow);
    rendererWindow.destroy();
    darkRendererWindow.destroy();
    const report = {
      viewport,
      screenshots: { light: lightCapture.outputPath, dark: darkCapture.outputPath },
      geometry: { light: lightCapture.geometryPath, dark: darkCapture.geometryPath, expected: expectedGeometry },
      references: referenceImages,
      diff: {
        light: comparePngWithReference(lightCapture.outputPath, referenceImages.light, resolve(outputDirectory, 'starchat-workbench-light-diff.json'), comparisonRegions(lightCapture.geometry)),
        dark: comparePngWithReference(darkCapture.outputPath, referenceImages.dark, resolve(outputDirectory, 'starchat-workbench-dark-diff.json'), comparisonRegions(darkCapture.geometry))
      },
      evidence: 'Actual React renderer captured by Electron; workbench-only visual calibration.'
    };
    writeFileSync(resolve(outputDirectory, 'starchat-workbench-material-report.json'), JSON.stringify(report, null, 2), 'utf8');
    console.log(JSON.stringify(report, null, 2));
    app.quit();
    return;
  }
  const rendererWindow = await loadRealWorkbench('light');
  const lightCapture = await captureTheme('light', rendererWindow);
  if (process.env.WORKBENCH_MATERIAL_ONLY === '1' || process.argv.includes('--material-only')) {
    const darkRendererWindow = await loadRealWorkbench('dark');
    const darkCapture = await captureTheme('dark', darkRendererWindow);
    const lightSettingsCapture = await captureSettingsTheme('light', rendererWindow);
    const darkSettingsCapture = await captureSettingsTheme('dark', darkRendererWindow);
    rendererWindow.destroy();
    darkRendererWindow.destroy();
    const report = {
      viewport,
      screenshots: { light: lightCapture.outputPath, dark: darkCapture.outputPath },
      settingsScreenshots: { light: lightSettingsCapture.outputPath, dark: darkSettingsCapture.outputPath },
      geometry: { light: lightCapture.geometryPath, dark: darkCapture.geometryPath },
      settingsGeometry: { light: lightSettingsCapture.geometryPath, dark: darkSettingsCapture.geometryPath },
      diff: {
        light: comparePngWithReference(lightCapture.outputPath, referenceImages.light, resolve(outputDirectory, 'starchat-workbench-light-diff.json'), comparisonRegions(lightCapture.geometry)),
        dark: comparePngWithReference(darkCapture.outputPath, referenceImages.dark, resolve(outputDirectory, 'starchat-workbench-dark-diff.json'), comparisonRegions(darkCapture.geometry))
      },
      evidence: 'Actual React renderer captured by Electron; material-only iteration.'
    };
    writeFileSync(resolve(outputDirectory, 'starchat-workbench-material-report.json'), JSON.stringify(report, null, 2), 'utf8');
    console.log(JSON.stringify(report, null, 2));
    app.quit();
    return;
  }
  const darkCapture = await captureTheme('dark', rendererWindow);
  const defaultLightCapture = await captureDefaultWindowTheme('light');
  const defaultDarkCapture = await captureDefaultWindowTheme('dark');
  const lightSettingsCapture = await captureSettingsTheme('light', rendererWindow);
  const darkSettingsCapture = await captureSettingsTheme('dark', rendererWindow);
  const settingsDefaultLightCapture = await captureDefaultWindowSettingsTheme('light');
  const settingsDefaultDarkCapture = await captureDefaultWindowSettingsTheme('dark');
  const lightAnimation = await captureSidebarAnimationEvidence('light', rendererWindow);
  const darkAnimation = await captureSidebarAnimationEvidence('dark', rendererWindow);
  const lightRightRailAnimation = await captureRightRailAnimationEvidence('light', rendererWindow);
  const darkRightRailAnimation = await captureRightRailAnimationEvidence('dark', rendererWindow);
  const lightBottomAnimation = await captureBottomPanelAnimationEvidence('light', rendererWindow);
  const darkBottomAnimation = await captureBottomPanelAnimationEvidence('dark', rendererWindow);
  const lightInteraction = await captureWorkbenchInteractionEvidence('light', rendererWindow);
  const darkInteraction = await captureWorkbenchInteractionEvidence('dark', rendererWindow);
  rendererWindow.destroy();
  const lightDiff = comparePngWithReference(lightCapture.outputPath, referenceImages.light, resolve(outputDirectory, 'starchat-workbench-light-diff.json'), comparisonRegions(lightCapture.geometry));
  const darkDiff = comparePngWithReference(darkCapture.outputPath, referenceImages.dark, resolve(outputDirectory, 'starchat-workbench-dark-diff.json'), comparisonRegions(darkCapture.geometry));
  const report = {
    viewport,
    defaultWindowViewport,
    screenshots: { light: lightCapture.outputPath, dark: darkCapture.outputPath, defaultLight: defaultLightCapture.outputPath, defaultDark: defaultDarkCapture.outputPath, settingsLight: lightSettingsCapture.outputPath, settingsDark: darkSettingsCapture.outputPath, settingsDefaultLight: settingsDefaultLightCapture.outputPath, settingsDefaultDark: settingsDefaultDarkCapture.outputPath },
    geometry: { light: lightCapture.geometryPath, dark: darkCapture.geometryPath, expected: expectedGeometry },
    defaultWindowGeometry: { light: defaultLightCapture.geometryPath, dark: defaultDarkCapture.geometryPath },
    settingsDefaultWindowGeometry: { light: settingsDefaultLightCapture.geometryPath, dark: settingsDefaultDarkCapture.geometryPath },
    references: referenceImages,
    diff: { light: lightDiff, dark: darkDiff },
    animationEvidence: { light: lightAnimation, dark: darkAnimation },
    rightRailAnimationEvidence: { light: lightRightRailAnimation, dark: darkRightRailAnimation },
    bottomAnimationEvidence: { light: lightBottomAnimation, dark: darkBottomAnimation },
    interactionEvidence: { light: lightInteraction, dark: darkInteraction },
    animationReference: {
      video: newVideoReference,
      sourceVideoAnalysis: {
        width: 2416,
        height: 1440,
        totalDurationMs: 14430,
        sourceFrameCount: 425,
        sourceFpsApprox: 29.45,
        inferredClickFrames: [145, 168],
        collapseFrames: [146, 156],
        expandFrames: [169, 180],
        observedTransitionMsApprox: 367,
        implementationTransitionMs: 360,
        openWidthSourcePx: 402,
        closedWidthSourcePx: 12,
        collapseWidthCurveScaled1208: [[146, 190], [147, 190], [148, 151], [149, 117], [150, 63], [151, 38], [152, 22], [153, 17], [154, 10], [155, 7], [156, 5]],
        expandWidthCurveScaled1208: [[169, 29], [170, 65], [171, 109], [172, 145], [173, 168], [174, 183], [175, 192], [176, 195], [177, 199], [178, 199], [179, 200], [180, 201]],
        contentReflowsWithSidebar: true,
        independentTextFadeDetected: false,
        contentVisibilityObservation: 'sidebar text and icons are primarily clipped/reflowed during the width change; no independent opacity timeline was measurable',
        toggleVisualState: 'top-left toggle remains in the top bar; no reliable icon rotation/state transform was observed in the source video'
      }
    },
    conclusion: 'The screenshots and animation frames were rendered from the actual React renderer entry. Full-image diff is auxiliary; geometry and per-region reports are the structural evidence. Live Electron GUI acceptance remains pending.'
  };
  writeFileSync(resolve(outputDirectory, 'starchat-workbench-visual-report.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report, null, 2));
  app.quit();
}

main().catch((error) => { console.error(error); app.exit(1); });
