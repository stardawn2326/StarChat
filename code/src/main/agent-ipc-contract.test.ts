import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Agent IPC boundary', () => {
  it('exposes only structured task operations through preload and registers their main handlers', () => {
    const preload = readFileSync(resolve(import.meta.dirname, '../preload/index.ts'), 'utf8');
    const main = readFileSync(resolve(import.meta.dirname, 'index.ts'), 'utf8');
    for (const channel of ['agent:start', 'agent:cancel', 'agent:approve', 'agent:respond', 'agent:list', 'agent:get', 'agent:event']) {
      expect(preload).toContain(channel);
    }
    for (const channel of ['agent:start', 'agent:cancel', 'agent:approve', 'agent:respond', 'agent:list', 'agent:get']) {
      expect(main).toContain(`ipcMain.handle('${channel}'`);
    }
    expect(preload).not.toMatch(/exec|spawn|shell|child_process/i);
  });

  it('keeps Agent task messages separate from companion relationship persistence', () => {
    const service = readFileSync(resolve(import.meta.dirname, 'agent-service.ts'), 'utf8');
    expect(service).toContain('AgentStore');
    expect(service).not.toContain('saveCompanionState');
    expect(service).not.toContain('sendAssistantPresentation');
  });
});
