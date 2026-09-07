import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  WORKBENCH_LAYOUT_STORAGE_KEY,
  defaultWorkbenchLayoutState,
  sanitizeWorkbenchLayoutState
} from './workbench-layout';

const rendererDirectory = resolve(import.meta.dirname);
const workbenchStyles = readFileSync(resolve(rendererDirectory, 'workbench/workbench.css'), 'utf8');
const referenceStyles = readFileSync(resolve(rendererDirectory, 'workbench/reference.css'), 'utf8');
const chatSource = readFileSync(resolve(rendererDirectory, 'CompanionChat.tsx'), 'utf8');
const consoleSource = readFileSync(resolve(rendererDirectory, 'AgentConsole.tsx'), 'utf8');

describe('StarChat workbench structural regression contract', () => {
  it('migrates away from the stale open drawer layout and keeps the tool rail collapsed by default', () => {
    expect(WORKBENCH_LAYOUT_STORAGE_KEY).toBe('starchat.workbench.layout.v4');
    expect(defaultWorkbenchLayoutState({ width: 1920, height: 1200 })).toMatchObject({
      version: 4,
      rightRailCollapsed: true,
      bottomPanelOpen: false,
      bottomPanelHeight: 156
    });
    expect(sanitizeWorkbenchLayoutState({
      version: 2,
      rightRailCollapsed: false,
      bottomPanelOpen: true,
      bottomPanelHeight: 380
    }, { width: 1920, height: 1200 })).toEqual(defaultWorkbenchLayoutState({ width: 1920, height: 1200 }));
  });

  it('keeps the re-expanded tool rail above the lower drawer and fits all six tools without clipping', () => {
    const gridRule = workbenchStyles.match(/\.wb-tool-grid\s*\{([^}]*)\}/s)?.[1] ?? '';
    const cardRule = workbenchStyles.match(/\.wb-tool-card\s*\{([^}]*)\}/s)?.[1] ?? '';
    const mainRule = workbenchStyles.match(/\.wb-main-grid\s*\{([^}]*)\}/s)?.[1] ?? '';
    const bottomRule = workbenchStyles.match(/\.wb-bottom-panel\s*\{([^}]*)\}/s)?.[1] ?? '';
    expect(mainRule).toContain('z-index: 2;');
    expect(bottomRule).toContain('z-index: 1;');
    expect(gridRule).toContain('flex: 1 1 auto;');
    expect(gridRule).toContain('grid-template-rows: repeat(3, 182px);');
    expect(gridRule).toContain('overflow-y: auto;');
    expect(cardRule).toContain('min-height: 0;');
    expect(referenceStyles).toContain('flex: 1 1 auto;');
    expect(referenceStyles).toContain('max-height: calc(688px * var(--wb-reference-scale));');
    expect(referenceStyles).toContain('grid-template-rows: repeat(3, calc(182px * var(--wb-reference-scale)));');
    expect(referenceStyles).not.toContain('flex: 0 0 calc(564px * var(--wb-reference-scale));');
    expect(referenceStyles).not.toContain('repeat(3, calc(174px * var(--wb-reference-scale)))');
  });

  it('lets collapsed panel state drive responsive tracks instead of reserving a hidden drawer', () => {
    expect(workbenchStyles).toMatch(/@media \(max-width: 820px\)[\s\S]*?grid-template-rows:\s*60px minmax\(0, 1fr\) var\(--wb-bottom-panel-height\);/);
    expect(workbenchStyles).toMatch(/@media \(max-width: 1180px\)[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) var\(--wb-right-rail-width\);/);
  });

  it('uses a compact empty composer and only renders approval action when approval is actionable', () => {
    expect(referenceStyles).toContain('.agent-composer:not(:has(.agent-attachment-slot))');
    expect(referenceStyles).toContain('min-height: calc(168px * var(--wb-reference-scale));');
    expect(chatSource).toContain('{waitingForApproval ? <button');
    expect(chatSource).not.toContain('disabled={!waitingForApproval}');
  });

  it('uses a top-anchored half-body placeholder that reveals more as the stage grows', () => {
    expect(consoleSource).toContain("new URL('./assets/baoyin-static-role.png'");
    expect(consoleSource).not.toContain("new URL('./assets/starchat-brand.png'");
    expect(consoleSource).toContain('is-character-placeholder');
    expect(workbenchStyles).not.toContain('height: 122%;');
    expect(workbenchStyles).not.toContain('height: 105%;');
    expect(referenceStyles).not.toContain('.wb-static-role.is-character-placeholder img {');
    expect(referenceStyles).toContain('top: calc(70px * var(--wb-reference-scale));');
    expect(referenceStyles).toContain('height: calc(1200px * var(--wb-reference-scale));');
    expect(referenceStyles).toContain('object-position: center top;');
    expect(referenceStyles).toContain('filter: brightness(.58) saturate(1.42) contrast(1.06);');
  });

  it('uses clearer light surfaces and stronger dark secondary text in the workbench boundary', () => {
    expect(workbenchStyles).toContain('--theme-text: #294563;');
    expect(workbenchStyles).toContain('--theme-muted: #526d8c;');
    expect(workbenchStyles).toContain('--theme-muted: #b8c5d7;');
    expect(workbenchStyles).toContain('--wb-card-surface: linear-gradient(180deg, rgba(255, 255, 255, .58)');
  });
});
