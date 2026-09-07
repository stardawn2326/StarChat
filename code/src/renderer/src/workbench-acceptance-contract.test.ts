import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AgentWorkbench } from './AgentWorkbench';

const rendererDirectory = resolve(import.meta.dirname);
const referenceStyles = readFileSync(resolve(rendererDirectory, 'workbench/reference.css'), 'utf8');
const screenshotHelper = readFileSync(resolve(rendererDirectory, '../../../tools/render-workbench-screenshots.mjs'), 'utf8');

function renderSettingsWorkbench(): string {
  return renderToStaticMarkup(createElement(AgentWorkbench, {
    activePage: 'settings',
    roleName: '白音',
    modelLabel: '未配置外部模型',
    themeLabel: '深色星夜',
    onNavigate: () => undefined,
    onToggleBottomPanel: () => undefined,
    children: createElement('div', null, '设置内容')
  }));
}

describe('StarChat UI acceptance boundaries', () => {
  it('replaces the workbench sidebar with exactly one settings navigation rail', () => {
    const markup = renderSettingsWorkbench();

    expect(markup.match(/data-workbench-sidebar-mode="settings"/g) ?? []).toHaveLength(1);
    expect(markup).not.toContain('aria-label="StarChat 项目与会话导航"');
    expect(markup).not.toContain('wb-project-tree');
    expect(markup).toContain('返回应用');
    expect(markup).not.toContain('返回工作台');
  });

  it('has a 1280px responsive contract that keeps the workflow and tool rail inside the viewport', () => {
    expect(referenceStyles).toContain('@media (max-width: 1280px)');
    expect(referenceStyles).toContain('.wb-shell[data-workbench-visual="reference"] .wb-agent-workflow');
    expect(referenceStyles).toContain('grid-template-columns: minmax(240px, 38%) 8px minmax(0, 1fr)');
    expect(referenceStyles).toContain('overflow-x: clip');
    expect(referenceStyles).toContain('.wb-shell[data-workbench-visual="reference"][data-reference-layout="false"][data-workbench-mode="workbench"] .wb-tool-grid');
    expect(referenceStyles).toContain('grid-template-rows: repeat(3, minmax(0, 1fr));');
  });

  it('uses the concept scale for the two-column tool cards instead of leaving the rail half empty', () => {
    expect(referenceStyles).toContain('grid-template-rows: repeat(3, calc(182px * var(--wb-reference-scale)));');
    expect(referenceStyles).toContain('font-size: calc(16px * var(--wb-reference-scale));');
  });

  it('keeps the workspace heading controls as one consistent linear icon group', () => {
    const markup = renderToStaticMarkup(createElement(AgentWorkbench, {
      activePage: null,
      roleName: '白音',
      modelLabel: '未配置外部模型',
      themeLabel: '深色星夜',
      onNavigate: () => undefined,
      onToggleBottomPanel: () => undefined,
      children: createElement('div', null, '工作台内容')
    }));

    expect(markup).toContain('aria-label="搜索工作区"');
    expect(markup).toContain('aria-label="筛选工作区"');
    expect(markup).toContain('aria-label="添加工作区"');
  });

  it('keeps the settings page on the shared StarChat material system with a bounded content column', () => {
    expect(referenceStyles).toContain('.wb-shell[data-workbench-visual="reference"][data-workbench-mode="settings"]');
    expect(referenceStyles).toContain('--wb-settings-content-max: 1080px');
    expect(referenceStyles).toContain('--wb-settings-card-radius: 12px');
    expect(referenceStyles).toContain('font-family: var(--font-ui)');
  });

  it('keeps the final concept atmosphere visible without washing out either theme', () => {
    expect(referenceStyles).toContain('html[data-theme="light"] .wb-shell[data-workbench-visual="reference"][data-workbench-mode="workbench"]::before');
    expect(referenceStyles).toContain('--wb-starfield-opacity: .32 !important;');
    expect(referenceStyles).toContain('--wb-constellation-color: rgba(79, 132, 196, .55);');
    expect(referenceStyles).toContain("url('../assets/workbench-celestial-field.svg') center / 100% 100% no-repeat");
    expect(referenceStyles).toContain("url('../assets/workbench-constellation.svg') left top / 100% 100% no-repeat");
    expect(referenceStyles).toContain('--wb-material-content: linear-gradient(180deg, rgba(232, 239, 248, .80) 0%, rgba(222, 233, 246, .70) 100%);');
    expect(referenceStyles).toContain('--wb-material-content: linear-gradient(180deg, rgba(3, 10, 22, .94) 0%, rgba(0, 5, 14, .92) 100%);');
    expect(referenceStyles).toContain('filter: brightness(.38) saturate(1.04) contrast(1.12);');
    expect(referenceStyles).toContain('z-index: 3;');
  });

  it('compares runtime captures against the user-approved light and dark concept images', () => {
    expect(screenshotHelper).toContain('C:/Users/23260/Pictures/a44358ff-6389-46a3-b1c7-34befd46e16c.png');
    expect(screenshotHelper).toContain('C:/Users/23260/Pictures/f343dae2-568b-4cab-bd5f-1c131f177aec.png');
  });
});
