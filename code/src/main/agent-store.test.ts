import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import type { AgentTask } from '../shared/agent';
import { AgentStore } from './agent-store';

describe('agent checkpoint store', () => {
  it('writes versioned data atomically and marks unfinished tasks interrupted on reload', () => {
    const root = mkdtempSync(join(tmpdir(), 'starchat-agent-store-'));
    const file = join(root, 'agent', 'tasks.json');
    const store = new AgentStore(file);
    store.save({ id: 't1', sessionId: 's1', roleId: 'baoyin.default', message: 'read', mode: 'agent', status: 'running', createdAt: 1, updatedAt: 1, currentStep: 0, steps: [], route: { route: 'agent', method: 'forced', explain: 'forced' } });
    const reloaded = new AgentStore(file);
    expect(reloaded.get('t1')?.status).toBe('interrupted');
    expect(JSON.parse(readFileSync(file, 'utf8')).version).toBe(1);
  });

  it('migrates an empty or old file without exposing arbitrary values', () => {
    const root = mkdtempSync(join(tmpdir(), 'starchat-agent-store-'));
    mkdirSync(join(root, 'agent'));
    const file = join(root, 'agent', 'tasks.json');
    writeFileSync(file, JSON.stringify({ version: 0, tasks: [{ id: 'x', status: 'running', apiKey: 'secret' }] }), 'utf8');
    const store = new AgentStore(file);
    expect(store.list()).toEqual([]);
    expect(readFileSync(file, 'utf8')).not.toContain('secret');
  });

  it('clears restart-invalid approval and input state while preserving bounded history', () => {
    const root = mkdtempSync(join(tmpdir(), 'starchat-agent-store-restart-'));
    const file = join(root, 'tasks.json');
    const task: AgentTask = {
      id: 'task-restart', sessionId: 'session-a', roleId: 'baoyin.default', message: '修改文件', mode: 'agent',
      status: 'waiting_for_approval', createdAt: 1, updatedAt: 1, currentStep: 2,
      route: { route: 'agent', method: 'forced', explain: '后台 Agent 任务' },
      steps: [],
      invocations: [
        { id: 'invocation-running', taskId: 'task-restart', name: 'apply_patch', arguments: '[已按最小必要原则省略]', status: 'waiting_for_approval', createdAt: 1 },
        { id: 'invocation-finished', taskId: 'task-restart', name: 'read_file', arguments: '[已按最小必要原则省略]', status: 'completed', createdAt: 1 }
      ],
      approval: {
        id: 'approval-1', taskId: 'task-restart', invocationId: 'invocation-running', toolName: 'apply_patch', target: 'src/note.txt', plan: '更新文件',
        preview: { files: ['src/note.txt'], patch: 'PRIVATE_FILE_CONTENT', additions: 1, deletions: 1 }, createdAt: 1
      },
      input: { id: 'input-1', taskId: 'task-restart', invocationId: 'invocation-running', prompt: '不要保留', createdAt: 1 }
    };
    const store = new AgentStore(file);
    store.save(task);
    expect(readFileSync(file, 'utf8')).not.toContain('PRIVATE_FILE_CONTENT');

    const reloaded = new AgentStore(file).get(task.id);
    expect(reloaded).toMatchObject({ status: 'interrupted', interruptionReason: 'application-restart', error: '应用重启时任务未完成；可在任务管理中重新执行。' });
    expect(reloaded?.approval).toBeUndefined();
    expect(reloaded?.input).toBeUndefined();
    expect(reloaded?.invocations).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'invocation-running', status: 'cancelled', summary: '应用重启后未继续执行' }),
      expect.objectContaining({ id: 'invocation-finished', status: 'completed' })
    ]));
  });
});
