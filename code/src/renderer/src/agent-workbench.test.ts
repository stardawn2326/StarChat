import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AgentTask } from '../../shared/agent';
import { AgentWorkbench } from './AgentWorkbench';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(testDirectory, 'settings-center.css'), 'utf8');
const appSource = readFileSync(resolve(testDirectory, 'App.tsx'), 'utf8');
const petSource = readFileSync(resolve(testDirectory, 'PetApp.tsx'), 'utf8');
const petStyles = readFileSync(resolve(testDirectory, 'styles.css'), 'utf8');

describe('StarChat Agent workbench shell', () => {
  it('exposes stable topbar, sidebar, center, right rail and collapsible bottom slots', () => {
    const markup = renderToStaticMarkup(createElement(AgentWorkbench, {
      activePage: null,
      roleName: '白音',
      modelLabel: '未配置外部模型',
      themeLabel: '跟随系统',
      onNavigate: () => undefined,
      onToggleBottomPanel: () => undefined,
      children: createElement('div', { 'data-testid': 'slot-content' }, '真实页面插槽')
    }));

    expect(markup).toContain('data-workbench="shell"');
    expect(markup).toContain('data-workbench="topbar"');
    expect(markup).toContain('data-workbench="sidebar"');
    expect(markup).toContain('data-workbench="center"');
    expect(markup).toContain('data-workbench="right-rail"');
    expect(markup).toContain('data-workbench="bottom-panel"');
    expect(markup).toContain('data-testid="slot-content"');
    expect(markup).toContain('StarChat');
  });

  it('keeps the workbench theme contract light-safe and the transparent PetWindow isolated', () => {
    expect(css).toContain('.workbench-bottom-panel');
    expect(css).toContain('background: var(--theme-surface)');
    expect(css).toContain('[data-workbench="shell"]');
    expect(css).toContain('var(--theme-window-gradient)');
    expect(appSource).toContain('AgentWorkbench');
    expect(appSource).toContain('SettingsHome');
    expect(appSource).toContain('SettingsDetailsV2');
    expect(petSource).not.toContain('AgentWorkbench');
    expect(petSource).not.toContain('data-workbench');
    expect(petStyles).toContain('.pet-shell');
    expect(petStyles).toContain('background: transparent;');
  });

  it('renders real capability states while keeping the bottom slot terminal-only', () => {
    const task = {
      id: 'task-1',
      sessionId: 'baoyin.default:default',
      roleId: 'baoyin.default',
      message: '检查项目状态',
      mode: 'agent',
      route: { route: 'agent', method: 'deterministic', explain: '项目检查' },
      status: 'running',
      createdAt: 1,
      updatedAt: 2,
      currentStep: 1,
      steps: [],
      invocations: []
    } as AgentTask;
    const markup = renderToStaticMarkup(createElement(AgentWorkbench, {
      activePage: null,
      roleName: '白音',
      modelLabel: '未配置外部模型',
      themeLabel: '浅色晨星',
      agentAvailable: true,
      agentTasks: [task],
      bottomPanelOpen: true,
      onNavigate: () => undefined,
      onToggleBottomPanel: () => undefined,
      onCancelTask: () => undefined,
      children: createElement('div', null, '真实页面插槽')
    }));

    expect(markup).not.toContain('工作区资源');
    expect(markup).not.toContain('文件与源码只读');
    expect(markup).toContain('受控验证日志');
    expect(markup).toContain('任务管理');
    expect(markup).toContain('侧边聊天');
    expect(markup).not.toContain('任意终端');
    expect(markup).toContain('浏览器');
    expect(markup).not.toContain('Git 写入');
    expect(markup).toContain('data-capability-state="disabled"');
    expect(markup).toContain('data-agent-ui="capabilities"');
    expect(markup).not.toMatch(/<button[^>]+data-capability-id="(?:terminal|browser|git-write)"/);
    expect(markup).toContain('检查项目状态');
    expect(markup).not.toContain('task-1');
  });

  it('keeps the sidebar and capability rail available in the narrow-window layout', () => {
    const narrowBlock = css.slice(css.lastIndexOf('@media (max-width: 700px)'));
    expect(narrowBlock).toContain('.workbench-sidebar { display: flex;');
    expect(narrowBlock).toContain('.workbench-right-rail { display: flex;');
    expect(narrowBlock).not.toContain('.workbench-sidebar { display: none;');
    expect(narrowBlock).not.toContain('.workbench-right-rail { display: none;');
  });
});
