import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const rendererDirectory = resolve(import.meta.dirname);
const consoleSource = readFileSync(resolve(rendererDirectory, 'AgentConsole.tsx'), 'utf8');
const workbenchSource = readFileSync(resolve(rendererDirectory, 'AgentWorkbench.tsx'), 'utf8');
const chatSource = readFileSync(resolve(rendererDirectory, 'CompanionChat.tsx'), 'utf8');
const referenceStyles = readFileSync(resolve(rendererDirectory, 'workbench/reference.css'), 'utf8');

describe('StarChat concept pixel contract', () => {
  it('keeps topbar and sidebar on the same uninterrupted global canvas', () => {
    const index = referenceStyles.indexOf('Continuous chrome canvas');
    expect(index).toBeGreaterThan(referenceStyles.indexOf('Concept single-layer material lock'));
    const chromeEnd = referenceStyles.indexOf('/* Reading scale and transient surfaces', index);
    expect(chromeEnd).toBeGreaterThan(index);
    const chrome = referenceStyles.slice(index, chromeEnd);
    expect(chrome).toMatch(/\.wb-topbar\s*\{[^}]*background: transparent !important;/s);
    expect(chrome).toContain("background: url('../assets/workbench-constellation.svg') left top / 100% 100% no-repeat transparent !important;");
    expect(chrome).toContain("background: url('../assets/workbench-constellation-dark.svg') left top / 100% 100% no-repeat transparent !important;");
    expect(chrome).toMatch(/:is\(\.wb-topbar, \.wb-sidebar\)\s*\{[^}]*-webkit-backdrop-filter: none !important;[^}]*backdrop-filter: none !important;/s);
    expect(chrome).not.toContain('linear-gradient');
  });

  it('uses the light concept as the sole geometry master for both themes', () => {
    const darkThemeBlocks = [...referenceStyles.matchAll(/html\[data-theme="dark"\][^{]*\{([^}]*)\}/gs)];
    const forbiddenGeometry = /^\s*(?:transform|translate|top|right|bottom|left|margin(?:-[\w-]+)?|padding(?:-[\w-]+)?|width|height|grid-template-[\w-]+)\s*:/m;

    expect(darkThemeBlocks.length).toBeGreaterThan(0);
    for (const [, declarations] of darkThemeBlocks) {
      expect(declarations).not.toMatch(forbiddenGeometry);
    }
  });

  it('keeps a final theme-specific center material lock after the frame parity rules', () => {
    const frameLockIndex = referenceStyles.indexOf('Concept frame parity lock');
    const materialLockIndex = referenceStyles.indexOf('Concept center material lock');

    expect(frameLockIndex).toBeGreaterThan(-1);
    expect(materialLockIndex).toBeGreaterThan(frameLockIndex);
    expect(referenceStyles).toContain('--wb-center-material: linear-gradient(180deg, #edf1fa 0%, #e5edf8 100%);');
    expect(referenceStyles).toContain('--wb-center-material: linear-gradient(180deg, #030a16 0%, #010713 100%);');
    expect(referenceStyles).toContain('--wb-border-frame: rgba(146, 176, 211, .24);');
    expect(referenceStyles).toContain('--wb-border-frame: rgba(147, 169, 200, .13);');
    expect(referenceStyles).toMatch(/\.wb-center\s*\{[^}]*background:\s*var\(--wb-center-material\) !important;/s);
  });

  it('renders every structural region as one surface with one frame', () => {
    const singleLayerIndex = referenceStyles.indexOf('Concept single-layer material lock');
    const centerMaterialIndex = referenceStyles.indexOf('Concept center material lock');
    const finalLayer = referenceStyles.slice(singleLayerIndex);

    expect(singleLayerIndex).toBeGreaterThan(centerMaterialIndex);
    expect(finalLayer).not.toMatch(/:where\([^)]*::/);
    expect(finalLayer).toMatch(/:is\(\.wb-center, \.wb-sidebar\)::before,[\s\S]*:is\(\.wb-topbar, \.wb-sidebar, \.wb-right-rail, \.wb-bottom-panel\)::after\s*\{[^}]*display:\s*none !important;[^}]*content:\s*none !important;/s);
    expect(finalLayer).toMatch(/\.wb-center-frame::before\s*\{[^}]*display:\s*none !important;[^}]*content:\s*none !important;/s);
    expect(finalLayer).toMatch(/:where\(\.wb-main-grid, \.wb-center-frame, \.wb-center-scroll, \.wb-center-content\)\s*\{[^}]*background:\s*transparent !important;[^}]*border:\s*0 !important;[^}]*box-shadow:\s*none !important;/s);
    expect(finalLayer).toMatch(/:where\(\.wb-center, \.wb-right-rail, \.wb-bottom-panel\)\s*\{[^}]*border:\s*1px solid var\(--wb-border-frame\) !important;[^}]*box-shadow:\s*none !important;/s);
    expect(finalLayer).toContain('inset 0 0 0 1px var(--wb-frame-inner-rim)');
  });

  it('locks the concept typography and transient-layer proportions after material calibration', () => {
    expect(referenceStyles).toContain('Concept pixel parity lock.');
    expect(referenceStyles).toContain('--wb-parity-title-size: 20px;');
    // The reference fits 18 CJK glyphs in a ~300px paragraph measure.
    expect(referenceStyles).toContain('--wb-parity-body-size: 16.5px;');
    expect(referenceStyles).toContain('--wb-parity-label-size: 18px;');
    expect(referenceStyles).toContain('max-width: calc(330px * var(--wb-reference-scale));');
    expect(referenceStyles).toContain('height: calc(379px * var(--wb-reference-scale));');
    expect(referenceStyles).toContain('--wb-text-main: #07134f;');
    expect(referenceStyles).toContain('--wb-text-main: #e5e8ee;');
  });

  it('separates execution steps from the response summary at the concept divider', () => {
    expect(consoleSource).toContain('className="wb-trajectory-steps"');
    expect(consoleSource).toContain('className="wb-trajectory-response"');
    expect(referenceStyles).toMatch(/\.wb-trajectory-steps\s*\{[^}]*border-bottom:\s*1px solid var\(--wb-border-divider\)/s);
    expect(referenceStyles).toMatch(/\.wb-trajectory-response\s*\{[^}]*min-height:\s*calc\(145px \* var\(--wb-reference-scale\)\)/s);
  });

  it('locks the calibrated dialogue and composer frame to the concept coordinates', () => {
    expect(referenceStyles).toContain('grid-template-columns: var(--wb-character-width) calc(9px * var(--wb-reference-scale)) minmax(calc(470px * var(--wb-reference-scale)), 1fr);');
    expect(referenceStyles).toContain('padding: calc(18px * var(--wb-reference-scale)) calc(19px * var(--wb-reference-scale)) calc(14px * var(--wb-reference-scale)) calc(18px * var(--wb-reference-scale));');
    expect(referenceStyles).toContain('top: calc(4px * var(--wb-reference-scale));');
  });

  it('pins the concept right edge without stealing width from the center frame', () => {
    expect(workbenchSource).toContain('rightRailWidth: 352');
    expect(workbenchSource).toContain("'--wb-frame-right-inset': scaleLength(16)");
    expect(referenceStyles).toContain('padding: calc(17px * var(--wb-reference-scale)) calc(21px * var(--wb-reference-scale)) 0;');
    expect(referenceStyles).not.toContain('padding-left: calc(16px * var(--wb-reference-scale));');
  });

  it('assigns each visible region to an explicit Agent responsibility', () => {
    for (const domain of ['sessions', 'presentation', 'execution']) {
      expect(`${consoleSource}\n${workbenchSource}`).toContain(`data-agent-domain="${domain}"`);
    }
    for (const domain of ['workspace-read', 'git-read', 'agent-control', 'verification', 'conversation', 'browser-safe']) {
      expect(workbenchSource).toContain(`domain="${domain}"`);
    }
  });

  it('keeps every concept composer control visible in the reference fixture', () => {
    expect(chatSource).toContain('data-agent-composer-control="approval"');
    expect(chatSource).toContain('帮我批准');
    expect(referenceStyles).toMatch(/\.agent-composer\.is-reference-fixture[^}]*\.agent-composer-control\[data-agent-composer-control="temperature"\][^{]*\{[^}]*display:\s*inline-flex/s);
  });

  it('keeps the pet action while leaving window minimization in the top chrome', () => {
    expect(consoleSource).toContain('弹出为桌宠');
    expect(consoleSource).toContain('onClick={onShowPet}');
    expect(consoleSource).toContain('data-workbench="pet-action"');
    expect(consoleSource).not.toContain('window.starchat.app.minimize()');
    expect((consoleSource.match(/className="wb-character-action"/g) ?? []).length).toBe(1);
    expect(referenceStyles).toMatch(/\.wb-character-actions\s*\{[^}]*top:\s*calc\(4px \* var\(--wb-reference-scale\)\);[^}]*right:\s*calc\(14px \* var\(--wb-reference-scale\)\)/s);
    expect(referenceStyles).toMatch(/\.wb-character-action\s*\{[^}]*padding:\s*calc\(10px \* var\(--wb-reference-scale\)\) calc\(12px \* var\(--wb-reference-scale\)\);[^}]*font-size:\s*calc\(14px \* var\(--wb-reference-scale\)\)/s);
    expect(referenceStyles).toMatch(/\.wb-character-action:first-child\s*\{[^}]*padding-inline:\s*calc\(18px \* var\(--wb-reference-scale\)\)/s);
    expect(referenceStyles).toMatch(/\.wb-character-action:last-child\s*\{[^}]*padding-inline:\s*calc\(9px \* var\(--wb-reference-scale\)\)/s);
  });

  it('aligns the right-rail add affordance and separator with the concept header', () => {
    expect(referenceStyles).toMatch(/\.wb-rail-topline > \.wb-icon-button\s*\{[^}]*top:\s*calc\(-5px \* var\(--wb-reference-scale\)\);[^}]*left:\s*calc\(-6px \* var\(--wb-reference-scale\)\)/s);
    expect(referenceStyles).toMatch(/\.wb-rail-topline::after\s*\{[^}]*top:\s*calc\(44px \* var\(--wb-reference-scale\)\)/s);
  });
});
