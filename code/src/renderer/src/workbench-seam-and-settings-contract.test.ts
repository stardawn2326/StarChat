import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = import.meta.dirname;
const workbench = readFileSync(resolve(root, 'AgentWorkbench.tsx'), 'utf8');
const referenceCss = readFileSync(resolve(root, 'workbench/reference.css'), 'utf8');
const settingsCss = readFileSync(resolve(root, 'settings-center.css'), 'utf8');

describe('workbench concept frame ownership and Codex settings replacement', () => {
  it('does not keep the right rail or bottom panel mounted in settings mode', () => {
    expect(workbench).toContain("activePage === null ? <RightRail");
    expect(workbench).toContain("activePage === null ? <BottomPanel");
    expect(workbench).toContain("data-settings-workspace={activePage === null ? undefined : 'replacement'}");
  });

  it('keeps a transparent workspace underlay while every concept panel owns exactly one complete frame', () => {
    expect(referenceCss).toContain('Concept frame parity lock');
    expect(referenceCss).toMatch(/\.wb-main-grid\s*\{[\s\S]*?background:\s*transparent\s*!important/);
    expect(referenceCss).toMatch(/:where\(\.wb-center, \.wb-right-rail, \.wb-bottom-panel\)[\s\S]*?border:\s*1px solid var\(--wb-border-frame\)\s*!important/);
    expect(referenceCss).toMatch(/:where\(\.wb-center, \.wb-right-rail, \.wb-bottom-panel\)[\s\S]*?border-radius:\s*calc\(14px \* var\(--wb-reference-scale\)\)\s*!important/);
    expect(referenceCss).toMatch(/\.wb-center-frame\s*\{[\s\S]*?border:\s*0\s*!important/);
    expect(referenceCss).not.toContain('border-left: 1px solid var(--wb-border-frame) !important;');
    expect(referenceCss).not.toContain('border-top: 1px solid var(--wb-border-frame) !important;');
    expect(referenceCss).toMatch(/\.wb-sidebar-footer\s*\{[\s\S]*?border-top:\s*0\s*!important/);
  });

  it('uses a compact settings workspace with one detail surface', () => {
    expect(settingsCss).toContain('Codex replacement settings workspace');
    expect(settingsCss).toMatch(/\[data-workbench-mode="settings"\][\s\S]*?--wb-right-rail-width:\s*0px/);
    expect(settingsCss).toMatch(/\.wb-settings-nav-item\s*\{[\s\S]*?min-height:\s*34px/);
  });
});
