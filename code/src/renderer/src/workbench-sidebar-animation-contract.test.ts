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
    expect(workbenchStyles).toContain('--wb-sidebar-open-width: 266px');
    expect(workbenchStyles).toContain('--wb-sidebar-closed-width: 8px');
    expect(workbenchStyles).toContain('grid-template-columns: var(--wb-sidebar-width) minmax(0, 1fr)');
  });

  it('exposes an accessible toggle that remains safe under repeated clicks', () => {
    expect(workbenchSource).toContain('aria-expanded');
    expect(workbenchSource).toContain('aria-controls="workbench-sidebar"');
    expect(workbenchSource).toContain('data-sidebar-state');
    expect(workbenchSource).toContain('setSidebarCollapsed((collapsed) => !collapsed)');
    expect(workbenchSource).toContain('workbench-sidebar');
    expect(workbenchSource).toContain('focus()');
  });

  it('keeps the layout synchronized and supports reduced motion', () => {
    expect(workbenchStyles).toContain("@property --wb-sidebar-width");
    expect(workbenchStyles).toContain('transition: --wb-sidebar-width 360ms cubic-bezier(.48, .38, .2, .98)');
    expect(workbenchStyles).toContain('transition: opacity 120ms ease, transform 360ms cubic-bezier(.48, .38, .2, .98)');
    expect(workbenchStyles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(workbenchStyles).toContain('transition-duration: 0ms');
    expect(workbenchStyles).toContain('data-sidebar-state="collapsed"');
  });
});
