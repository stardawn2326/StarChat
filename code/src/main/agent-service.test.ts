import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_APP_SETTINGS } from '../shared/settings';
import { AgentStore } from './agent-store';
import { AgentService } from './agent-service';

async function waitFor(check: () => boolean): Promise<void> {
  for (let index = 0; index < 40; index += 1) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('等待 Agent 任务状态超时');
}

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'starchat-agent-service-'));
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src', 'note.txt'), 'hello\nworld\n', 'utf8');
  writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: { typecheck: 'tsc --noEmit' } }), 'utf8');
  const store = new AgentStore(join(root, 'tasks.json'));
  const executeVerification = vi.fn(async () => ({ script: 'typecheck', ok: true, output: 'types ok' }));
  let response: { type: 'final'; content: string } | { type: 'tool_calls'; calls: Array<{ id: string; name: string; arguments: string }> } = { type: 'final', content: '完成了' };
  const service = new AgentService({
    store,
    workspaceRoot: root,
    getContext: () => ({ settings: { ...DEFAULT_APP_SETTINGS, assistantMode: 'agent' }, apiKey: 'test-key', roleId: 'baoyin.default', live2dPath: null }),
    createModel: () => ({ complete: vi.fn(async () => response) }),
    executeVerification,
    now: () => Date.now()
  });
  return { root, store, service, executeVerification, setResponse: (next: typeof response) => { response = next; } };
}

describe('Agent service lifecycle', () => {
  it('binds every task to the selected session and its authorized workspace', async () => {
    const { root, store } = setup();
    const service = new AgentService({
      store,
      resolveExecutionContext: (sessionId) => ({ sessionId: sessionId ?? 'session-a', workspaceRoot: root }),
      getContext: () => ({ settings: { ...DEFAULT_APP_SETTINGS, assistantMode: 'agent' }, apiKey: 'test-key', roleId: 'baoyin.default', live2dPath: null }),
      createModel: () => ({ complete: vi.fn(async () => ({ type: 'final' as const, content: '完成了' })) })
    });

    const started = await service.start({ mode: 'agent', message: '读取 src/note.txt', sessionId: 'session-a' });
    await waitFor(() => store.get(started.taskId)?.status === 'completed');
    expect(store.get(started.taskId)?.sessionId).toBe('session-a');
  });

  it('keeps Agent task state out of companion memory and completes a read-only task', async () => {
    const { service, store } = setup();
    const started = await service.start({ mode: 'agent', message: '读取 src/note.txt' });
    await waitFor(() => store.get(started.taskId)?.status === 'completed');
    expect(store.get(started.taskId)?.result?.summary).toBe('完成了');
    expect(store.get(started.taskId)?.status).toBe('completed');
  });

  it('holds an exact write plan for approval and never writes before approval', async () => {
    const { root, store, service, setResponse, executeVerification } = setup();
    const patch = '*** Begin Patch\n*** Update File: src/note.txt\n@@\n hello\n-world\n+approved\n*** End Patch';
    setResponse({ type: 'tool_calls', calls: [{ id: 'write-1', name: 'apply_patch', arguments: JSON.stringify({ patch }) }] });
    const started = await service.start({ mode: 'agent', message: '修改 src/note.txt' });
    await waitFor(() => store.get(started.taskId)?.status === 'waiting_for_approval');
    expect(readFileSync(join(root, 'src', 'note.txt'), 'utf8')).toBe('hello\nworld\n');
    const approval = store.get(started.taskId)?.approval;
    expect(approval?.target).toBe('src/note.txt');
    expect(approval?.plan).toContain('将更新 1 个文件');
    expect(approval?.preview).toMatchObject({ files: ['src/note.txt'], patch, additions: 1, deletions: 1 });
    setResponse({ type: 'final', content: '已获批准并完成修改' });
    await service.approve(started.taskId, approval!.id, true);
    await waitFor(() => store.get(started.taskId)?.status === 'completed');
    expect(readFileSync(join(root, 'src', 'note.txt'), 'utf8')).toBe('hello\napproved\n');
    expect(executeVerification).toHaveBeenCalledWith(root, 'typecheck', expect.any(AbortSignal));
    expect(store.get(started.taskId)?.result).toMatchObject({
      changedFiles: ['src/note.txt'],
      verification: { script: 'typecheck', ok: true, output: 'types ok' }
    });
  });

  it('keeps applied changes and fails the task when automatic verification fails', async () => {
    const { root, store, service, setResponse, executeVerification } = setup();
    executeVerification.mockResolvedValueOnce({ script: 'typecheck', ok: false, output: 'type error' });
    const patch = '*** Begin Patch\n*** Update File: src/note.txt\n@@\n hello\n-world\n+changed\n*** End Patch';
    setResponse({ type: 'tool_calls', calls: [{ id: 'write-2', name: 'apply_patch', arguments: JSON.stringify({ patch }) }] });
    const started = await service.start({ mode: 'agent', message: '修改 src/note.txt' });
    await waitFor(() => store.get(started.taskId)?.status === 'waiting_for_approval');
    const approval = store.get(started.taskId)!.approval!;
    setResponse({ type: 'final', content: '修改完成' });
    await service.approve(started.taskId, approval.id, true);
    await waitFor(() => store.get(started.taskId)?.status === 'failed');

    expect(readFileSync(join(root, 'src', 'note.txt'), 'utf8')).toBe('hello\nchanged\n');
    expect(store.get(started.taskId)?.result?.verification).toMatchObject({ ok: false, output: 'type error' });
    expect(store.get(started.taskId)?.error).toContain('自动验证失败');
  });

  it('retries an interrupted task as a new linked task instead of pretending to resume runtime state', async () => {
    const { store, service } = setup();
    const interrupted = {
      id: 'old-task', sessionId: 'session-a', roleId: 'baoyin.default', message: '读取 src/note.txt', mode: 'agent' as const,
      route: { route: 'agent' as const, method: 'forced' as const, explain: '后台 Agent 任务' }, status: 'interrupted' as const,
      createdAt: 1, updatedAt: 2, currentStep: 0, steps: []
    };
    store.save(interrupted);

    const retried = await service.retry(interrupted.id);
    await waitFor(() => store.get(retried.taskId)?.status === 'completed');
    expect(retried.taskId).not.toBe(interrupted.id);
    expect(store.get(retried.taskId)).toMatchObject({ resumedFromTaskId: interrupted.id, sessionId: interrupted.sessionId, message: interrupted.message });
  });
});
