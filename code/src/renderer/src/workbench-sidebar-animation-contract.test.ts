import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const rendererDirectory = resolve(import.meta.dirname);
const workbenchSource = readFileSync(resolve(rendererDirectory, 'AgentWorkbench.tsx'), 'utf8');
const workbenchStyles = readFileSync(resolve(rendererDirectory, 'workbench/workbench.css'), 'utf8');

describe('Codex sidebar animation contract from the new reference video', () => {
  it('declares the measured reference timing and width curve before implementation', () => {
    expect(workbenchStyles).toContain('new reference video');
    expect(workbenchStyles).toContain('collapse frames 146-156');
    expect(workbenchStyles).toContain('expand frames 169-180');
    expect(workbenchStyles).toContain('360ms');
    expect(workbenchStyles).toContain('cubic-bezier(.48, .38, .2, .98)');
    expect(workbenchStyles).toContain('--wb-sidebar-open-width: 280px');
    expect(workbenchStyles).toContain('--wb-sidebar-closed-width: 8px');
    expect(workbenchStyles).toContain('grid-template-columns: var(--wb-sidebar-width) minmax(0, 1fr)');
  });

  it('exposes an accessible toggle that remains safe under repeated clicks', () => {
    expect(workbenchSource).toContain('aria-expanded');
    expect(workbenchSource).toContain('aria-controls="workbench-sidebar"');
    expect(workbenchSource).toContain('aria-controls="workbench-right-rail"');
    expect(workbenchSource).toContain('aria-controls="workbench-bottom-panel"');
    expect(workbenchSource).toContain('data-sidebar-state');
    expect(workbenchSource).toContain('data-right-rail-state');
    expect(workbenchSource).toContain('data-bottom-panel');
    expect(workbenchSource).toContain('收起受控验证日志');
    expect(workbenchSource).toContain('展开受控验证日志');
    expect(workbenchSource).toContain('const next = !sidebarCollapsed');
    expect(workbenchSource).toContain('setSidebarCollapsed(next)');
    expect(workbenchSource).toContain('persistLayout({ sidebarCollapsed: next })');
    expect(workbenchSource).toContain('const next = !rightRailCollapsed');
    expect(workbenchSource).toContain('setRightRailCollapsed(next)');
    expect(workbenchSource).toContain('persistLayout({ rightRailCollapsed: next })');
    expect(workbenchSource).toContain('onToggleBottomPanel');
    expect(workbenchSource).toContain('workbench-sidebar');
    expect(workbenchSource).toContain('workbench-right-rail');
    expect(workbenchSource).toContain('workbench-bottom-panel');
    expect(workbenchSource).toContain('focus()');
  });

  it('keeps the layout synchronized and supports reduced motion', () => {
    expect(workbenchStyles).toContain("@property --wb-sidebar-width");
    expect(workbenchStyles).toContain('transition: --wb-sidebar-width 360ms cubic-bezier(.48, .38, .2, .98)');
    expect(workbenchStyles).toContain('transition: opacity 120ms ease, transform 360ms cubic-bezier(.48, .38, .2, .98)');
    expect(workbenchStyles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(workbenchStyles).toContain('transition-duration: 0ms');
    expect(workbenchStyles).toContain('data-sidebar-state="collapsed"');
    expect(workbenchStyles).toContain('--wb-right-rail-width: 354px');
    expect(workbenchStyles).toContain('--wb-right-rail-width: 0px');
    expect(workbenchStyles).toContain('transition: --wb-right-rail-width 360ms cubic-bezier(.48, .38, .2, .98)');
    expect(workbenchStyles).toContain('data-right-rail-state="collapsed"');
    expect(workbenchStyles).toContain('--wb-bottom-panel-height: 174px');
    expect(workbenchStyles).toContain('data-bottom-panel="closed"');
  });

  it('fully removes the bottom drawer track when it is folded', () => {
    expect(workbenchStyles).toContain('--wb-bottom-panel-height: 0px');
    expect(workbenchSource).toContain('aria-hidden={!open}');
    expect(workbenchSource).toContain('tabIndex={open ? 0 : -1}');

    const closedPanelRule = workbenchStyles.match(
      /\.wb-shell\[data-workbench-mode="workbench"\]\[data-bottom-panel="closed"\]\s*>\s*\.wb-bottom-panel\s*\{([^}]*)\}/s
    )?.[1];

    expect(closedPanelRule).toContain('border-width: 0');
    expect(closedPanelRule).toContain('opacity: 0');
    expect(closedPanelRule).toContain('pointer-events: none');
    expect(closedPanelRule).toContain('visibility: hidden');
  });

  it('lets the restored bottom-panel preference drive the rendered grid track', () => {
    const effectiveShellRule = Array.from(
      workbenchStyles.matchAll(
        /^body\[data-window="settings"\] \.settings-center-shell > \.wb-shell\[data-workbench="shell"\]\[data-workbench-mode="workbench"\]\s*\{([^}]*)\}/gms
      )
    ).at(-1)?.[1];

    expect(effectiveShellRule).toContain(
      '--wb-bottom-panel-height: var(--wb-bottom-panel-open-height);'
    );
    expect(effectiveShellRule).toContain(
      'grid-template-rows: 55px minmax(500px, 1fr) var(--wb-bottom-panel-height);'
    );
  });
});
