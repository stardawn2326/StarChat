import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { AgentStore } from './agent-store';

describe('agent checkpoint store', () => {
  it('writes versioned data atomically and marks unfinished tasks interrupted on reload', () => {
    const root = mkdtempSync(join(tmpdir(), 'baoyin-agent-store-'));
    const file = join(root, 'agent', 'tasks.json');
    const store = new AgentStore(file);
    store.save({ id: 't1', sessionId: 's1', roleId: 'baoyin.default', message: 'read', mode: 'agent', status: 'running', createdAt: 1, updatedAt: 1, currentStep: 0, steps: [], route: { route: 'agent', method: 'forced', explain: 'forced' } });
    const reloaded = new AgentStore(file);
    expect(reloaded.get('t1')?.status).toBe('interrupted');
    expect(JSON.parse(readFileSync(file, 'utf8')).version).toBe(1);
  });

  it('migrates an empty or old file without exposing arbitrary values', () => {
    const root = mkdtempSync(join(tmpdir(), 'baoyin-agent-store-'));
    mkdirSync(join(root, 'agent'));
    const file = join(root, 'agent', 'tasks.json');
    writeFileSync(file, JSON.stringify({ version: 0, tasks: [{ id: 'x', status: 'running', apiKey: 'secret' }] }), 'utf8');
    const store = new AgentStore(file);
    expect(store.list()).toEqual([]);
    expect(readFileSync(file, 'utf8')).not.toContain('secret');
  });
});
