import { createElement } from 'react';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Topbar } from './AgentWorkbench';
import { Live2DStage } from './AgentConsole';
import { nextThemePreference } from '../../shared/theme';

const rendererDirectory = resolve(import.meta.dirname);
const workbenchSource = readFileSync(resolve(rendererDirectory, 'AgentWorkbench.tsx'), 'utf8');
const consoleSource = readFileSync(resolve(rendererDirectory, 'AgentConsole.tsx'), 'utf8');
const appSource = readFileSync(resolve(rendererDirectory, 'App.tsx'), 'utf8');
const chatSource = readFileSync(resolve(rendererDirectory, 'CompanionChat.tsx'), 'utf8');
const iconSource = readFileSync(resolve(rendererDirectory, 'WorkbenchIcon.tsx'), 'utf8');
const stylesheet = readFileSync(resolve(rendererDirectory, 'workbench/workbench.css'), 'utf8');
const referenceStylesheet = readFileSync(resolve(rendererDirectory, 'workbench/reference.css'), 'utf8');
const settingsStylesheet = readFileSync(resolve(rendererDirectory, 'settings-center.css'), 'utf8');
const screenshotSource = readFileSync(resolve(rendererDirectory, 'WorkbenchScreenshot.tsx'), 'utf8');
const screenshotHelperSource = readFileSync(resolve(rendererDirectory, '../../../tools/render-workbench-screenshots.mjs'), 'utf8');

function readPngHeader(filePath: string): { width: number; height: number; colorType: number } {
  const png = readFileSync(filePath);
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
    colorType: png[25]
  };
}

function renderTopbar(): string {
  return renderToStaticMarkup(createElement(Topbar, {
    onMinimize: () => undefined,
    onClose: () => undefined,
    onToggleSidebar: () => undefined,
    sidebarCollapsed: false,
    sidebarToggleRef: { current: null },
    isMaximized: false
  }));
}

function renderStage(status: 'empty' | 'loading' | 'ready' | 'error'): string {
  return renderToStaticMarkup(createElement(Live2DStage, {
    status,
    roleName: '白音',
    liveContent: createElement('span', { 'data-test-live-content': true }),
    fallback: createElement('span', { 'data-test-static-content': true }, '静态角色')
  }));
}

describe('StarChat workbench structural/material rebuild contracts', () => {
  it('uses the opposite explicit theme preference for the topbar toggle', () => {
    expect(nextThemePreference('light')).toBe('dark');
    expect(nextThemePreference('dark')).toBe('light');
  });

  it('owns the character area as a layered Live2D Stage with explicit states', () => {
    const markup = renderStage('empty');

    expect(markup).toContain('data-workbench-stage="live2d"');
    expect(markup).toContain('data-live2d-stage-status="empty"');
    expect(markup).toContain('data-stage-layer="stars"');
    expect(markup).toContain('data-stage-layer="halo"');
    expect(markup).toContain('data-stage-layer="role"');
    expect(markup).toContain('data-stage-layer="glow"');
    expect(markup).toContain('data-stage-role="placeholder"');
    expect(markup).not.toContain('未配置');
  });

  it('keeps loading and error states on the same stage geometry without replacing the layout', () => {
    const loading = renderStage('loading');
    const error = renderStage('error');

    expect(loading).toContain('data-live2d-stage-status="loading"');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain('data-test-static-content');
    expect(error).toContain('data-live2d-stage-status="error"');
    expect(error).toContain('模型加载失败');
    expect(error).toContain('data-test-static-content');
  });

  it('defines a container-query stage crop and opacity-only Live2D transition', () => {
    expect(referenceStylesheet).toContain('container-type: size;');
    expect(referenceStylesheet).toContain('container-name: live2d-stage;');
    expect(referenceStylesheet).toContain('@container live2d-stage (max-height: 560px)');
    expect(referenceStylesheet).toContain('@container live2d-stage (min-height: 761px)');
    expect(referenceStylesheet).toContain('transition: opacity 200ms ease;');
    expect(referenceStylesheet).toContain('[data-live2d-stage-status="ready"] .wb-stage-role');
  });

  it('renders a real keyboard-accessible moon/sun toggle and persists it through settings', () => {
    const markup = renderTopbar();

    expect(markup).toContain('data-workbench="theme-toggle"');
    expect(markup).toContain('aria-label="切换深色主题"');
    expect(markup).toContain('data-theme-icon="moon"');
    expect(markup).toMatch(/<svg[^>]+/u);
    expect(iconSource).toContain("case 'moon'");
    expect(iconSource).toContain("case 'sun'");
    expect(workbenchSource).toContain('onToggleTheme');
    expect(appSource).toContain('nextThemePreference');
  });

  it('uses the supplied character portrait crop for the concept brand avatar', () => {
    const markup = renderTopbar();

    expect(markup).toContain('data-workbench="brand-avatar"');
    expect(markup).toContain('data-workbench-avatar-source="starchat-character-icon"');
    expect(workbenchSource).toContain("new URL('./assets/starchat-brand.png', import.meta.url).href");
    expect(referenceStylesheet).toContain('.wb-brand-avatar-crop');
    expect(referenceStylesheet).toContain('.wb-brand-avatar-crop img');
    expect(referenceStylesheet).toContain('top: calc(-10px * var(--wb-reference-scale));');
    expect(referenceStylesheet).toContain('left: calc(-27px * var(--wb-reference-scale));');
    expect(referenceStylesheet).toContain('width: calc(90px * var(--wb-reference-scale));');
    expect(referenceStylesheet).toContain('height: calc(135px * var(--wb-reference-scale));');
  });

  it('keeps environment source references on the same portrait and dark reference swatch', () => {
    expect(workbenchSource).toContain('className="wb-environment-source-avatar"');
    expect(referenceStylesheet).toContain('.wb-environment-source-avatar');
    expect(referenceStylesheet).toContain('.wb-environment-source-avatar img');
    expect(referenceStylesheet).toContain('.wb-environment-reference-thumb');
    expect(referenceStylesheet).toContain('linear-gradient(145deg, #071326 0%, #123d69 62%, #050d1a 100%)');
  });

  it('uses only the reference glyphs and removes obsolete decorative controls', () => {
    const markup = renderTopbar();

    expect(markup).not.toContain('wb-brand-star');
    expect(workbenchSource).not.toContain('name="star"');
    expect(consoleSource).not.toContain('wb-pet-action');
    expect(consoleSource).not.toContain('显示桌宠');
    expect(iconSource).toContain("case 'panel'");
    expect(iconSource).toContain("case 'columns'");
    expect(iconSource).toContain("case 'maximize': content = <><rect");
    expect(workbenchSource).toContain('name="panel"');
    expect(workbenchSource).toContain('name="columns"');
    expect(workbenchSource).toContain('name="maximize" size={22}');
    expect(workbenchSource).toContain('name="close" size={22}');
  });

  it('uses the overlapping-square maximize glyph from the concept window chrome', () => {
    expect(iconSource).toMatch(/case 'maximize': content = <><rect x="8" y="3" width="12" height="11" rx="1\.5" \/><rect x="5" y="7" width="12" height="12" rx="1\.5" \/><\/>;/u);
    expect(iconSource).not.toContain("path('M6 14V6a2 2 0 012-2h8')");
  });

  it('uses compact toolbar spacing and keeps the settings entry atmospheric', () => {
    expect(workbenchSource).toContain('size={26}');
    expect(workbenchSource).toContain('name="environment" size={24}');
    expect(workbenchSource).toContain('name="panel" size={24}');
    expect(workbenchSource).toContain('name="columns" size={24}');
    expect(workbenchSource).toContain('name="plus" size={24}');
    expect(stylesheet).toMatch(/\.wb-center-actions\s*\{[^}]*gap:\s*12px;[^}]*margin-right:\s*33px;/su);
    expect(stylesheet).toMatch(/\.wb-share-action\s*\{[^}]*height:\s*42px;[^}]*font-size:\s*14px;/su);
    expect(stylesheet).toMatch(/\.wb-center-actions \.wb-icon-button\s*\{[^}]*width:\s*42px;[^}]*height:\s*42px;/su);
    expect(stylesheet).toMatch(/\.wb-settings-entry\s*\{[^}]*background:\s*transparent;[^}]*border:\s*0;/su);
  });

  it('keeps the center toolbar action cluster aligned with the reference right edge', () => {
    expect(referenceStylesheet).toMatch(/\.wb-shell\[data-workbench-visual="reference"\]\[data-workbench-mode="workbench"\] \.wb-center-actions\s*\{[^}]*margin-right:\s*calc\(25px \* var\(--wb-reference-scale\)\);/su);
  });

  it('keeps the right-rail top utility row separated from its tool cards', () => {
    const railToplineRule = stylesheet.match(/\.wb-rail-topline\s*\{([^}]*)\}/su)?.[1] ?? '';

    expect(railToplineRule).toContain('height: 75px;');
    expect(stylesheet).toMatch(/\.wb-rail-topline::after\s*\{[^}]*top:\s*47px;[^}]*height:\s*2px;[^}]*background:\s*var\(--wb-rail-separator\);/su);
    expect(stylesheet).toMatch(/\.wb-topbar\s*\{[^}]*border-bottom:\s*0;/su);
  });

  it('gives the center and rail one frame each with a transparent layout seam', () => {
    expect(stylesheet).toContain('--wb-frame-border');
    expect(stylesheet).toContain('--wb-divider');
    expect(referenceStylesheet).toMatch(/\.wb-main-grid\s*\{[^}]*background:\s*transparent;[^}]*border:\s*0;/su);
    expect(referenceStylesheet).toContain('gap: calc(6px * var(--wb-reference-scale));');
    expect(referenceStylesheet).toMatch(/\.wb-center\s*\{[^}]*background:\s*var\(--wb-frame-surface,[^;]+\);[^}]*border:\s*1px solid var\(--wb-frame-border\)/su);
    expect(referenceStylesheet).toMatch(/\.wb-right-rail\s*\{[^}]*background:\s*var\(--wb-frame-surface,[^;]+\);[^}]*border:\s*1px solid var\(--wb-frame-border\)/su);
    expect(stylesheet).not.toContain('settings-center-shell::after');
    expect(stylesheet).not.toMatch(/\.wb-main-grid[^}]*padding:\s*1px/su);
    expect(stylesheet).toMatch(/\.app-shell\.settings-center-shell\s*\{[^}]*box-sizing:\s*border-box;[^}]*overflow:\s*hidden;/su);
    const mainRule = stylesheet.match(/\.wb-main-grid\s*\{([^}]*)\}/su)?.[1] ?? '';
    expect(mainRule).toContain('margin-left: 0;');
    expect(mainRule).toContain('margin-right: var(--wb-frame-right-inset);');
  });

  it('keeps attachments and model/context/temperature controls in one intentional composer toolbar', () => {
    expect(chatSource).toContain('data-agent-ui="attachments"');
    expect(chatSource).toContain('data-agent-ui="composer-tools"');
    expect(chatSource).toContain('data-agent-composer-control="context"');
    expect(chatSource).toContain('data-agent-composer-control="model"');
    expect(chatSource).toContain('data-agent-composer-control="temperature"');
    expect(stylesheet).toMatch(/\.agent-composer\s*\{[^}]*overflow:\s*hidden;/su);
    expect(stylesheet).toMatch(/\.agent-composer-tools\s*\{[^}]*display:\s*flex;/su);
    expect(stylesheet).not.toContain('agent-composer-footer { transform:');
  });

  it('integrates the controlled verification log tab into the bottom panel material', () => {
    const tabRule = stylesheet.match(/\.wb-terminal-tab\s*\{([^}]*)\}/su)?.[1] ?? '';

    expect(workbenchSource).toContain('data-workbench-terminal="verification-log"');
    expect(workbenchSource).toContain('className="wb-terminal-add"');
    expect(tabRule).toContain('background: transparent;');
    expect(tabRule).toContain('border: 0;');
    expect(tabRule).not.toContain('box-shadow:');
  });

  it('captures the exact user references and emits region mask/geometry/color evidence', () => {
    expect(screenshotHelperSource).toContain('C:/Users/23260/Pictures/a44358ff-6389-46a3-b1c7-34befd46e16c.png');
    expect(screenshotHelperSource).toContain('C:/Users/23260/Pictures/f343dae2-568b-4cab-bd5f-1c131f177aec.png');
    expect(screenshotHelperSource).toContain('regionMasks');
    expect(screenshotHelperSource).toContain('colorReport');
    expect(screenshotSource).toContain('theme={theme}');
  });

  it('keeps legacy settings layout rules off the shared workbench shell', () => {
    expect(settingsStylesheet).toContain('.workbench-shell:not([data-workbench-structure="shared"])');
    expect(settingsStylesheet).toContain('[data-workbench="shell"]:not([data-workbench-structure="shared"])');
    expect(screenshotHelperSource).toContain('const windows = [];');
    expect(screenshotHelperSource).toContain('for (const window of windows) window.destroy();');
  });

  it('keeps the 1622x969 reference as the single scale source for larger and smaller captures', () => {
    expect(workbenchSource).toContain('REFERENCE_WORKBENCH_VIEWPORT');
    expect(workbenchSource).toContain('--wb-reference-scale');
    expect(workbenchSource).toContain('Math.min(viewport.width / REFERENCE_WORKBENCH_VIEWPORT.width');
    expect(workbenchSource).toContain('data-reference-layout={referenceLayout ? \'true\' : \'false\'}');
    expect(stylesheet).toMatch(/@property --wb-sidebar-width\s*\{[^}]*inherits:\s*true;/su);
    expect(stylesheet).toMatch(/@property --wb-right-rail-width\s*\{[^}]*inherits:\s*true;/su);
    expect(referenceStylesheet).toContain('font-family: var(--wb-font-family);');
    expect(referenceStylesheet).toContain('calc(55px * var(--wb-reference-scale))');
  });

  it('keeps the reference rail width proportional before applying runtime-only layout clamps', () => {
    expect(workbenchSource).toMatch(/const effectiveRightRailWidth = referenceLayout \? rightRailWidth : Math\.min\(rightRailWidth, maxRightRailWidth\(/u);
    expect(workbenchSource).toMatch(/maximum=\{referenceLayout \? WORKBENCH_LAYOUT_LIMITS\.rightRail\.maximum : maxRightRailWidth\(/u);
  });

  it('renders the complete concept navigation hierarchy in the deterministic fixture', () => {
    expect(workbenchSource).toContain('referenceFixture?: boolean');
    expect(workbenchSource).toContain('data-workbench-reference="secondary-workspace"');
    expect(workbenchSource).toContain('模型窗口交互');
    expect(workbenchSource).toContain('meta="7天"');
    expect(screenshotSource).toContain('referenceFixture={!productionLayout}');
  });

  it('uses the supplied full-body character as the static placeholder until Live2D is ready', () => {
    const brandAssetPath = resolve(rendererDirectory, 'assets/starchat-brand.png');
    expect(existsSync(brandAssetPath)).toBe(true);
    expect(readPngHeader(brandAssetPath)).toEqual({ width: 256, height: 256, colorType: 6 });
    const roleAssetPath = resolve(rendererDirectory, 'assets/baoyin-static-role.png');
    expect(existsSync(roleAssetPath)).toBe(true);
    expect(readPngHeader(roleAssetPath)).toEqual({ width: 1024, height: 1536, colorType: 6 });
    expect(createHash('sha256').update(readFileSync(roleAssetPath)).digest('hex')).toBe('f5bf76e67df7b1c65c6bb0344f24ea4dda32ae90fe7b9f0c35a1bfc028e6d6b6');
    expect(consoleSource).not.toContain("new URL('./assets/starchat-brand.png', import.meta.url).href");
    expect(consoleSource).toContain("new URL('./assets/baoyin-static-role.png', import.meta.url).href");
    expect(consoleSource).toContain('className="wb-static-role is-character-placeholder"');
    expect(referenceStylesheet).not.toContain('.wb-static-role.is-character-placeholder img {');
    expect(referenceStylesheet).toContain('object-position: center top;');
    expect(consoleSource).toContain('data-workbench-role="static"');
    expect(consoleSource).toContain('src={staticRoleImage}');
    expect(consoleSource).toContain('className="wb-static-role-base"');
    expect(consoleSource).toContain('className="wb-static-role-highlight"');
    expect(consoleSource).not.toContain('外部模型未配置');
    expect(consoleSource).not.toContain('wb-character-empty');
    expect(referenceStylesheet).toContain('.wb-static-role');
    expect(referenceStylesheet).toContain('top: calc(70px * var(--wb-reference-scale));');
    expect(referenceStylesheet).toContain('height: calc(1200px * var(--wb-reference-scale));');
    expect(referenceStylesheet).toContain('filter: brightness(.58) saturate(1.42) contrast(1.06);');
    expect(referenceStylesheet).toContain('left: calc(50% - calc(13px * var(--wb-reference-scale)));');
    expect(referenceStylesheet).toContain('transform: translateX(-50%);');
    expect(referenceStylesheet).toContain('mask-image: linear-gradient(to bottom, #000 0%, #000 43%, rgba(0, 0, 0, .82) 52%, transparent 69%);');
  });

  it('uses the full-body master as an anchored three-quarter crop instead of shrinking it into the stage', () => {
    expect(referenceStylesheet).toContain('height: calc(1200px * var(--wb-reference-scale));');
    expect(referenceStylesheet).toContain('object-position: center top;');
    expect(referenceStylesheet).toContain('top: calc(70px * var(--wb-reference-scale));');
    expect(referenceStylesheet).toContain('height: calc(1320px * var(--wb-reference-scale));');
    expect(referenceStylesheet).toContain('height: calc(1120px * var(--wb-reference-scale));');
  });

  it('keeps the dark character surface quiet while preserving silver role highlights', () => {
    expect(referenceStylesheet).toContain('filter: brightness(.58) saturate(1.42) contrast(1.06);');
    expect(referenceStylesheet).toContain('filter: brightness(.72) saturate(.96) contrast(1.08);');
    expect(referenceStylesheet).toContain('opacity: .72;');
    expect(referenceStylesheet).toContain('mask-image: linear-gradient(to bottom, #000 0%, #000 28%, rgba(0, 0, 0, .72) 40%, rgba(0, 0, 0, .30) 54%, rgba(0, 0, 0, .08) 62%, transparent 68%);');
    expect(referenceStylesheet).toContain('html[data-theme="dark"] .wb-shell[data-workbench-visual="reference"][data-workbench-mode="workbench"] :where(.wb-character-panel, .wb-character-art)');
    expect(referenceStylesheet).toContain('background: linear-gradient(180deg, #050e1e 0%, #020916 100%) !important;');
    expect(referenceStylesheet).toContain('opacity: .1 !important;');
  });

  it('separates the dark role crown from the lower-body shade for concept material parity', () => {
    expect(referenceStylesheet).toContain('filter: brightness(.58) saturate(1.42) contrast(1.06);');
    expect(referenceStylesheet).toContain('filter: brightness(.72) saturate(.96) contrast(1.08);');
    expect(referenceStylesheet).toContain('mask-image: linear-gradient(to bottom, #000 0%, #000 28%, rgba(0, 0, 0, .72) 40%, rgba(0, 0, 0, .30) 54%, rgba(0, 0, 0, .08) 62%, transparent 68%);');
    expect(referenceStylesheet).toContain('background: linear-gradient(to bottom, transparent 0%, transparent 40%, rgba(0, 4, 12, .36) 52%, rgba(0, 4, 12, .48) 62%, rgba(0, 4, 12, .08) 78%, rgba(0, 4, 12, .14) 100%);');
  });

  it('keeps the reference fixture composer proportions and labels aligned with the concept', () => {
    expect(consoleSource).toContain("'agentStep'");
    expect(consoleSource).toContain("referenceFixture ? '用时' : '任务用时'");
    expect(chatSource).toContain("referenceFixture ? '默认模型' : state.settings.model");
    expect(chatSource).toContain("referenceFixture ? '轻度' : `温度 ${state.settings.temperature.toFixed(2)}`");
    expect(referenceStylesheet).toContain('grid-template-rows: calc(82px * var(--wb-reference-scale)) minmax(0, 1fr) calc(40px * var(--wb-reference-scale));');
    expect(referenceStylesheet).toContain('height: calc(80px * var(--wb-reference-scale));');
  });

  it('keeps the fixture attachment label on one concept-sized line and preserves dark role color', () => {
    expect(referenceStylesheet).toMatch(/\.agent-attachment-label\s*\{[^}]*font-size:\s*calc\(14px \* var\(--wb-reference-scale\)\);[^}]*white-space:\s*nowrap;/su);
    expect(referenceStylesheet).toContain('filter: brightness(.58) saturate(1.42) contrast(1.06);');
  });

  it('adds a dedicated starfield layer inside the character panel without restoring a second ring', () => {
    expect(referenceStylesheet).toContain('.wb-character-art.is-static-role::after');
    expect(referenceStylesheet).toContain("background-image: url('../assets/workbench-celestial-field.svg');");
    expect(referenceStylesheet).toContain('z-index: 0;');
    expect(referenceStylesheet).toContain('opacity: var(--wb-character-starfield-opacity);');
  });

  it('uses concept-sized workflow glyphs and text rhythm in the fixture trajectory', () => {
    expect(iconSource).toContain("| 'agentDone'");
    expect(consoleSource).toContain("step.completed ? 'agentDone' : 'agentStep'");
    expect(consoleSource).toContain("name={step.completed ? 'agentDone' : 'agentStep'} size={20}");
    expect(referenceStylesheet).toContain('gap: calc(5px * var(--wb-reference-scale));');
    expect(referenceStylesheet).toContain('font-size: calc(16px * var(--wb-reference-scale));');
  });

  it('anchors the reference composer to the concept baseline and keeps its controls aligned', () => {
    expect(referenceStylesheet).toContain('min-height: calc(214px * var(--wb-reference-scale));');
    expect(referenceStylesheet).toContain('margin-bottom: calc(3px * var(--wb-reference-scale));');
    expect(referenceStylesheet).toContain('padding: calc(19px * var(--wb-reference-scale)) calc(10px * var(--wb-reference-scale)) calc(10px * var(--wb-reference-scale)) calc(14px * var(--wb-reference-scale));');
    expect(referenceStylesheet).toContain('top: calc(-7px * var(--wb-reference-scale));');
    expect(referenceStylesheet).toContain('gap: calc(7px * var(--wb-reference-scale));');
    expect(referenceStylesheet).toContain('padding: calc(2px * var(--wb-reference-scale));');
    expect(referenceStylesheet).toContain('padding: calc(8px * var(--wb-reference-scale)) 0;');
    expect(referenceStylesheet).toContain('width: calc(36px * var(--wb-reference-scale));');
    expect(referenceStylesheet).toContain('height: calc(36px * var(--wb-reference-scale));');
    expect(referenceStylesheet).toContain('flex: 0 0 calc(36px * var(--wb-reference-scale));');
  });

  it('keeps inactive workspace rows atmospheric instead of inheriting legacy setting cards', () => {
    expect(referenceStylesheet).toContain('.wb-shell[data-workbench-structure="shared"] .wb-project-row,');
    expect(referenceStylesheet).toContain('.wb-shell[data-workbench-structure="shared"] .wb-session-row:not(.is-active)');
    expect(referenceStylesheet).toMatch(/\.wb-shell\[data-workbench-structure="shared"\] \.wb-project-row,[\s\S]*?background:\s*transparent\s*!important;[\s\S]*?border-color:\s*transparent\s*!important;/u);
  });

  it('keeps the reference sidebar tree rhythm and compact session rows', () => {
    expect(referenceStylesheet).toMatch(/\.wb-shell\[data-workbench-structure="shared"\] \.wb-project-tree\s*\{[^}]*margin-top:\s*calc\(12px \* var\(--wb-reference-scale\)\);/su);
    expect(referenceStylesheet).toMatch(/\.wb-shell\[data-workbench-structure="shared"\] \.wb-session-row\s*\{[^}]*min-height:\s*calc\(48px \* var\(--wb-reference-scale\)\);/su);
  });

  it('keeps the light reference character surface below the center pane midtone', () => {
    expect(referenceStylesheet).toContain('html[data-theme="light"] .wb-shell[data-workbench-visual="reference"][data-workbench-mode="workbench"] .wb-character-panel');
    expect(referenceStylesheet).toContain('linear-gradient(180deg, rgba(214, 226, 242, .55), rgba(201, 218, 238, .48)) !important;');
  });

  it('uses the concept navy typography scale inside the reference workbench only', () => {
    expect(referenceStylesheet).toContain('--wb-text-main: #07134f;');
    expect(referenceStylesheet).toContain('--wb-text-muted: #40588a;');
    expect(referenceStylesheet).toContain('--wb-text-subtle: #7180a6;');
    expect(referenceStylesheet).toContain('font-weight: 450;');
    expect(referenceStylesheet).toContain(':where(.wb-dialogue-meta, .wb-trajectory, .wb-plan-actions, .wb-environment-popover-reference, .wb-terminal-body)');
    expect(referenceStylesheet).toContain('.wb-project-row strong');
    expect(referenceStylesheet).toContain('.wb-session-select > span');
    expect(referenceStylesheet).toContain('.wb-sidebar-heading');
    expect(referenceStylesheet).toContain('.wb-tool-card strong');
  });

  it('keeps the light concept top edge as a compact glaze on each semantic frame', () => {
    expect(referenceStylesheet).toContain('html[data-theme="light"] .wb-shell[data-workbench-visual="reference"][data-workbench-mode="workbench"] :where(.wb-center, .wb-right-rail)');
    expect(referenceStylesheet).toContain('rgba(255, 255, 255, .34) 2px');
    expect(referenceStylesheet).toContain('rgba(255, 255, 255, 0) 5px');
    expect(referenceStylesheet).not.toContain(':where(.wb-center-toolbar, .wb-rail-topline)');
  });

  it('places one shared center separator on the concept content baseline', () => {
    expect(referenceStylesheet).toMatch(/\.wb-center-toolbar \{\r?\n  border-bottom: 0 !important;\r?\n\}/u);
    expect(referenceStylesheet).toContain('.wb-center-frame::before');
    expect(referenceStylesheet).toContain('top: calc(63px * var(--wb-reference-scale));');
    expect(referenceStylesheet).toContain('height: calc(3px * var(--wb-reference-scale));');
    expect(referenceStylesheet).toContain('background: linear-gradient(180deg, rgba(112, 149, 189, .04), rgba(112, 149, 189, .13), rgba(112, 149, 189, .02));');
  });

  it('aligns the right rail separator to the same softened concept baseline', () => {
    expect(referenceStylesheet).toContain('.wb-rail-topline::after');
    expect(referenceStylesheet).toContain('top: calc(46px * var(--wb-reference-scale));');
    expect(referenceStylesheet).toContain('height: calc(2px * var(--wb-reference-scale));');
    expect(referenceStylesheet).toContain('background: rgba(112, 149, 189, .08);');
  });

  it('keeps the light environment overlay edge aligned with the concept glass treatment', () => {
    expect(referenceStylesheet).toContain('top: calc(61px * var(--wb-reference-scale));');
    expect(referenceStylesheet).toContain('border-top-color: rgba(255, 255, 255, .78) !important;');
    expect(referenceStylesheet).toContain('border-right-color: rgba(255, 255, 255, .35) !important;');
    expect(referenceStylesheet).toContain('border-bottom-color: rgba(150, 182, 215, .10) !important;');
    expect(referenceStylesheet).toContain('border-left-color: rgba(150, 182, 215, .30) !important;');
  });

  it('keeps the light terminal seam as a two-pixel divider with a single body highlight', () => {
    expect(referenceStylesheet).toContain('height: calc(47px * var(--wb-reference-scale));');
    expect(referenceStylesheet).toContain('border-bottom: 2px solid var(--wb-border-divider) !important;');
    expect(referenceStylesheet).toContain('box-shadow: inset 0 1px 0 rgba(255, 255, 255, .62) !important;');
  });

  it('keeps the lower light panel material shaded with a soft bottom recovery', () => {
    expect(referenceStylesheet).toContain('rgba(190, 205, 236, .20) 79%');
    expect(referenceStylesheet).toContain('rgba(190, 205, 236, .22) 86%');
    expect(referenceStylesheet).toContain('rgba(255, 255, 255, .20) 100%');
  });

  it('keeps the dark static role readable as a cool gray-blue concept layer', () => {
    expect(referenceStylesheet).toContain('filter: brightness(.58) saturate(1.42) contrast(1.06);');
  });

  it('keeps the light static role cool and dimensional instead of washing it into the panel', () => {
    expect(referenceStylesheet).toContain('filter: brightness(.82) saturate(1.18) contrast(1.22);');
    expect(referenceStylesheet).toContain('filter: brightness(1.04) saturate(.96) contrast(1.05);');
  });

  it('keeps the light environment overlay muted instead of washing out its content', () => {
    expect(referenceStylesheet).toContain('--wb-surface-overlay: linear-gradient(180deg, rgba(241, 244, 251, .62) 0%, rgba(235, 241, 250, .70) 100%);');
  });

  it('uses theme-matched native backing only for the deterministic screenshot window', () => {
    expect(screenshotHelperSource).toContain("const backgroundColor = theme === 'light' ? '#b1c0d9' : '#05060a';");
  });

  it('marks the workbench as an isolated visual scope instead of relying on settings inheritance', () => {
    expect(workbenchSource).toContain('data-workbench-visual="reference"');
    expect(referenceStylesheet).toContain('[data-workbench-visual="reference"]');
    expect(settingsStylesheet).toContain(':not(.wb-shell[data-workbench-structure="shared"][data-workbench-mode="workbench"])');
  });

  it('owns the reference material stack with explicit app, panel, card, and overlay tokens', () => {
    for (const token of ['--wb-bg-app', '--wb-surface-panel', '--wb-surface-card', '--wb-surface-overlay', '--wb-shadow-panel']) {
      expect(referenceStylesheet).toContain(token);
    }
    expect(referenceStylesheet).toContain('backdrop-filter: blur(18px) saturate(120%);');
    expect(referenceStylesheet).toContain('backdrop-filter: none;');
  });

  it('compares the latest 1622x969 concept files without stretching their one-pixel source mismatch', () => {
    expect(screenshotHelperSource).toContain('C:/Users/23260/Pictures/a44358ff-6389-46a3-b1c7-34befd46e16c.png');
    expect(screenshotHelperSource).toContain('C:/Users/23260/Pictures/f343dae2-568b-4cab-bd5f-1c131f177aec.png');
    expect(screenshotHelperSource).toContain('referenceWasCropped');
    expect(screenshotHelperSource).toContain('controllableOnly');
    expect(screenshotHelperSource).toContain('--workbench-only');
  });
});
