import { app, BrowserWindow } from 'electron';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

// Keep the requested contract in physical screenshot pixels even on a high-DPI host.
app.commandLine.appendSwitch('force-device-scale-factor', '1');

const viewport = { width: 1622, height: 969 };
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const codeDirectory = resolve(scriptDirectory, '..');
const projectDirectory = resolve(codeDirectory, '..');
const rendererBuildDirectory = resolve(codeDirectory, 'out/renderer');
const outputDirectory = resolve(process.env.WORKBENCH_SCREENSHOT_DIR ?? resolve(codeDirectory, 'artifacts/workbench-visual'));
const referenceImages = {
  dark: 'C:/Users/23260/AppData/Local/Temp/codex-clipboard-0174c658-b573-4e4a-95a8-8a67ab3b9a0a.png',
  light: 'C:/Users/23260/AppData/Local/Temp/codex-clipboard-4c98abc1-f3af-4eb4-a61d-096a3730d287.png'
};
const themeTokens = {
  light: {
    '--theme-window-bg': '#eaf2f8', '--theme-window-gradient': 'radial-gradient(720px circle at 88% 4%, rgba(146, 204, 239, .42), transparent 62%), radial-gradient(620px circle at 4% 84%, rgba(190, 217, 239, .54), transparent 64%), linear-gradient(145deg, #f1f7fb, #dfeaf3 72%)', '--theme-window-glow': 'rgba(112, 177, 214, .18)', '--theme-titlebar-surface': 'rgba(246, 251, 255, .82)', '--theme-titlebar-border': 'rgba(111, 163, 196, .34)', '--theme-text': '#20384d', '--theme-heading': '#15334d', '--theme-muted': '#5c7488', '--theme-subtle': '#7890a1', '--theme-surface': 'rgba(248, 252, 255, .66)', '--theme-surface-hover': 'rgba(255, 255, 255, .82)', '--theme-surface-selected': 'rgba(179, 222, 246, .52)', '--theme-surface-strong': 'rgba(250, 253, 255, .88)', '--theme-control-surface': 'rgba(250, 253, 255, .72)', '--theme-menu-surface': 'rgba(247, 252, 255, .98)', '--theme-border': 'rgba(105, 161, 198, .3)', '--theme-border-strong': 'rgba(80, 143, 186, .56)', '--theme-shadow': 'rgba(43, 91, 124, .2)', '--theme-accent-strong': '#176487', '--theme-accent-soft': 'rgba(89, 172, 215, .2)', '--theme-focus': '#267ca7', '--theme-scrollbar-thumb': 'rgba(74, 135, 171, .54)', '--theme-scrollbar-track': 'rgba(145, 184, 207, .2)'
  },
  dark: {
    '--theme-window-bg': '#060a13', '--theme-window-gradient': 'radial-gradient(680px circle at 88% 6%, rgba(124, 156, 196, .24), transparent 62%), radial-gradient(620px circle at 6% 82%, rgba(51, 81, 122, .28), transparent 64%), radial-gradient(420px circle at 52% 42%, rgba(228, 184, 99, .07), transparent 70%), #060a13', '--theme-window-glow': 'rgba(124, 156, 196, .12)', '--theme-titlebar-surface': 'rgba(10, 18, 31, .72)', '--theme-titlebar-border': 'rgba(255, 255, 255, .11)', '--theme-text': '#f4f7fb', '--theme-heading': '#f7f9fc', '--theme-muted': 'rgba(232, 239, 248, .68)', '--theme-subtle': 'rgba(232, 239, 248, .42)', '--theme-surface': 'rgba(255, 255, 255, .065)', '--theme-surface-hover': 'rgba(255, 255, 255, .1)', '--theme-surface-selected': 'rgba(124, 156, 196, .2)', '--theme-surface-strong': 'rgba(255, 255, 255, .1)', '--theme-control-surface': 'rgba(255, 255, 255, .055)', '--theme-menu-surface': '#0b1322', '--theme-border': 'rgba(255, 255, 255, .14)', '--theme-border-strong': 'rgba(124, 156, 196, .52)', '--theme-shadow': 'rgba(3, 7, 18, .5)', '--theme-accent-strong': '#b8cce2', '--theme-accent-soft': 'rgba(124, 156, 196, .2)', '--theme-focus': '#e4b863', '--theme-scrollbar-thumb': 'rgba(124, 156, 196, .58)', '--theme-scrollbar-track': 'rgba(255, 255, 255, .08)'
  }
};

const preloadSource = `
const theme = process.env.STARCHAT_SCREENSHOT_THEME || 'dark';
const role = {
  id: 'baoyin.default', displayName: '白音', description: 'StarChat 默认角色',
  personality: { summary: '温柔、可靠、清晰', traits: [], scales: {} },
  presentation: { expressions: [], actions: [], semanticMappings: {} },
  visual: { modelAsset: null }
};
const settings = {
  activeRoleId: role.id, themePreference: theme, assistantMode: 'agent',
  cosyVoiceSpeaker: '中文女声', cosyVoiceBaseUrl: '', cosyVoiceMode: 'disabled',
  activeVoiceProfileId: null, ttsRate: 1, ttsVolume: 1, apiBaseUrl: '', model: '',
  temperature: 0.7, maxTokens: 2048, systemPrompt: '', live2dModelPath: '',
  modelViewportByModel: {}, petBounds: { x: 0, y: 0, width: 480, height: 720 },
  petWindowOpacity: 1, petHoverBorderOpacity: 0, petHoverShowDelayMs: 0,
  petHoverFadeMs: 0, petDisplayId: 'primary', alwaysOnTop: false,
  cursorTrackingEnabled: true, cursorEyeWeight: 0.3, cursorHeadWeight: 0.3,
  cursorBodyWeight: 0.2, cursorSmoothing: 0.2, cursorMaxStep: 1,
  cursorRangeX: 1, cursorRangeY: 1, cursorIdleMotion: true, settingsShortcut: 'Ctrl+Shift+B',
  live2dShowWatermark: true, presentation: {}
};
const state = {
  settings, hasApiKey: false, role, roles: [role],
  live2d: { entryPath: null, modelId: null, displayName: '', status: 'unconfigured' },
  live2dModels: [], voices: [], companion: { stageLabel: '初识', affinity: 0, interactionCount: 0, memoryCount: 0 }
};
const noOp = () => () => {};
window.baoyin = {
  app: { onWindowFocusState: noOp(), showPet: noOp(), minimize: noOp(), hideSettings: noOp() },
  state: { get: async () => state, onChange: noOp() },
  display: { list: async () => [] },
  pet: { onBoundsChange: noOp() },
  settings: { onPreview: noOp(), save: async () => state },
  debug: { onRuntimeReady: noOp(), metrics: async () => null, command: async () => undefined, runtimeCommand: async () => ({}) },
  agent: { list: async () => [], onEvent: noOp(), get: async () => null, cancel: async () => undefined },
  chat: { onEvent: noOp(), start: async () => 'screenshot-chat', cancel: async () => undefined },
  presentation: { emit: noOp() },
  roles: { save: async () => state, activate: async () => state, create: async () => state, clone: async () => state, delete: async () => state },
  live2d: { inspect: async () => state.live2d, chooseFile: async () => null, chooseDirectory: async () => null, import: async () => ({ record: {}, state: state.live2d }), remove: async () => state },
  service: { test: async () => ({ ok: true, message: 'screenshot' }) },
  voice: { synthesize: async () => new Uint8Array(), import: async () => null, list: async () => [], delete: async () => undefined, preview: async () => undefined, activate: async () => undefined }
};
`;

function writePreload(theme) {
  const preloadPath = resolve(outputDirectory, `.workbench-screenshot-preload-${theme}.cjs`);
  writeFileSync(preloadPath, preloadSource, 'utf8');
  return preloadPath;
}

function icon(name, size = 18) {
  const paths = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    minimize: '<path d="M5 12h14"/>',
    maximize: '<path d="M8 4H4v4M16 4h4v4M20 16v4h-4M4 16v4h4"/>',
    folder: '<path d="M3 6.5A1.5 1.5 0 014.5 5h5l2 2h8A1.5 1.5 0 0121 8.5v9a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 17.5z"/>',
    source: '<path d="M8 6L3 12l5 6M16 6l5 6-5 6M14 4l-4 16"/>',
    terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M12 15h4"/>',
    browser: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 8h18M7 6h.01M10 6h.01M13 6h.01"/>',
    task: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    chat: '<path d="M4 5.5A2.5 2.5 0 016.5 3h11A2.5 2.5 0 0120 5.5v7a2.5 2.5 0 01-2.5 2.5H11l-4.5 4v-4.1A2.5 2.5 0 014 12.5z"/>',
    resource: '<path d="M4 5.5A1.5 1.5 0 015.5 4h5l2 2h6A1.5 1.5 0 0120 7.5v11a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 18.5z"/><path d="M8 11h8M8 15h5"/>',
    layout: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 4v16M8 9h13"/>',
    star: '<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1-1.7 1.7-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.6v.1h-2.4v-.1a1.7 1.7 0 00-1-1.6 1.7 1.7 0 00-1.9.3l-.1.1L8 17l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.6-1H6v-2.4h.8a1.7 1.7 0 001.6-1 1.7 1.7 0 00-.3-1.9L8 8.6l1.7-1.7.1.1a1.7 1.7 0 001.9.3 1.7 1.7 0 001-1.6v-.1h2.4v.1a1.7 1.7 0 001 1.6 1.7 1.7 0 001.9-.3l.1-.1 1.7 1.7-.1.1a1.7 1.7 0 00-.3 1.9 1.7 1.7 0 001.6 1h.1V14h-.1a1.7 1.7 0 00-1.6 1z"/>'
    ,chevron: '<path d="M8 10l4 4 4-4"/>',
    check: '<path d="M5 12.5l4 4L19 6.5"/>'
  };
  return `<svg class="workbench-svg-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}

function staticHarnessHtml(theme) {
  const css = readdirSync(resolve(rendererBuildDirectory, 'assets')).filter((file) => file.endsWith('.css')).map((file) => readFileSync(resolve(rendererBuildDirectory, 'assets', file), 'utf8')).join('\n');
  const variables = Object.entries(themeTokens[theme]).map(([name, value]) => `${name}:${value}`).join(';');
  const iconData = `data:image/png;base64,${readFileSync(resolve(projectDirectory, 'assets/icons/baoyin-64.png')).toString('base64')}`;
  const characterData = `data:image/png;base64,${readFileSync(resolve(projectDirectory, 'assets/character/白音-精修设定稿-v2.png')).toString('base64')}`;
  return `<!doctype html><html lang="zh-CN" data-theme="${theme}"><head><meta charset="UTF-8"><style>${css}</style><style>:root{${variables}}html,body,#root{width:100%;height:100%;}body{min-width:0!important;background:var(--theme-window-bg)!important;}body[data-window="settings"] .workbench-shell{height:100%;min-height:0;display:grid;grid-template-rows:55px minmax(0,1fr) 174px;gap:10px;padding:0;background:var(--theme-window-gradient);overflow:hidden;}body[data-window="settings"] .workbench-main-grid{min-height:0;}body[data-window="settings"] .workbench-center-frame{height:100%;}body[data-window="settings"] .agent-console{height:100%;overflow:hidden;}body[data-window="settings"] .agent-dialogue-column{overflow:hidden;}</style></head><body data-window="settings" data-theme="${theme}"><div class="app-shell settings-center-shell"><div class="workbench-shell" data-workbench="shell" data-workbench-structure="shared" data-workbench-theme="tokenized"><header class="titlebar workbench-topbar" data-workbench="topbar"><div class="drag-region workbench-brand-lockup"><img class="workbench-brand-avatar" src="${iconData}" alt=""><span class="workbench-brand-name">StarChat</span><button class="workbench-icon-button workbench-brand-star"><span>${icon('star', 16)}</span></button><button class="workbench-icon-button workbench-sidebar-toggle">${icon('layout', 18)}</button></div><div class="workbench-window-controls"><button class="workbench-icon-button workbench-window-control">${icon('minimize', 16)}</button><button class="workbench-icon-button workbench-window-control is-limited">${icon('maximize', 15)}</button><button class="workbench-icon-button workbench-window-control workbench-window-close">${icon('close', 16)}</button></div></header><div class="workbench-main-grid"><aside class="workbench-sidebar"><button class="workbench-new-chat">${icon('plus', 17)}新对话</button><div class="workbench-sidebar-heading"><strong>工作区</strong><span>${icon('folder', 15)}${icon('source', 15)}${icon('task', 15)}</span></div><div class="workbench-project-tree"><button class="workbench-project-row is-active">${icon('folder', 17)}<strong>Project-008</strong>${icon('chevron', 15)}</button><button class="workbench-session-row is-active">${icon('chat', 15)}<span>检查 Project-008 设置结构</span><small>进行中</small></button><button class="workbench-project-row">${icon('folder', 17)}<strong>StarChat</strong>${icon('chevron', 15)}</button><button class="workbench-session-row">${icon('chat', 15)}<span>窗口交互回归</span><small>最近</small></button></div><div class="workbench-sidebar-footer"><button class="workbench-settings-entry">${icon('settings', 17)}<span>设置</span></button></div></aside><section class="workbench-center"><div class="workbench-center-scroll"><div class="workbench-center-frame"><header class="workbench-center-toolbar"><div class="workbench-center-title">${icon('folder', 17)}<strong>检查 Project-008 设置结构</strong></div><div class="workbench-center-actions"><button class="workbench-icon-button">${icon('source', 17)}</button><button class="workbench-icon-button">${icon('layout', 17)}</button><button class="workbench-icon-button">${icon('task', 17)}</button></div></header><div class="workbench-center-content is-agent-home"><section class="agent-console"><div class="agent-workflow-layout"><aside class="agent-character-panel"><div class="agent-character-actions"><button class="agent-character-action">${icon('star', 15)}角色状态</button><button class="agent-character-action">${icon('minimize', 15)}收起</button></div><div class="agent-character-art"><img src="${characterData}" alt="白音角色立绘"></div><div class="agent-character-caption"><strong>白音</strong><span>在线 · 默认人格</span><small>角色画面与透明桌宠窗口保持独立。</small></div></aside><div class="agent-dialogue-column"><div class="agent-dialogue-meta"><span>用时　<strong>6分45秒</strong></span><span>${icon('check', 14)}Agent 工作流已就绪</span></div><div class="agent-plan-preview"><span>${icon('task', 15)}规则判断 · 需要工作链路</span><span>${icon('task', 15)}轻量分类 · 项目分析</span><span>${icon('task', 15)}上下文注入 · 项目结构</span><span>${icon('check', 15)}工具执行 · 检索文件结构　已完成</span><p>我已完成项目结构扫描，工作流入口、设置入口与运行时边界保持清晰分层。</p><div class="agent-plan-actions">${icon('source', 15)}${icon('star', 15)}${icon('close', 15)}${icon('task', 15)}</div></div><div class="companion-chat"><div class="companion-messages"><div class="companion-message assistant"><strong>白音</strong><p>我会沿着 Agent 轨迹继续检查项目结构。</p></div></div><div class="agent-composer"><div class="agent-compose-row"><textarea placeholder="给 Agent 一条任务指令…"></textarea><button class="agent-send-button">${icon('source', 16)}</button></div></div></div></div></div></section></div></div></div></section><aside class="workbench-right-rail"><div class="workbench-rail-topline"><button class="workbench-icon-button">${icon('plus', 18)}</button></div><div class="workbench-tool-grid"><button class="workbench-tool-card">${icon('resource', 21)}<strong>资源管理器</strong><small>工作区资源</small></button><button class="workbench-tool-card">${icon('source', 21)}<strong>源代码管理</strong><small>文件与源码只读</small></button><button class="workbench-tool-card">${icon('task', 21)}<strong>任务管理</strong><small>暂无活动任务</small></button><button class="workbench-tool-card">${icon('terminal', 21)}<strong>终端</strong><small>任意终端未启用</small></button><div class="workbench-tool-card is-disabled">${icon('browser', 21)}<strong>浏览器</strong><small>浏览器控制未启用</small></div><button class="workbench-tool-card">${icon('chat', 21)}<strong>侧边聊天</strong><small>侧边对话入口</small></button></div></aside></div><section class="workbench-bottom-panel is-open"><div class="workbench-terminal-tabs"><button class="workbench-terminal-tab is-active">${icon('terminal', 15)}终端 1 ${icon('close', 13)}</button><button class="workbench-terminal-add">${icon('plus', 15)}</button><button class="workbench-terminal-close">${icon('close', 15)}</button></div><div class="workbench-terminal-body"><div class="workbench-terminal-prompt"><span>PS C:\\workspace\\Project-008&gt;</span><span class="workbench-terminal-caret"></span></div><div class="workbench-terminal-status"><span>Agent Runtime · 白音</span><span>未配置外部模型</span><span>暂无活动 Agent 任务</span></div></div></section></div></div></body></html>`;
}

async function captureTheme(theme, existingWindow = null) {
  const window = existingWindow ?? new BrowserWindow({
    width: viewport.width,
    height: viewport.height,
    show: false,
    frame: false,
    useContentSize: true,
    backgroundColor: theme === 'dark' ? '#07111f' : '#eaf4ff'
  });
  if (existingWindow) {
    const variables = Object.entries(themeTokens[theme]).map(([name, value]) => `document.documentElement.style.setProperty(${JSON.stringify(name)}, ${JSON.stringify(value)});`).join('');
    await window.webContents.executeJavaScript(`document.documentElement.dataset.theme=${JSON.stringify(theme)};document.body.dataset.theme=${JSON.stringify(theme)};${variables}`);
  } else {
    const harnessPath = resolve(tmpdir(), `starchat-workbench-harness-${process.pid}-${theme}.html`);
    writeFileSync(harnessPath, staticHarnessHtml(theme), 'utf8');
    await window.loadFile(harnessPath);
  }
  await new Promise((resolveTimer) => setTimeout(resolveTimer, 1200));
  await window.webContents.executeJavaScript(`document.documentElement.dataset.theme = '${theme}'; document.body.dataset.theme = '${theme}';`);
  await new Promise((resolveTimer) => setTimeout(resolveTimer, 200));
  const image = await window.webContents.capturePage({ x: 0, y: 0, width: viewport.width, height: viewport.height });
  const outputPath = resolve(outputDirectory, `starchat-workbench-${theme}-${viewport.width}x${viewport.height}.png`);
  writeFileSync(outputPath, image.toPNG());
  return { outputPath, window };
}

function comparePngWithReference(actualPath, referencePath, reportPath) {
  const scriptPath = resolve(outputDirectory, 'compare-workbench-images.ps1');
  const powershell = `
param([string]$ActualPath, [string]$ReferencePath)
Add-Type -AssemblyName System.Drawing
$actual = [System.Drawing.Bitmap]::new($ActualPath)
$source = [System.Drawing.Bitmap]::new($ReferencePath)
$reference = [System.Drawing.Bitmap]::new($actual.Width, $actual.Height)
$graphics = [System.Drawing.Graphics]::FromImage($reference)
$graphics.DrawImage($source, 0, 0, $actual.Width, $actual.Height)
$different = 0
$sum = 0L
for ($y = 0; $y -lt $actual.Height; $y++) {
  for ($x = 0; $x -lt $actual.Width; $x++) {
    $a = $actual.GetPixel($x, $y)
    $b = $reference.GetPixel($x, $y)
    $delta = [Math]::Abs($a.R - $b.R) + [Math]::Abs($a.G - $b.G) + [Math]::Abs($a.B - $b.B)
    $sum += $delta
    if ($delta -gt 24) { $different++ }
  }
}
$pixels = [double]($actual.Width * $actual.Height)
[pscustomobject]@{ width = $actual.Width; height = $actual.Height; differingPixels = $different; differingRatio = [Math]::Round($different / $pixels, 6); meanChannelDelta = [Math]::Round($sum / ($pixels * 3), 3); referenceWasResized = $true } | ConvertTo-Json -Compress
$graphics.Dispose(); $reference.Dispose(); $source.Dispose(); $actual.Dispose()
`;
  writeFileSync(scriptPath, powershell, 'utf8');
  const result = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-ActualPath', actualPath, '-ReferencePath', referencePath], { encoding: 'utf8' });
  const parsed = JSON.parse(result.trim());
  writeFileSync(reportPath, JSON.stringify(parsed, null, 2), 'utf8');
  return parsed;
}

async function main() {
  if (!existsSync(resolve(rendererBuildDirectory, 'index.html'))) throw new Error(`Renderer build not found: ${rendererBuildDirectory}`);
  mkdirSync(outputDirectory, { recursive: true });
  await app.whenReady();
  const lightCapture = await captureTheme('light');
  const darkCapture = await captureTheme('dark', lightCapture.window);
  lightCapture.window.destroy();
  const light = lightCapture.outputPath;
  const dark = darkCapture.outputPath;
  const lightDiff = comparePngWithReference(light, referenceImages.light, resolve(outputDirectory, 'starchat-workbench-light-diff.json'));
  const darkDiff = comparePngWithReference(dark, referenceImages.dark, resolve(outputDirectory, 'starchat-workbench-dark-diff.json'));
  const report = { viewport, screenshots: { light, dark }, references: referenceImages, diff: { light: lightDiff, dark: darkDiff }, conclusion: 'Screenshots were rendered at the requested viewport and compared against resized reference images; differing ratios are reported as evidence, not GUI acceptance.' };
  writeFileSync(resolve(outputDirectory, 'starchat-workbench-visual-report.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report, null, 2));
  app.quit();
}

main().catch((error) => { console.error(error); app.exit(1); });
