import { createElement } from 'react';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AgentWorkbench } from './AgentWorkbench';

const rendererDirectory = resolve(import.meta.dirname);
const workbenchSource = readFileSync(resolve(rendererDirectory, 'AgentWorkbench.tsx'), 'utf8');
const consoleSource = readFileSync(resolve(rendererDirectory, 'AgentConsole.tsx'), 'utf8');
const chatSource = readFileSync(resolve(rendererDirectory, 'CompanionChat.tsx'), 'utf8');
const iconSource = readFileSync(resolve(rendererDirectory, 'WorkbenchIcon.tsx'), 'utf8');
const appSource = readFileSync(resolve(rendererDirectory, 'App.tsx'), 'utf8');
const mainSource = readFileSync(resolve(rendererDirectory, 'main.tsx'), 'utf8');
const stylesheet = readFileSync(resolve(rendererDirectory, 'settings-center.css'), 'utf8');
const rebuiltStylesheet = readFileSync(resolve(rendererDirectory, 'workbench/workbench.css'), 'utf8');
const petSource = readFileSync(resolve(rendererDirectory, 'PetApp.tsx'), 'utf8');
const screenshotHelper = resolve(rendererDirectory, '../../../tools/render-workbench-screenshots.mjs');

function renderWorkbench(): string {
  return renderToStaticMarkup(createElement(AgentWorkbench, {
    activePage: null,
    roleName: '白音',
    modelLabel: '未配置外部模型',
    themeLabel: '深色星夜',
    onNavigate: () => undefined,
    onToggleBottomPanel: () => undefined,
    children: createElement('div', null, 'Agent 内容')
  }));
}

describe('StarChat 参考图工作台视觉契约', () => {
  it('keeps the main Agent workspace free of configuration navigation and puts one Settings entry at the lower left', () => {
    const markup = renderWorkbench();

    expect(markup).toContain('data-workbench="settings-entry"');
    expect(markup).toContain('设置');
    expect(markup).not.toContain('设置入口');
    expect(markup).not.toContain('人格与记忆');
    expect(markup).not.toContain('角色模型');
    expect(markup).not.toContain('服务与连接');
    expect(markup).not.toContain('应用行为');
  });

  it('renders the reference right rail and terminal panel as Agent workflow tools', () => {
    const markup = renderWorkbench();

    for (const label of ['资源管理器', '源代码管理', '任务管理', '终端', '浏览器', '侧边聊天']) {
      expect(markup).toContain(label);
    }
    expect(markup).not.toContain('data-workbench="environment-popover"');
    expect(markup).toContain('data-workbench="environment-trigger"');
    expect(markup).toContain('data-workbench="terminal-panel"');
    expect(workbenchSource).toContain('工作树');
  });

  it('matches the reference topbar and right rail without invented surfaces', () => {
    const markup = renderWorkbench();

    expect(markup).not.toContain('workbench-theme-chip');
    expect(markup).not.toContain('显示桌宠');
    expect(markup).toContain('data-workbench-window-control="minimize"');
    expect(markup).toContain('data-workbench-window-control="maximize"');
    expect(markup).toContain('data-workbench-window-control="close"');
    expect(markup).not.toContain('workbench-presence-card');
    expect(markup).not.toContain('workbench-guardrail-card');
    expect(markup).not.toContain('workbench-rail-footer');
    expect(workbenchSource).toContain('baoyin-64.png');
    expect(iconSource).toContain('<svg');
    for (const placeholder of ['✦', '▱', '⌁', '⌘', '◎', '›_']) expect(workbenchSource).not.toContain(placeholder);
  });

  it('uses the rebuilt five-region workbench tree instead of the legacy settings-center workbench selectors', () => {
    expect(workbenchSource).toContain("./workbench/workbench.css");
    expect(workbenchSource).not.toContain("./settings-center.css");
    expect(workbenchSource).toContain('data-workbench-region="topbar"');
    expect(workbenchSource).toContain('data-workbench-region="sidebar"');
    expect(workbenchSource).toContain('data-workbench-region="center"');
    expect(workbenchSource).toContain('data-workbench-region="right"');
    expect(workbenchSource).toContain('data-workbench-region="bottom"');
    expect(consoleSource).not.toContain('agent-character-caption');
    expect(chatSource).toContain('向 StarChat 发送消息');
    expect(chatSource).toContain('agent-attachment-slots');
    expect(chatSource).toContain('agent-composer-control');
    expect(workbenchSource).not.toContain('workbench-terminal-status');
    expect(workbenchSource).not.toContain('Agent Runtime ·');
    expect(workbenchSource).not.toContain('暂无活动 Agent 任务');
  });

  it('uses a real Agent conversation title and non-demo session labels', () => {
    const markup = renderWorkbench();

    expect(markup).not.toContain('设置工作台预览');
    expect(markup).not.toContain('模型窗口交互');
    expect(markup).not.toContain('刚刚');
    expect(markup).not.toContain('7天');
    expect(markup).toContain('Project-008 Agent 工作流');
    expect(workbenchSource).toContain('sessionTitle');
  });

  it('keeps the environment popover closed until its trigger is used and closes it accessibly', () => {
    const markup = renderWorkbench();

    expect(markup).not.toContain('data-workbench="environment-popover"');
    expect(markup).toContain('data-workbench="environment-trigger"');
    expect(workbenchSource).toContain('setEnvironmentOpen');
    expect(workbenchSource).toContain("event.key === 'Escape'");
    expect(workbenchSource).toContain('focus()');
  });

  it('keeps the six settings domains and debug/import/export reachable only through the Settings route', () => {
    const markup = renderWorkbench();

    expect(markup).toContain('data-workbench="settings-entry"');
    expect(workbenchSource).not.toMatch(/<(?:input|textarea|select)\b/);
    expect(workbenchSource).not.toContain('settings-card');
    expect(appSource).toContain("const settingsPageIds: readonly SettingsPageId[] = ['chat', 'personality', 'model', 'voice', 'service', 'behavior'];");
    for (const capability of ['onImportRole', 'onExportRole', 'onDebug', 'onRuntimeCommand', 'onSaveService']) expect(appSource).toContain(capability);
    expect(appSource).toContain("route === 'settings'");
  });

  it('provides an actual light/dark screenshot capture path at the requested viewport', () => {
    expect(existsSync(screenshotHelper)).toBe(true);
    const source = existsSync(screenshotHelper) ? readFileSync(screenshotHelper, 'utf8') : '';
    expect(source).toContain('1622');
    expect(source).toContain('969');
    expect(source).toContain('light');
    expect(source).toContain('dark');
    expect(source).toContain('capturePage');
    expect(source).toContain('diff');
    expect(source).toContain('loadFile');
    expect(source).toContain('executeJavaScript');
    expect(source).toContain('geometry');
    expect(source).toContain('regions');
    expect(source).not.toContain('staticHarnessHtml');
    expect(mainSource).toContain('workbench-screenshot');
  });

  it('uses one theme-agnostic layout structure for both light and dark reference themes', () => {
    const markup = renderWorkbench();

    expect(markup).toContain('data-workbench-structure="shared"');
    expect(workbenchSource).toContain('data-workbench-theme="tokenized"');
    expect(stylesheet).toContain('[data-theme="light"] .workbench-shell');
    expect(stylesheet).toContain('[data-theme="dark"] .workbench-shell');
    expect(stylesheet).toContain('var(--theme-window-gradient)');
    expect(stylesheet).not.toContain('.workbench-shell.is-dark');
    expect(stylesheet).not.toContain('.workbench-shell.is-light');
  });

  it('pins the reference baseline proportions and key panel dimensions', () => {
    for (const dimension of [
      'grid-template-rows: 55px minmax(0, 1fr) 174px',
      'grid-template-columns: var(--wb-sidebar-width) minmax(0, 1fr)',
      'gap: 10px',
      'flex: 0 0 62px',
      'width: 265px',
      'min-width: 620px',
      'min-height: 174px',
      'border-radius: 14px'
    ]) {
      expect(rebuiltStylesheet).toContain(dimension);
    }
    expect(rebuiltStylesheet).toContain('1622x969');
    expect(rebuiltStylesheet).toContain('titlebar\n  is 55px');
    expect(rebuiltStylesheet).toContain('--wb-sidebar-open-width: 266px');
  });

  it('keeps the first-layer Codex composition free of an inset sidebar card', () => {
    expect(rebuiltStylesheet).toContain('/* First-layer Codex composition */');
    expect(rebuiltStylesheet).toContain('padding: 0 14px 14px 0');
    expect(rebuiltStylesheet).toContain('grid-template-columns: var(--wb-sidebar-width) minmax(0, 1fr)');
    expect(rebuiltStylesheet).toContain('background: transparent; border: 0; border-radius: 0; box-shadow: none;');
    expect(rebuiltStylesheet).toContain('.wb-topbar {');
    expect(rebuiltStylesheet).toContain('border-bottom: 1px solid var(--theme-titlebar-border)');
  });

  it('does not move workbench presentation concerns into the transparent PetWindow boundary', () => {
    expect(petSource).not.toContain('data-workbench');
    expect(petSource).not.toContain('AgentWorkbench');
    expect(appSource).toContain('AgentWorkbench');
  });
});
