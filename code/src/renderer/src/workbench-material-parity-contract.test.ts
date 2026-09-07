import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const rendererDirectory = resolve(import.meta.dirname);
const referenceStylesheet = readFileSync(resolve(rendererDirectory, 'workbench/reference.css'), 'utf8');

describe('StarChat concept material parity contract', () => {
  it('finishes with one shared four-level material hierarchy for every visible frame', () => {
    const hierarchyIndex = referenceStylesheet.indexOf('Concept unified material hierarchy.');
    const hierarchy = referenceStylesheet.slice(hierarchyIndex);

    expect(hierarchyIndex).toBeGreaterThan(referenceStylesheet.indexOf('Final concept frame ownership.'));
    for (const token of [
      '--wb-frame-surface',
      '--wb-stage-surface',
      '--wb-card-surface',
      '--wb-overlay-surface',
      '--wb-frame-rim-top',
      '--wb-frame-rim-side',
      '--wb-frame-rim-bottom',
      '--wb-frame-rim-neutral',
      '--wb-center-outer-rim',
      '--wb-center-inner-rim',
      '--wb-frame-inner-rim',
      '--wb-frame-inner-rim-soft',
      '--wb-control-surface',
      '--wb-control-rim',
      '--wb-active-surface',
      '--wb-active-rim',
      '--wb-card-shadow',
      '--wb-overlay-shadow'
    ]) {
      expect(hierarchy).toContain(token);
    }
    expect(hierarchy).toMatch(/:is\(\.wb-center, \.wb-right-rail, \.wb-bottom-panel\)[\s\S]*background: var\(--wb-frame-surface\) !important;/);
    expect(hierarchy).toMatch(/:is\(\.wb-character-panel, \.agent-composer, \.wb-new-chat\)[\s\S]*border-top-color: var\(--wb-frame-rim-top\) !important;/);
    expect(hierarchy).toMatch(/\.wb-tool-card[\s\S]*background: var\(--wb-card-surface\) !important;/);
    expect(hierarchy).toMatch(/\.wb-environment-popover-reference[\s\S]*background: var\(--wb-overlay-surface\) !important;/);
    expect(hierarchy).toContain(':is(.agent-attachment-slot, .agent-composer-control[data-agent-composer-control="approval"], .agent-composer-control.is-context, .wb-character-action, .wb-terminal-tab)');
    expect(hierarchy).toContain(':is(.wb-session-select[aria-current="page"], .wb-terminal-tab.is-active, .wb-icon-button[data-workbench="environment-trigger"][aria-expanded="true"])');
    expect(hierarchy).toMatch(/\.wb-center\s*\{[^}]*border-right-color: var\(--wb-frame-rim-neutral\) !important;[^}]*box-shadow: 0 0 0 1px var\(--wb-center-outer-rim\), inset 0 0 0 1px var\(--wb-frame-inner-rim\), inset 0 0 0 2px var\(--wb-frame-inner-rim-soft\) !important;/s);
    expect(hierarchy).toMatch(/html\[data-theme="light"\][^{]*\.wb-center\s*\{[^}]*box-shadow: 0 0 0 1px var\(--wb-center-outer-rim\), inset 0 0 0 1px var\(--wb-center-inner-rim\)/s);
    expect(hierarchy).toMatch(/html\[data-theme="dark"\][^{]*\.wb-center\s*\{[^}]*box-shadow: 0 0 0 1px var\(--wb-center-outer-rim\), inset 0 0 0 1px var\(--wb-center-inner-rim\) !important;/s);
    expect(hierarchy).toMatch(/\.wb-bottom-panel\s*\{[^}]*box-shadow: inset 0 0 0 1px var\(--wb-frame-inner-rim\) !important;/s);
    expect(hierarchy).toContain('inset 0 0 0 2px var(--wb-frame-inner-rim-soft)');
  });

  it('owns the final acrylic depth stack without changing concept geometry', () => {
    expect(referenceStylesheet).toContain('Concept material calibration lock.');
    expect(referenceStylesheet).toContain('--wb-acrylic-navigation-blur: 18px;');
    expect(referenceStylesheet).toContain('--wb-acrylic-panel-blur: 16px;');
    expect(referenceStylesheet).toContain('--wb-acrylic-card-blur: 12px;');
    expect(referenceStylesheet).toContain('--wb-acrylic-overlay-blur: 22px;');
    expect(referenceStylesheet).toContain('backdrop-filter: blur(var(--wb-acrylic-panel-blur)) saturate(112%);');
    expect(referenceStylesheet).toContain('backdrop-filter: blur(var(--wb-acrylic-card-blur)) saturate(108%);');
    expect(referenceStylesheet).toContain('backdrop-filter: blur(var(--wb-acrylic-overlay-blur)) saturate(118%);');
    expect(referenceStylesheet).toContain('inset 0 1px 0 var(--wb-acrylic-highlight)');
  });

  it('keeps the center, rail and terminal corners independent at the lower seam', () => {
    const seamIndex = referenceStylesheet.indexOf("Preserve the concept's three independent lower corners.");
    const seam = referenceStylesheet.slice(seamIndex);

    expect(seamIndex).toBeGreaterThan(referenceStylesheet.indexOf('Concept unified material hierarchy.'));
    expect(seam).toMatch(/\.wb-main-grid\s*\{[^}]*z-index:\s*1;[^}]*overflow:\s*visible !important;/s);
    expect(seam).toMatch(/:is\(\.wb-center, \.wb-right-rail\)\s*\{[^}]*z-index:\s*1;[^}]*overflow:\s*hidden !important;/s);
    expect(seam).toMatch(/\.wb-bottom-panel\s*\{[^}]*z-index:\s*0;/s);
  });

  it('keeps a visible celestial field and a layered acrylic card surface in both themes', () => {
    expect(referenceStylesheet).toContain('--wb-starfield-color: rgba(255, 255, 255, .82);');
    expect(referenceStylesheet).toContain('--wb-starfield-color: rgba(219, 235, 255, .98);');
    expect(referenceStylesheet).toContain('--wb-starfield-opacity: .32 !important;');
    expect(referenceStylesheet).toContain('--wb-starfield-opacity: .86 !important;');
    expect(referenceStylesheet).toContain('--wb-character-starfield-opacity: .62;');
    expect(referenceStylesheet).toContain('--wb-character-starfield-opacity: .92;');
    expect(referenceStylesheet).toContain('--wb-center-starfield-opacity: .16;');
    expect(referenceStylesheet).toContain('--wb-center-starfield-opacity: .22;');
    expect(referenceStylesheet).toContain('--wb-chrome-starfield-opacity: .24;');
    expect(referenceStylesheet).toContain('--wb-chrome-starfield-opacity: .58;');
    expect(referenceStylesheet).toContain('--wb-material-content: linear-gradient(180deg, rgba(232, 239, 248, .80) 0%, rgba(222, 233, 246, .70) 100%);');
    expect(referenceStylesheet).toContain('--wb-material-card: linear-gradient(180deg, rgba(255, 255, 255, .86) 0%, rgba(247, 251, 255, .78) 52%, rgba(231, 241, 252, .66) 100%);');
    expect(referenceStylesheet).toContain('--wb-material-card: linear-gradient(180deg, rgba(20, 37, 59, .92) 0%, rgba(7, 18, 35, .88) 100%);');
    expect(referenceStylesheet).toContain('--wb-material-highlight: rgba(255, 255, 255, .64);');
    expect(referenceStylesheet).toContain('--wb-material-highlight: rgba(207, 226, 255, .12);');
  });

  it('uses a translucent navigation gradient so the field remains visible instead of a flat opaque fill', () => {
    expect(referenceStylesheet).toContain('background: url(\'../assets/workbench-constellation.svg\') left top / 100% 100% no-repeat, linear-gradient(180deg, rgba(232, 240, 250, .54) 0%, rgba(218, 230, 244, .46) 100%) !important;');
    expect(referenceStylesheet).toContain('background: linear-gradient(180deg, rgba(247, 251, 255, .72) 0%, rgba(229, 240, 252, .58) 100%) !important;');
    expect(referenceStylesheet).toContain('background: url(\'../assets/workbench-constellation-dark.svg\') left top / 100% 100% no-repeat, linear-gradient(180deg, rgba(2, 10, 25, .72) 0%, rgba(0, 3, 11, .82) 100%) !important;');
    expect(referenceStylesheet).toContain('box-shadow: inset 0 1px 0 var(--wb-material-highlight), 0 12px 28px var(--wb-material-shadow);');
    expect(referenceStylesheet).toContain('.wb-topbar::after');
    expect(referenceStylesheet).toContain('.wb-sidebar::before');
    expect(referenceStylesheet).toContain('.wb-right-rail::after');
    expect(referenceStylesheet).toContain('.wb-bottom-panel::after');
    expect(referenceStylesheet).toContain("background: url('../assets/workbench-celestial-field.svg') center / 100% 100% no-repeat;");
    expect(referenceStylesheet).toContain('.wb-sidebar::after');
    expect(referenceStylesheet).toContain('radial-gradient(ellipse');
    expect(referenceStylesheet).toContain('background: linear-gradient(180deg, rgba(255, 255, 255, .15) 0%, rgba(255, 255, 255, .18) 100%), var(--wb-surface-bottom) !important;');
    expect(referenceStylesheet).toContain('background: linear-gradient(180deg, rgba(0, 3, 10, .30) 0%, rgba(0, 2, 8, .42) 100%), var(--wb-surface-bottom) !important;');
  });

  it('defines an independent acrylic material stack for the single-sidebar settings route', () => {
    expect(referenceStylesheet).toContain('--wb-settings-content-surface: linear-gradient(180deg, rgba(232, 239, 248, .82) 0%, rgba(218, 231, 246, .72) 100%);');
    expect(referenceStylesheet).toContain('--wb-settings-navigation-surface: linear-gradient(180deg, rgba(247, 251, 255, .72) 0%, rgba(229, 240, 252, .54) 100%);');
    expect(referenceStylesheet).toContain('--wb-settings-card-surface: linear-gradient(180deg, rgba(255, 255, 255, .86) 0%, rgba(245, 250, 255, .74) 100%);');
    expect(referenceStylesheet).toContain('--wb-settings-content-surface: linear-gradient(180deg, rgba(3, 10, 22, .92) 0%, rgba(0, 5, 14, .88) 100%);');
    expect(referenceStylesheet).toContain('--wb-settings-navigation-surface: linear-gradient(180deg, rgba(2, 10, 25, .76) 0%, rgba(0, 3, 11, .86) 100%);');
    expect(referenceStylesheet).toContain('--wb-settings-card-surface: linear-gradient(180deg, rgba(20, 37, 59, .86) 0%, rgba(7, 18, 35, .78) 100%);');
    expect(referenceStylesheet).toContain('background: var(--wb-settings-content-surface) !important;');
    expect(referenceStylesheet).toContain('background: var(--wb-settings-navigation-surface) !important;');
    expect(referenceStylesheet).toContain('background: var(--wb-settings-card-surface) !important;');
    expect(referenceStylesheet).toContain('.wb-shell[data-workbench-visual="reference"][data-workbench-mode="settings"]::before');
    expect(referenceStylesheet).toContain('.wb-shell[data-workbench-visual="reference"][data-workbench-mode="settings"] .wb-sidebar::after');
  });
});
