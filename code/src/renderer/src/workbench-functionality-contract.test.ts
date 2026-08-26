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

describe('StarChat workbench functionality contracts', () => {
  it('uses one explicit in-memory session and exposes a real new-conversation reset', () => {
    expect(appSource).toContain('conversationKey');
    expect(appSource).toContain('onNewConversation');
    expect(workbenchSource).toContain('onNewConversation');
    expect(workbenchSource).not.toContain('窗口交互回归');
    expect(workbenchSource).not.toContain('Project-008 Agent 工作流');
  });

  it('does not render hard-coded demo task progress or fake attachment chips', () => {
    expect(consoleSource).not.toContain('6分45秒');
    expect(consoleSource).not.toContain('我已分析该项目的设置结构');
    expect(chatSource).not.toContain('分销45秒');
    expect(chatSource).not.toContain('agent-attachment-code-preview');
    expect(chatSource).toContain('attachments');
  });

  it('connects workbench tools to explicit safe actions and labels the bottom panel honestly', () => {
    expect(workbenchSource).toContain('onToolAction');
    expect(appSource).toContain('inspectWorkbench');
    expect(workbenchSource).toContain('受控验证日志');
    expect(workbenchSource).not.toContain('PS C:\\workspace\\Project-008>');
    expect(workbenchSource).not.toContain('新建终端');
  });

  it('adds minimal safe IPC for environment inspection, sharing, and maximize/restore', () => {
    expect(ipcSource).toContain('WorkbenchEnvironment');
    expect(preloadSource).toContain('workbench:inspect');
    expect(preloadSource).toContain('workbench:share');
    expect(preloadSource).toContain('window:toggle-maximize');
    expect(mainSource).toContain("ipcMain.handle('workbench:inspect'");
    expect(mainSource).toContain("ipcMain.handle('workbench:share'");
    expect(mainSource).toContain("ipcMain.handle('window:toggle-maximize'");
    expect(mainSource).toContain('settingsWindowMaximized');
    expect(mainSource).toContain('workArea');
    expect(workbenchServiceSource).toContain("execFileSync('git'");
    expect(mainSource).not.toContain('branchName = \'main\'');
  });

  it('keeps the agent path wired to a real request id and full task lifecycle', () => {
    expect(chatSource).toContain('window.baoyin.chat.start');
    expect(chatSource).toContain('window.baoyin.agent.cancel');
    expect(chatSource).toContain('window.baoyin.agent.approve');
    expect(chatSource).toContain('window.baoyin.agent.respond');
    expect(chatSource).toContain('onNewConversation');
    expect(appSource).toContain('window.baoyin.agent.onEvent');
  });

  it('does not let a late chat start reattach after the session component was disposed', () => {
    expect(chatSource).toContain('let disposed = false;');
    expect(chatSource).toContain('if (disposed)');
    expect(chatSource).toContain('void window.baoyin.chat.cancel(id)');
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
});
