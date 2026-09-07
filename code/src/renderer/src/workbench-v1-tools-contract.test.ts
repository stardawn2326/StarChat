import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const rendererDirectory = import.meta.dirname;
const appSource = readFileSync(resolve(rendererDirectory, 'App.tsx'), 'utf8');
const workbenchSource = readFileSync(resolve(rendererDirectory, 'AgentWorkbench.tsx'), 'utf8');
const preloadSource = readFileSync(resolve(rendererDirectory, '../../preload/index.ts'), 'utf8');
const workbenchStyles = readFileSync(resolve(rendererDirectory, 'workbench/workbench.css'), 'utf8');

describe('StarChat V1 workbench tool closure', () => {
  it('exposes bounded file preview, source diff, verification, command, browser, and staged commit IPC', () => {
    expect(preloadSource).toContain('previewFile:');
    expect(preloadSource).toContain("ipcRenderer.invoke('workbench:diff'");
    expect(preloadSource).toContain("ipcRenderer.invoke('workbench:verify'");
    expect(preloadSource).toContain("ipcRenderer.invoke('workbench:command'");
    expect(preloadSource).toContain("ipcRenderer.invoke('workbench:open-url'");
    expect(preloadSource).toContain("ipcRenderer.invoke('workbench:git-commit'");
  });

  it('renders dedicated resource, source, task, and verification views', () => {
    for (const marker of ['data-workbench-tool="resources"', 'data-workbench-tool="source"', 'data-workbench-tool="tasks"', 'data-workbench-tool="terminal"']) {
      expect(workbenchSource).toContain(marker);
    }
    expect(workbenchSource).toContain('label="返回上级目录"');
    expect(workbenchSource).toContain('label="关闭工具面板"');
  });

  it('provides a bounded browser and routes side chat to the persistent conversation', () => {
    expect(workbenchSource).toContain('label="浏览器" icon="browser" domain="browser-safe" action="browser"');
    expect(workbenchSource).toContain('data-workbench-tool="browser"');
    expect(workbenchSource).toContain('action="chat"');
    expect(appSource).toContain("action === 'chat'");
  });

  it('lets the center shrink and wraps verification actions instead of clipping the right rail', () => {
    expect(workbenchStyles).toMatch(/\.wb-main-grid\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s+var\(--wb-right-rail-width\)/);
    expect(workbenchStyles).toMatch(/\.wb-verification-actions\s*\{[\s\S]*?grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(160px,\s*1fr\)\)/);
  });
});
