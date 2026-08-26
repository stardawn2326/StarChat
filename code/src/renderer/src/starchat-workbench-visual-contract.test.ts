import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AgentWorkbench } from './AgentWorkbench';

const rendererDirectory = resolve(import.meta.dirname);
const workbenchSource = readFileSync(resolve(rendererDirectory, 'AgentWorkbench.tsx'), 'utf8');
const appSource = readFileSync(resolve(rendererDirectory, 'App.tsx'), 'utf8');
const stylesheet = readFileSync(resolve(rendererDirectory, 'settings-center.css'), 'utf8');
const petSource = readFileSync(resolve(rendererDirectory, 'PetApp.tsx'), 'utf8');

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
    expect(markup).toContain('data-workbench="environment-popover"');
    expect(markup).toContain('data-workbench="terminal-panel"');
    expect(markup).toContain('工作树');
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
      'grid-template-columns: 266px minmax(0, 1fr) 356px',
      'gap: 10px',
      'height: 62px',
      'width: 265px',
      'min-height: 620px',
      'min-height: 174px',
      'border-radius: 14px'
    ]) {
      expect(stylesheet).toContain(dimension);
    }
  });

  it('does not move workbench presentation concerns into the transparent PetWindow boundary', () => {
    expect(petSource).not.toContain('data-workbench');
    expect(petSource).not.toContain('AgentWorkbench');
    expect(appSource).toContain('AgentWorkbench');
  });
});
