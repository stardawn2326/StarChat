import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const rendererDirectory = resolve(import.meta.dirname);
const workbenchSource = readFileSync(resolve(rendererDirectory, 'AgentWorkbench.tsx'), 'utf8');
const consoleSource = readFileSync(resolve(rendererDirectory, 'AgentConsole.tsx'), 'utf8');
const chatSource = readFileSync(resolve(rendererDirectory, 'CompanionChat.tsx'), 'utf8');
const appSource = readFileSync(resolve(rendererDirectory, 'App.tsx'), 'utf8');
const preloadSource = readFileSync(resolve(rendererDirectory, '../../preload/index.ts'), 'utf8');
const mainSource = readFileSync(resolve(rendererDirectory, '../../main/index.ts'), 'utf8');
const workbenchServiceSource = readFileSync(resolve(rendererDirectory, '../../main/workbench-service.ts'), 'utf8');
const ipcSource = readFileSync(resolve(rendererDirectory, '../../shared/ipc.ts'), 'utf8');
const resizeHandleSource = readFileSync(resolve(rendererDirectory, 'WorkbenchResizeHandle.tsx'), 'utf8');
const workbenchCss = readFileSync(resolve(rendererDirectory, 'workbench/workbench.css'), 'utf8');
const screenshotSource = readFileSync(resolve(rendererDirectory, 'WorkbenchScreenshot.tsx'), 'utf8');

describe('StarChat workbench functionality contracts', () => {
  it('uses one explicit in-memory session and exposes a real new-conversation reset', () => {
    expect(appSource).toContain('conversationKey');
    expect(appSource).toContain('onNewConversation');
    expect(workbenchSource).toContain('onNewConversation');
    expect(workbenchSource).not.toContain('窗口交互回归');
    expect(workbenchSource).not.toContain('Project-008 Agent 工作流');
  });

  it('keeps reference screenshot fixtures explicit and the runtime path dynamic', () => {
    expect(consoleSource).toContain('referenceFixture = false');
    expect(consoleSource).toContain("referenceFixture ? '6分45秒'");
    expect(consoleSource).toContain("referenceFixture ? '我已分析该项目的设置结构，主要分为全局设置、开发设置、构建设置、测试设置和部署设置五大类。' : latestTask ? stepLabel(latestTask)");
    expect(consoleSource).not.toContain('主要分为全<br />');
    expect(chatSource).toContain('referenceFixture = false');
    expect(chatSource).toContain('referenceFixture ?');
    expect(chatSource).toContain('agent-attachment-code-preview');
    expect(chatSource).toContain('分销 45秒');
    expect(chatSource).toContain('attachments');
  });

  it('connects workbench tools to explicit safe actions and labels the bottom panel honestly', () => {
    expect(workbenchSource).toContain('onToolAction');
    expect(appSource).toContain('inspectWorkbench');
    expect(workbenchSource).toContain('受控验证日志');
    expect(workbenchSource).toContain('data-workbench="bottom-panel-toggle"');
    expect(workbenchSource).toContain('data-workbench="right-rail-toggle"');
    expect(workbenchSource).not.toContain('PS C:\\workspace\\Project-008>');
    expect(workbenchSource).not.toContain('新建终端');
  });

  it('keeps the desktop-pet bridge available without adding an obsolete workbench glyph', () => {
    expect(preloadSource).toContain('showPet');
    expect(consoleSource).not.toContain('className="wb-character-action wb-pet-action"');
    expect(consoleSource).not.toContain('aria-label="显示桌宠"');
    expect(consoleSource).not.toContain('window.starchat.app.showPet()');
    expect(consoleSource).not.toContain('剥出为桌宠');
  });

  it('adds minimal safe IPC for environment inspection, sharing, and maximize/restore', () => {
    expect(ipcSource).toContain('WorkbenchEnvironment');
    expect(preloadSource).toContain('workbench:inspect');
    expect(preloadSource).toContain('workbench:share');
    expect(preloadSource).toContain('window:toggle-maximize');
    expect(mainSource).toContain("ipcMain.handle('workbench:inspect'");
    expect(mainSource).toContain("ipcMain.handle('workbench:share'");
    expect(mainSource).toContain("ipcMain.handle('window:toggle-maximize'");
    expect(mainSource).toContain('targetWindow.maximize()');
    expect(mainSource).toContain('targetWindow.unmaximize()');
    expect(mainSource).toContain('saveWorkbenchWindowState');
    expect(mainSource).toContain("settingsWindow.on('move'");
    expect(mainSource).toContain("settingsWindow.on('resize'");
    expect(preloadSource).toContain('window:is-maximized');
    expect(preloadSource).toContain('window:maximized-changed');
    expect(workbenchServiceSource).toContain("execFileSync('git'");
    expect(mainSource).not.toContain('branchName = \'main\'');
  });

  it('keeps the embedded character and pet window mutually exclusive while sharing cursor follow', () => {
    expect(appSource).toContain('onWorkbenchCharacterVisibilityChanged');
    expect(appSource).toContain('characterVisible={workbenchCharacterVisible}');
    expect(appSource).toContain('window.starchat.app.showPet()');
    expect(consoleSource).toContain('window.starchat.cursor.onUpdate(setCursor)');
    expect(consoleSource).toContain('cursor={cursor}');
    expect(preloadSource).toContain("'workbench:character-visibility'");
    expect(mainSource).toContain('let petStartupShowPending = false;');
    expect(mainSource).toContain('function returnPetToWorkbench()');
    expect(mainSource).toContain("label: '放回工作台'");
    expect(mainSource).toContain('setWorkbenchCharacterVisible(false);');
    expect(mainSource).toContain('setWorkbenchCharacterVisible(true);');
  });

  it('keeps the agent path wired to a real request id and full task lifecycle', () => {
    expect(chatSource).toContain('window.starchat.chat.start');
    expect(chatSource).toContain('window.starchat.agent.cancel');
    expect(chatSource).toContain('window.starchat.agent.approve');
    expect(chatSource).toContain('window.starchat.agent.respond');
    expect(chatSource).toContain('onNewConversation');
    expect(appSource).toContain('window.starchat.agent.onEvent');
    expect(preloadSource).toContain("ipcRenderer.invoke('agent:retry'");
    expect(mainSource).toContain("ipcMain.handle('agent:retry'");
    expect(workbenchSource).toContain('data-agent-ui="timeline"');
    expect(workbenchSource).toContain('data-agent-ui="approval-center"');
    expect(workbenchSource).toContain('approval.preview.patch');
    expect(workbenchSource).toContain('重新执行');
  });

  it('does not let a late chat start reattach after the session component was disposed', () => {
    expect(chatSource).toContain('let disposed = false;');
    expect(chatSource).toContain('if (disposed)');
    expect(chatSource).toContain('void window.starchat.chat.cancel(id)');
    expect(chatSource).toContain('disposed = true;');
  });

  it('does not render an available capability card without a handler', () => {
    expect(workbenchSource).toContain('if (!onClick)');
    expect(workbenchSource).toContain('当前窗口未连接');
  });

  it('keeps explicitly disabled capabilities distinct from a disconnected handler', () => {
    const disabledBranch = workbenchSource.indexOf('if (disabled)');
    const missingHandlerBranch = workbenchSource.indexOf('if (!onClick)');
    expect(disabledBranch).toBeGreaterThanOrEqual(0);
    expect(missingHandlerBranch).toBeGreaterThanOrEqual(0);
    expect(disabledBranch).toBeLessThan(missingHandlerBranch);
    expect(workbenchSource).toContain('<small>未启用</small>');
  });

  it('provides four persistent and keyboard-accessible panel splitters', () => {
    expect(workbenchSource).toContain('readWorkbenchLayoutState');
    expect(workbenchSource).toContain('writeWorkbenchLayoutPatch');
    expect(workbenchSource).toContain('data-workbench-resizer="sidebar"');
    expect(workbenchSource).toContain('data-workbench-resizer="right-rail"');
    expect(workbenchSource).toContain('data-workbench-resizer="bottom-panel"');
    expect(consoleSource).toContain('data-workbench-resizer="character"');
    expect(resizeHandleSource).toContain('role="separator"');
    expect(resizeHandleSource).toContain('aria-orientation');
    expect(resizeHandleSource).toContain('aria-valuenow');
    expect(resizeHandleSource).toContain('setPointerCapture');
    expect(resizeHandleSource).toContain("case 'ArrowLeft'");
    expect(resizeHandleSource).toContain("case 'ArrowRight'");
    expect(resizeHandleSource).toContain("case 'ArrowUp'");
    expect(resizeHandleSource).toContain("case 'ArrowDown'");
    expect(workbenchCss).toContain('--wb-sidebar-open-width');
    expect(workbenchCss).toContain('--wb-right-rail-open-width');
    expect(workbenchCss).toContain('--wb-bottom-panel-open-height');
    expect(workbenchCss).toContain('--wb-character-width');
  });

  it('keeps production defaults collapsed while the screenshot fixture opts into the reference-open layout', () => {
    expect(workbenchSource).toContain('bottomPanelOpen = false');
    expect(screenshotSource).toContain('referenceLayout');
    expect(screenshotSource).toContain("productionLayout ? readWorkbenchLayoutState().bottomPanelOpen : true");
    expect(appSource).toContain('readWorkbenchLayoutState');
    expect(appSource).toContain('writeWorkbenchLayoutPatch');
    expect(appSource).not.toContain("starchat.bottom-panel.open");
  });

  it('uses compact live density and expands the dialogue when the pet owns the character window', () => {
    expect(readFileSync(resolve(rendererDirectory, 'workbench/reference.css'), 'utf8')).toContain('data-reference-layout="false"');
    expect(readFileSync(resolve(rendererDirectory, 'workbench/reference.css'), 'utf8')).toContain('grid-template-columns: minmax(0, 1fr) !important;');
    expect(readFileSync(resolve(rendererDirectory, 'workbench/reference.css'), 'utf8')).toContain('grid-template-rows: repeat(3, 136px) !important;');
    expect(consoleSource).toContain('data-character-visible={characterVisible ? \'true\' : \'false\'}');
  });
});
