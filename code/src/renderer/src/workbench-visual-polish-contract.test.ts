import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const rendererDirectory = resolve(import.meta.dirname);
const stylesheet = readFileSync(resolve(rendererDirectory, 'workbench/workbench.css'), 'utf8');
const referenceStylesheet = readFileSync(resolve(rendererDirectory, 'workbench/reference.css'), 'utf8');
const consoleSource = readFileSync(resolve(rendererDirectory, 'AgentConsole.tsx'), 'utf8');
const workbenchSource = readFileSync(resolve(rendererDirectory, 'AgentWorkbench.tsx'), 'utf8');
const chatSource = readFileSync(resolve(rendererDirectory, 'CompanionChat.tsx'), 'utf8');
const screenshotSource = readFileSync(resolve(rendererDirectory, 'WorkbenchScreenshot.tsx'), 'utf8');
const screenshotHelper = readFileSync(resolve(rendererDirectory, '../../../tools/render-workbench-screenshots.mjs'), 'utf8');
const celestialFieldAsset = resolve(rendererDirectory, 'assets/workbench-celestial-field.svg');
const constellationAsset = resolve(rendererDirectory, 'assets/workbench-constellation.svg');
const darkConstellationAsset = resolve(rendererDirectory, 'assets/workbench-constellation-dark.svg');
const constellationSource = readFileSync(constellationAsset, 'utf8');
const darkConstellationSource = readFileSync(darkConstellationAsset, 'utf8');

describe('StarChat final reference polish contract', () => {
  it('keeps typography light and precise at the reference scale', () => {
    expect(stylesheet).toContain('--wb-body-weight: 430;');
    expect(stylesheet).toContain('--wb-heading-weight: 520;');
    expect(stylesheet).toMatch(/\.wb-brand-name\s*\{[^}]*font-size:\s*16px;[^}]*font-weight:\s*520;/s);
    expect(stylesheet).toMatch(/\.wb-tool-card strong\s*\{[^}]*font-size:\s*17px;[^}]*font-weight:\s*500;/s);
    expect(stylesheet).toContain('.wb-terminal-prompt');
    expect(stylesheet).toContain('font: 15px/1.4 Consolas, monospace;');
  });

  it('owns one light-reference celestial composition on the full-window base', () => {
    expect(existsSync(celestialFieldAsset)).toBe(true);
    expect(existsSync(constellationAsset)).toBe(true);
    expect(existsSync(darkConstellationAsset)).toBe(true);
    expect(stylesheet).toContain("url('../assets/workbench-celestial-field.svg')");
    expect(stylesheet).toContain('--wb-starfield-color');
    expect(stylesheet).toContain('--wb-constellation-color');
    const constellationRule = stylesheet.match(/\.wb-shell::after\s*\{(?=[^}]*top:)([^}]*)\}/s)?.[1] ?? '';
    expect(constellationRule).toContain('left: 0;');
    expect(constellationRule).toContain('top: 55px;');
    expect(constellationRule).toContain('width: 280px;');
    expect(constellationRule).toContain('height: calc(100% - 55px);');
    expect(stylesheet).toContain("-webkit-mask: url('../assets/workbench-constellation.svg')");
    expect(stylesheet).toContain('.wb-sidebar::before {');
    expect(stylesheet).toContain('display: none;');
    expect(stylesheet).not.toContain('linear-gradient(153deg, transparent 39.4%');
  });

  it('uses the shared Live2D canvas and keeps the fixture composer structure', () => {
    expect(consoleSource).toContain('Live2DCanvas');
    expect(consoleSource).not.toContain('BAOYIN_CHARACTER_ART');
    expect(stylesheet).toContain('.wb-character-art > .live2d-card {');
    expect(stylesheet).toContain('.wb-trajectory p');
    expect(stylesheet).toContain('max-width: 330px;');
    expect(stylesheet).toContain('.agent-composer {');
    expect(stylesheet).toContain('min-height: 210px;');
    expect(chatSource).toContain('agent-attachment-empty');
    expect(chatSource).toContain('referenceFixture = false');
    expect(chatSource).toContain('agent-attachment-code-preview');
    expect(chatSource).toContain('分销 45秒');
    expect(chatSource).toContain('contextUsageOverride');
    expect(screenshotSource).toContain('contextUsageOverride={32}');
    expect(chatSource).toContain('剩余上下文');
    expect(chatSource).toContain('data-agent-composer-control="temperature"');
  });

  it('keeps character art covering the panel from its top edge', () => {
    expect(stylesheet).toContain('.wb-character-art {');
    expect(stylesheet).toContain('inset: 0;');
    expect(stylesheet).toContain('.wb-character-actions {');
    expect(stylesheet).toContain('top: 8px;');
    expect(stylesheet).toContain('right: 8px;');
    expect(stylesheet).toContain('.live2d-model-clip-layer');
    expect(stylesheet).not.toContain('top: 120px;');
  });

  it('publishes character panel and art rectangles in the real screenshot geometry contract', () => {
    expect(screenshotHelper).toContain('characterPanel:');
    expect(screenshotHelper).toContain('characterArt:');
    expect(screenshotHelper).toContain("characterPanel: '[data-workbench-region=\"character\"]'");
    expect(screenshotHelper).toContain("characterArt: '.wb-character-art'");
  });

  it('keeps the fixture character frame aligned to the shared work-view inset', () => {
    expect(consoleSource).toContain('const referenceCharacterWidth = 332.265625 * referenceScale;');
    expect(stylesheet).toContain('padding: 19px 18px 13px;');
  });

  it('keeps rail and terminal glass layers legible without adding a second frame', () => {
    expect(stylesheet).toContain('.wb-tool-card.is-disabled {');
    expect(stylesheet).toContain('cursor: not-allowed;');
    expect(stylesheet).toContain('.wb-tool-card {');
    expect(stylesheet).toContain('min-height: 174px;');
    expect(stylesheet).toContain('.wb-terminal-tab,');
    expect(stylesheet).toContain('height: 30px;');
    expect(stylesheet).toContain('transition: --wb-sidebar-width 360ms cubic-bezier(.48, .38, .2, .98)');
  });

  it('uses one tokenized crystalline material stack for both themes', () => {
    expect(stylesheet).toContain('--wb-glass-blur: 10px;');
    expect(stylesheet).toContain('--wb-glass-saturation: 110%;');
    expect(stylesheet).toContain('backdrop-filter: blur(var(--wb-glass-blur)) saturate(var(--wb-glass-saturation));');
    expect(stylesheet).toContain('linear-gradient(180deg, rgba(255, 255, 255, .30)');
    expect(stylesheet).toContain('rgba(218, 229, 243, .10)');
    expect(stylesheet).toContain('rgba(205, 219, 237, .12)');
    expect(stylesheet).toContain('backdrop-filter: blur(22px) saturate(125%);');
    expect(stylesheet).toContain('rgba(36, 37, 40, .33)');
    expect(stylesheet).toContain('rgba(31, 31, 34, .32)');
    expect(stylesheet).toContain('linear-gradient(100deg, #e2e9f6 0%, #e3eaf6 64%, #e4ebf7 100%)');
    expect(stylesheet).toContain('linear-gradient(100deg, #010613 0%, #00050f 58%, #00030d 100%)');
    expect(stylesheet).toContain('linear-gradient(180deg, rgba(10, 18, 31, .24) 0, rgba(6, 13, 24, .30) 45%, rgba(4, 10, 18, .20) 100%)');
  });

  it('keeps the light lower-left bloom and theme-specific constellation coordinates', () => {
    expect(stylesheet).toContain('radial-gradient(ellipse 25% 54% at 0 100%, rgba(116, 160, 214, .215) 0%, rgba(116, 160, 214, .13) 46%, transparent 74%)');
    expect(constellationSource).toContain('M152 434L238 440L203 620L146 647L191 688L114 703L58 743');
    expect(constellationSource).toContain('M80 510L57 549L114 599L146 647');
    expect(darkConstellationSource).toContain('M152 434L238 440L203 620L146 647L191 688L114 703L58 743');
    expect(darkConstellationSource).toContain('M80 510L57 549L114 599L146 647');
    expect(stylesheet).toContain("url('../assets/workbench-constellation-dark.svg')");
  });

  it('keeps the dark constellation geometry identical while cooling its ink', () => {
    expect(darkConstellationSource).not.toContain('quiet-night');
    expect(darkConstellationSource).toContain('stroke="#9ab9e7"');
    expect(darkConstellationSource).toContain('fill="#c6dafa"');
    expect(stylesheet).toContain('--wb-constellation-opacity: .72;');
    expect(stylesheet).toContain('--wb-constellation-color: rgba(208, 225, 248, .88);');
  });

  it('removes the three annotated constellation branches in both themes and lifts the dark role material', () => {
    const removedBranches = [
      'M57 549C32 595 48 640 68 676C88 712 103 756 58 743',
      'M-18 650C32 661 62 682 84 698C105 714 128 774 114 914',
      'M203 620C222 610 235 593 247 568'
    ];

    for (const branch of removedBranches) {
      expect(constellationSource).not.toContain(branch);
      expect(darkConstellationSource).not.toContain(branch);
    }

    expect(constellationSource).toContain('M152 434L238 440L203 620L146 647L191 688L114 703L58 743" stroke-width="0.72" opacity="0.24"');
    expect(constellationSource).toContain('M80 510L57 549L114 599L146 647" stroke-width="0.66" opacity="0.23"');
    expect(darkConstellationSource).toContain('M152 434L238 440L203 620L146 647L191 688L114 703L58 743" stroke-width="0.72" opacity="0.16"');
    expect(darkConstellationSource).toContain('M80 510L57 549L114 599L146 647" stroke-width="0.66" opacity="0.15"');
    expect(constellationSource).toContain('M152 425L154.2 431.8L161 434L154.2 436.2L152 443L149.8 436.2L143 434L149.8 431.8Z" opacity="0.86"');
    expect(darkConstellationSource).toContain('M152 425L154.2 431.8L161 434L154.2 436.2L152 443L149.8 436.2L143 434L149.8 431.8Z" opacity="0.67"');

    expect(referenceStylesheet).toContain('filter: brightness(.27) saturate(2.20) contrast(1.08);');
    expect(referenceStylesheet).toContain('filter: brightness(.50) saturate(.92) contrast(1.10);');
    expect(referenceStylesheet).toContain('mask-image: linear-gradient(to bottom, #000 0%, #000 28%, rgba(0, 0, 0, .72) 40%, rgba(0, 0, 0, .30) 54%, rgba(0, 0, 0, .08) 62%, transparent 68%);');
    expect(referenceStylesheet).toContain('rgba(0, 4, 12, .36) 52%, rgba(0, 4, 12, .48) 62%');
  });

  it('gives the character stage a layered atmospheric backdrop in both themes', () => {
    expect(referenceStylesheet).toContain('radial-gradient(ellipse 68% 48% at 50% 30%, rgba(255, 255, 255, .78) 0%, rgba(224, 239, 254, .58) 42%, transparent 74%)');
    expect(referenceStylesheet).toContain('radial-gradient(ellipse 70% 54% at 50% 32%, rgba(91, 126, 174, .30) 0%, rgba(35, 63, 103, .18) 42%, transparent 76%)');
    expect(referenceStylesheet).toContain('--wb-character-starfield-opacity: .30;');
    expect(referenceStylesheet).toContain('--wb-character-starfield-opacity: .50;');
  });

  it('implements the final typography plan with explicit UI/code tokens and semantic tiers', () => {
    expect(referenceStylesheet).toContain('--font-ui: Inter, "SF Pro Text", "PingFang SC", "Microsoft YaHei", sans-serif;');
    expect(referenceStylesheet).toContain('--font-code: "JetBrains Mono", "Cascadia Code", Consolas, monospace;');
    expect(referenceStylesheet).toContain('--font-size-title: 16px;');
    expect(referenceStylesheet).toContain('--font-size-section: 14px;');
    expect(referenceStylesheet).toContain('--font-size-body: 14px;');
    expect(referenceStylesheet).toContain('--font-size-label: 14px;');
    expect(referenceStylesheet).toContain('--font-size-caption: 12px;');
    expect(referenceStylesheet).toContain('--font-size-code: 13px;');
    expect(referenceStylesheet).toContain('--font-weight-regular: 400;');
    expect(referenceStylesheet).toContain('--font-weight-medium: 500;');
    expect(referenceStylesheet).toContain('--font-weight-semibold: 600;');
    expect(referenceStylesheet).toContain('--line-height-body: 1.6;');
    expect(referenceStylesheet).toContain('--line-height-ui: 1.4;');
    expect(referenceStylesheet).toContain('--line-height-code: 1.5;');
    expect(referenceStylesheet).toContain('--text-primary: #203858;');
    expect(referenceStylesheet).toContain('--text-secondary: #5d718c;');
    expect(referenceStylesheet).toContain('--text-tertiary: #7e8fa5;');
    expect(referenceStylesheet).toContain('--text-disabled: #aab7c6;');
    expect(referenceStylesheet).toContain('--text-primary: #edf3fb;');
    expect(referenceStylesheet).toContain('--text-secondary: #a8b4c5;');
    expect(referenceStylesheet).toContain('--text-tertiary: #738197;');
    expect(referenceStylesheet).toContain('--text-disabled: #536173;');
    expect(referenceStylesheet).toContain('font-family: var(--wb-font-ui);');
    expect(referenceStylesheet).toContain('font-family: var(--wb-font-code);');
    expect(referenceStylesheet).toContain('font-size: var(--font-size-title);');
    expect(referenceStylesheet).toContain('font-size: var(--font-size-section);');
    expect(referenceStylesheet).toContain('font-size: var(--font-size-label);');
    expect(referenceStylesheet).toContain('font-size: var(--font-size-body);');
    expect(referenceStylesheet).toContain('font-size: var(--font-size-caption);');
    expect(referenceStylesheet).toContain('font-size: var(--font-size-code);');
    expect(referenceStylesheet).toContain('line-height: var(--line-height-body);');
    expect(referenceStylesheet).toContain('line-height: var(--line-height-ui);');
    expect(referenceStylesheet).toContain('line-height: var(--line-height-code);');
    expect(referenceStylesheet).toContain('--wb-border-divider: rgba(112, 149, 189, .14);');
    expect(referenceStylesheet).toContain('--wb-border-divider: rgba(143, 163, 193, .15);');
    expect(referenceStylesheet).toContain('border-bottom: 1px solid var(--wb-border-divider) !important;');
    expect(referenceStylesheet).toContain('radial-gradient(circle at 50% 38%, rgba(190, 220, 250, .22), transparent 55%)');
    expect(referenceStylesheet).toContain('linear-gradient(to bottom, #eef6ff, #e4eef9)');
    expect(referenceStylesheet).toContain('radial-gradient(circle at 50% 35%, rgba(55, 85, 125, .14), transparent 52%)');
    expect(referenceStylesheet).toContain('linear-gradient(to bottom, #07111f, #050b14)');
    expect(workbenchSource).toContain('className="wb-environment-code"');
    expect(referenceStylesheet).toContain('.wb-environment-code');
    expect(referenceStylesheet).toContain('.wb-terminal-prompt');
  });

  it('gives the work view one semantic border and clips the real shell edge', () => {
    const workViewRule = stylesheet.match(/\.wb-main-grid\s*\{([^}]*)\}/s)?.[1] ?? '';
    expect(workViewRule).toContain('border: 1px solid var(--wb-frame-border);');
    expect(workViewRule).toContain('border-radius: 14px;');
    expect(workViewRule).toContain('overflow: hidden;');
    const centerRule = stylesheet.match(/\.wb-center\s*\{([^}]*)\}/s)?.[1] ?? '';
    expect(centerRule).toContain('border: 0;');
    expect(centerRule).toContain('border-radius: 0;');
    const railRule = stylesheet.match(/\.wb-right-rail\s*\{([^}]*)\}/s)?.[1] ?? '';
    expect(railRule).toContain('border-left: 1px solid var(--wb-divider);');
    expect(stylesheet).toContain('box-sizing: border-box;');
    expect(stylesheet).not.toContain('settings-center-shell::after');
    expect(stylesheet).not.toContain('padding: 1px;');
  });

  it('keeps settings in the shared route while retaining the six-category entry boundary', () => {
    expect(stylesheet).toContain('.wb-shell[data-workbench-mode="settings"]');
    expect(stylesheet).toContain('.wb-settings-sidebar');
    expect(stylesheet).toContain('.wb-settings-nav-item.is-active');
    expect(stylesheet).toContain('html[data-theme="light"] .wb-settings-sidebar');
    expect(stylesheet).toContain('html[data-theme="dark"] .wb-settings-sidebar');
    expect(screenshotSource).toContain("settingsMode ? 'settings' : null");
  });
});
