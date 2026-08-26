import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
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
});
