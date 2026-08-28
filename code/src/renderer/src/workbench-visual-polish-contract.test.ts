import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const rendererDirectory = resolve(import.meta.dirname);
const stylesheet = readFileSync(resolve(rendererDirectory, 'workbench/workbench.css'), 'utf8');
const consoleSource = readFileSync(resolve(rendererDirectory, 'AgentConsole.tsx'), 'utf8');
const chatSource = readFileSync(resolve(rendererDirectory, 'CompanionChat.tsx'), 'utf8');
const screenshotSource = readFileSync(resolve(rendererDirectory, 'WorkbenchScreenshot.tsx'), 'utf8');
const celestialFieldAsset = resolve(rendererDirectory, 'assets/workbench-celestial-field.svg');
const constellationAsset = resolve(rendererDirectory, 'assets/workbench-constellation.svg');
const darkConstellationAsset = resolve(rendererDirectory, 'assets/workbench-constellation-dark.svg');
const constellationSource = readFileSync(constellationAsset, 'utf8');
const darkConstellationSource = readFileSync(darkConstellationAsset, 'utf8');

describe('StarChat final reference polish contract', () => {
  it('keeps typography light and precise at the reference scale', () => {
    expect(stylesheet).toContain('--wb-body-weight: 430');
    expect(stylesheet).toContain('--wb-heading-weight: 520');
    expect(stylesheet).toContain('.wb-brand-name { color: var(--theme-heading); font-size: 16px; font-weight: 520');
    expect(stylesheet).toContain('.wb-tool-card strong { color: var(--theme-heading); font-size: 16px; font-weight: 500');
    expect(stylesheet).toContain('.wb-terminal-prompt { display: flex; align-items: center; gap: 8px; color: var(--theme-heading); font: 15px/1.4 Consolas, monospace;');
  });

  it('owns one light-reference celestial composition on the full-window base instead of the sidebar', () => {
    expect(existsSync(celestialFieldAsset)).toBe(true);
    expect(existsSync(constellationAsset)).toBe(true);
    expect(stylesheet).toContain("url('../assets/workbench-celestial-field.svg')");
    expect(stylesheet).toContain("url('../assets/workbench-constellation.svg')");
    expect(stylesheet).toContain('--wb-starfield-color');
    expect(stylesheet).toContain('--wb-constellation-color');
    expect(stylesheet).toMatch(/\.wb-shell::after\s*\{[^}]*left:\s*0;[^}]*top:\s*55px;[^}]*width:\s*280px;[^}]*height:\s*calc\(100% - 55px\);/s);
    expect(stylesheet).toContain('mask-image: url(\'../assets/workbench-constellation.svg\')');
    expect(stylesheet).toContain('.wb-sidebar::before { display: none; }');
    expect(stylesheet).not.toContain('linear-gradient(153deg, transparent 39.4%');
  });

  it('uses the shared Live2D canvas for the character and keeps the composer reference structure', () => {
    expect(consoleSource).toContain('Live2DCanvas');
    expect(consoleSource).not.toContain('BAOYIN_CHARACTER_ART');
    expect(stylesheet).toContain('.wb-character-art > .live2d-card { position: absolute; inset: 0;');
    expect(stylesheet).toContain('.wb-trajectory p { max-width: 330px;');
    expect(stylesheet).toContain('.agent-composer { min-height: 210px;');
    expect(chatSource).toContain('agent-attachment-empty');
    expect(chatSource).toContain('referenceFixture = false');
    expect(chatSource).toContain('agent-attachment-code-preview');
    expect(chatSource).toContain('分销 45秒');
    expect(chatSource).toContain('contextUsageOverride');
    expect(screenshotSource).toContain('contextUsageOverride={32}');
    expect(chatSource).toContain('剩余上下文');
  });

  it('keeps the character art covering the panel from its top edge', () => {
    expect(stylesheet).toContain('.wb-character-art { position: absolute; inset: 0;');
    expect(stylesheet).toContain('.wb-character-actions { position: absolute; top: 8px; right: 8px; z-index: 4;');
    expect(stylesheet).toContain('.wb-character-art > .live2d-card .live2d-model-clip-layer { z-index: 1;');
    expect(stylesheet).not.toContain('top: 120px;');
  });

  it('publishes character panel/art rectangles in the real screenshot geometry contract', () => {
    const screenshotHelper = readFileSync(resolve(rendererDirectory, '../../../tools/render-workbench-screenshots.mjs'), 'utf8');
    expect(screenshotHelper).toContain('characterPanel:');
    expect(screenshotHelper).toContain('characterArt:');
    expect(screenshotHelper).toContain("characterPanel: '[data-workbench-region=\"character\"]'");
    expect(screenshotHelper).toContain("characterArt: '.wb-character-art'");
  });

  it('keeps the reference fixture character frame aligned to the shared work-view inset', () => {
    expect(consoleSource).toContain('referenceFixture ? 332.265625');
    expect(stylesheet).toContain('padding: 16px 17px 10px;');
  });

  it('keeps the rail and terminal glass layers legible without changing the passed animation contract', () => {
    expect(stylesheet).toContain('.wb-tool-card.is-disabled { cursor: not-allowed; opacity: .72;');
    expect(stylesheet).toContain('.wb-tool-card { display: flex; min-width: 0; min-height: 174px;');
    expect(stylesheet).toContain('.wb-terminal-tab, .wb-terminal-add, .wb-terminal-close { display: inline-flex; height: 30px;');
    expect(stylesheet).toContain('transition: --wb-sidebar-width 360ms cubic-bezier(.48, .38, .2, .98)');
  });

  it('uses one calibrated crystalline material stack for the work view, rail, drawer, and settings view', () => {
    expect(stylesheet).toContain('--wb-glass-blur: 10px;');
    expect(stylesheet).toContain('--wb-glass-saturation: 110%;');
    expect(stylesheet).toContain('backdrop-filter: blur(var(--wb-glass-blur)) saturate(var(--wb-glass-saturation));');
    const lightToolMaterial = stylesheet.match(
      /html\[data-theme="light"\][^{]+\.wb-shell\[data-workbench="shell"\]\[data-workbench-mode\] \.wb-tool-card \{([^}]*)\}/s
    )?.[1] ?? '';
    expect(lightToolMaterial).toContain('linear-gradient(180deg');
    expect(lightToolMaterial).toContain('rgba(218, 229, 243, .10)');
    expect(lightToolMaterial).toContain('rgba(205, 219, 237, .12)');
    expect(lightToolMaterial).toContain('backdrop-filter: blur(22px) saturate(125%);');
    expect(lightToolMaterial).not.toContain('linear-gradient(145deg');
    expect(lightToolMaterial).not.toMatch(/box-shadow:\s*0\s+\d+px\s+\d+px/);
    const toolGridMaterial = stylesheet.match(
      /body\[data-window="settings"\][^{]+\.wb-shell\[data-workbench="shell"\]\[data-workbench-mode\] \.wb-tool-grid \{([^}]*)\}/s
    )?.[1] ?? '';
    expect(toolGridMaterial).toContain('background: transparent;');
    const darkToolMaterial = stylesheet.match(
      /html\[data-theme="dark"\][^{]+\.wb-shell\[data-workbench="shell"\]\[data-workbench-mode\] \.wb-tool-card \{([^}]*)\}/s
    )?.[1] ?? '';
    expect(darkToolMaterial).toContain('rgba(36, 37, 40, .33)');
    expect(darkToolMaterial).toContain('rgba(31, 31, 34, .32)');
    expect(darkToolMaterial).toContain('backdrop-filter: blur(22px) saturate(125%);');
    expect(stylesheet).toContain('/* Final reference material calibration */');
    expect(stylesheet).toContain('radial-gradient(ellipse 25% 54% at 0 100%');
    expect(stylesheet).toContain('radial-gradient(ellipse at 88% 4%');
    expect(stylesheet).not.toMatch(/radial-gradient\(ellipse \d+px \d+px at/);
    expect(stylesheet).toContain('linear-gradient(180deg, rgba(0, 0, 0, .12)');
    expect(stylesheet).toContain('border-color: rgba(149, 169, 198, .12);');
    expect(stylesheet).toContain('rgba(255, 255, 255, .54) 0, rgba(255, 255, 255, .34) 18px');
    expect(stylesheet).toContain('rgba(247, 250, 255, .33) 72%');
    expect(stylesheet).toContain('rgba(220, 231, 246, .04) 100%');
    expect(stylesheet).toContain('linear-gradient(100deg, #e2e9f6 0%, #e3eaf6 64%, #e4ebf7 100%)');
    expect(stylesheet).toContain('rgba(255, 255, 255, .30) 0%, rgba(252, 254, 255, .30) 30%');
    expect(stylesheet).toContain('rgba(248, 251, 255, .34) 72%');
    expect(stylesheet).toContain('rgba(239, 246, 253, .08) 100%');
    expect(stylesheet).toContain('rgba(15, 27, 45, .26) 0%');
    expect(stylesheet).toContain('rgba(12, 26, 44, .28) 33%');
    expect(stylesheet).toContain('rgba(13, 29, 48, .32) 72%');
    expect(stylesheet).toContain('rgba(15, 29, 47, .27) 100%');
    expect(stylesheet).toContain('rgba(234, 243, 253, .22) 46px');
    expect(stylesheet).toContain('rgba(218, 229, 243, .10)');
    expect(stylesheet).toContain('rgba(205, 219, 237, .12)');
    expect(stylesheet).toContain('rgba(10, 18, 31, .24) 0, rgba(6, 13, 24, .30) 45%');
    expect(stylesheet).toContain('rgba(4, 10, 18, .20) 100%');
    expect(stylesheet).toContain('rgba(36, 37, 40, .33)');
    expect(stylesheet).toContain('rgba(231, 240, 252, .12)');
    expect(stylesheet).toContain('rgba(6, 15, 28, .34)');
  });

  it('keeps the light reference lower-left background bloom visible beneath the fused sidebar', () => {
    expect(stylesheet).toContain(
      'radial-gradient(ellipse 25% 54% at 0 100%, rgba(116, 160, 214, .215) 0%, rgba(116, 160, 214, .13) 46%, transparent 74%)'
    );
  });

  it('restores the reference window edge as a non-layout crystalline frame', () => {
    expect(stylesheet).toContain('body[data-window="settings"] .app-shell.settings-center-shell::after');
    expect(stylesheet).toContain('rgba(132, 161, 195, .53) 0 2px');
    expect(stylesheet).toContain('border-color: rgba(110, 141, 180, .43);');
    expect(stylesheet).toContain('pointer-events: none;');
  });

  it('matches the reference base chroma and quiet card translucency in both themes', () => {
    expect(stylesheet).toContain('linear-gradient(100deg, #e2e9f6 0%, #e3eaf6 64%, #e4ebf7 100%)');
    expect(stylesheet).toContain(
      'radial-gradient(ellipse 25% 54% at 0 100%, rgba(116, 160, 214, .215) 0%, rgba(116, 160, 214, .13) 46%, transparent 74%)'
    );
    expect(stylesheet).toContain('rgba(36, 37, 40, .33)');
    expect(stylesheet).toContain('rgba(31, 31, 34, .32)');
  });

  it('keeps the reference rail translucent and the dark work pane lifted above the star field', () => {
    expect(stylesheet).toContain('rgba(255, 255, 255, .30) 0%, rgba(252, 254, 255, .30) 30%');
    expect(stylesheet).toContain('rgba(248, 251, 255, .34) 72%');
    expect(stylesheet).toContain('rgba(239, 246, 253, .08) 100%');
    expect(stylesheet).toContain('rgba(10, 18, 31, .24) 0, rgba(6, 13, 24, .30) 45%');
    expect(stylesheet).toContain('rgba(4, 10, 18, .20) 100%');
  });

  it('lets the light rail dissolve back into the reference base at its lower edge', () => {
    expect(stylesheet).toContain('rgba(239, 246, 253, .08) 100%');
  });

  it('uses the reference dark base chroma beneath the translucent panes', () => {
    expect(stylesheet).toContain('linear-gradient(100deg, #010613 0%, #00050f 58%, #00030d 100%)');
  });

  it('keeps the dark work pane neutral enough for the reference black glass finish', () => {
    expect(stylesheet).toContain(
      'linear-gradient(180deg, rgba(10, 18, 31, .24) 0, rgba(6, 13, 24, .30) 45%, rgba(4, 10, 18, .20) 100%)'
    );
  });

  it('uses the reference light constellation coordinates and luminous material', () => {
    expect(constellationSource).toContain('M152 434L238 440L203 620L146 647L191 688L114 703L58 743');
    expect(constellationSource).toContain('M80 510L57 549L114 599L146 647');
    expect(constellationSource).toContain('M114 694L116 701L123 703L116 705L114 712');
    expect(constellationSource).not.toContain('cx="84" cy="698"');
    expect(constellationSource).not.toContain('cx="222" cy="699"');
    expect(constellationSource).toContain('stroke-width="0.72" opacity="0.28"');
    expect(constellationSource).toContain('stroke-width="0.66" opacity="0.27"');
    expect(stylesheet).toContain('--wb-constellation-color: rgba(255, 255, 255, 1);');
    expect(stylesheet).toContain('--wb-constellation-opacity: 1;');
  });

  it('uses a dark reference constellation mask instead of reusing the light field', () => {
    expect(darkConstellationSource).toContain('M187 421');
    expect(darkConstellationSource).toContain('M73 520L99 594L68 615L125 644L176 652L225 619');
    expect(darkConstellationSource).toContain('M84 698');
    expect(stylesheet).toContain("mask-image: url('../assets/workbench-constellation-dark.svg')");
    expect(stylesheet).toContain("-webkit-mask-image: url('../assets/workbench-constellation-dark.svg')");
  });

  it('keeps the new-chat glass shadow quiet enough for the fused sidebar background', () => {
    expect(stylesheet).toContain('box-shadow: 0 8px 20px rgba(76, 103, 144, .018), inset 0 1px 0 rgba(255, 255, 255, .52);');
  });

  it('keeps the shared work view reference inset and continuous inner frame', () => {
    const selector = 'body[data-window="settings"] .settings-center-shell > .wb-shell[data-workbench="shell"][data-workbench-mode="workbench"] > .wb-main-grid {';
    const calibrationStart = stylesheet.indexOf('/* Match the reference\'s quiet one-pixel inner frame');
    const ruleStart = stylesheet.indexOf(selector, calibrationStart);
    const sharedWorkViewRule = ruleStart >= 0 ? stylesheet.slice(ruleStart, stylesheet.indexOf('}', ruleStart)) : '';

    expect(ruleStart).toBeGreaterThanOrEqual(0);
    expect(sharedWorkViewRule).toContain('grid-template-columns: minmax(0, 1fr) var(--wb-right-rail-width);');
    expect(sharedWorkViewRule).toContain('gap: 0;');
    expect(sharedWorkViewRule).toContain('padding: 1px;');
    expect(sharedWorkViewRule).toContain('box-sizing: border-box;');
  });

  it('adds only a non-layout light inner highlight at the work-view left edge', () => {
    expect(stylesheet).toContain('box-shadow: inset 1px 0 0 rgba(255, 255, 255, .80);');
  });

  it('keeps the right rail divider cool and translucent like the reference glass seam', () => {
    expect(stylesheet).toContain('border-left-color: rgba(151, 166, 212, .24);');
  });

  it('fuses the settings titlebar with the left navigation base while preserving the content window frame', () => {
    const settingsTitlebarRule = stylesheet.match(
      /body\[data-window="settings"\] \.settings-center-shell > \.wb-shell\[data-workbench="shell"\]\[data-workbench-mode="settings"\] > \.wb-topbar \{([^}]*)\}/s
    )?.[1];

    expect(settingsTitlebarRule).toBeDefined();
    expect(settingsTitlebarRule ?? '').toContain('border-bottom-color: transparent;');
  });

  it('uses the same two-layer outer geometry and work-view header layout on the settings route', () => {
    const settingsShellRule = stylesheet.match(
      /body\[data-window="settings"\] \.settings-center-shell > \.wb-shell\[data-workbench="shell"\]\[data-workbench-mode="settings"\] \{([^}]*)\}/s
    )?.[1] ?? '';
    const settingsWorkViewRule = stylesheet.match(
      /body\[data-window="settings"\] \.settings-center-shell > \.wb-shell\[data-workbench="shell"\]\[data-workbench-mode="settings"\] > \.wb-main-grid \{([^}]*)\}/s
    )?.[1] ?? '';
    const settingsToolbarRule = stylesheet.match(
      /body\[data-window="settings"\] \.settings-center-shell > \.wb-shell\[data-workbench="shell"\]\[data-workbench-mode="settings"\] \.wb-center-toolbar \{([^}]*)\}/s
    )?.[1] ?? '';
    const settingsTitleRule = stylesheet.match(
      /body\[data-window="settings"\] \.settings-center-shell > \.wb-shell\[data-workbench="shell"\]\[data-workbench-mode="settings"\] \.wb-center-title \{([^}]*)\}/s
    )?.[1] ?? '';

    expect(settingsShellRule).toContain('padding: 0 0 14px;');
    expect(settingsWorkViewRule).toContain('width: calc(100% - 15px);');
    expect(settingsWorkViewRule).toContain('justify-self: start;');
    expect(settingsToolbarRule).toContain('flex-basis: 64px;');
    expect(settingsToolbarRule).toContain('padding-left: 27px;');
    expect(settingsTitleRule).toContain('gap: 14px;');
  });

  it('shares the main work-view glass and top chrome on the settings route', () => {
    const settingsBrandRule = stylesheet.match(
      /body\[data-window="settings"\] \.settings-center-shell > \.wb-shell\[data-workbench="shell"\]\[data-workbench-mode="settings"\] \.wb-brand-lockup \{([^}]*)\}/s
    )?.[1] ?? '';
    const settingsToggleRule = stylesheet.match(
      /body\[data-window="settings"\] \.settings-center-shell > \.wb-shell\[data-workbench="shell"\]\[data-workbench-mode="settings"\] \.wb-sidebar-toggle \{([^}]*)\}/s
    )?.[1] ?? '';
    const lightSettingsCenterRule = Array.from(stylesheet.matchAll(
      /html\[data-theme="light"\] body\[data-window="settings"\] \.settings-center-shell > \.wb-shell\[data-workbench="shell"\]\[data-workbench-mode="settings"\] > \.wb-main-grid > \.wb-center \{([^}]*)\}/gs
    ), (match) => match[1]).join('\n');
    const darkSettingsCenterRule = Array.from(stylesheet.matchAll(
      /html\[data-theme="dark"\] body\[data-window="settings"\] \.settings-center-shell > \.wb-shell\[data-workbench="shell"\]\[data-workbench-mode="settings"\] > \.wb-main-grid > \.wb-center \{([^}]*)\}/gs
    ), (match) => match[1]).join('\n');

    expect(settingsBrandRule).toContain('transform: translateY(8px);');
    expect(settingsToggleRule).toContain('margin-left: 37px;');
    expect(lightSettingsCenterRule).toContain('rgba(255, 255, 255, .68)');
    expect(lightSettingsCenterRule).toContain('border-left-color: rgba(255, 255, 255, .72);');
    expect(darkSettingsCenterRule).toContain('rgba(8, 18, 32, .42)');
    expect(stylesheet).toContain('html[data-theme="light"] body[data-window="settings"] .settings-center-shell > .wb-shell[data-workbench="shell"][data-workbench-mode="settings"] > .wb-sidebar');
  });
});
