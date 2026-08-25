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
  const root = mkdtempSync(join(tmpdir(), 'baoyin-agent-service-'));
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src', 'note.txt'), 'hello\nworld\n', 'utf8');
  const store = new AgentStore(join(root, 'tasks.json'));
  let response: { type: 'final'; content: string } | { type: 'tool_calls'; calls: Array<{ id: string; name: string; arguments: string }> } = { type: 'final', content: '完成了' };
  const service = new AgentService({
    store,
    workspaceRoot: root,
    getContext: () => ({ settings: { ...DEFAULT_APP_SETTINGS, assistantMode: 'agent' }, apiKey: 'test-key', roleId: 'baoyin.default', live2dPath: null }),
    createModel: () => ({ complete: vi.fn(async () => response) }),
    now: () => Date.now()
  });
  return { root, store, service, setResponse: (next: typeof response) => { response = next; } };
}

describe('Agent service lifecycle', () => {
  it('keeps Agent task state out of companion memory and completes a read-only task', async () => {
    const { service, store } = setup();
    const started = await service.start({ mode: 'agent', message: '读取 src/note.txt' });
    await waitFor(() => store.get(started.taskId)?.status === 'completed');
    expect(store.get(started.taskId)?.result?.summary).toBe('完成了');
    expect(store.get(started.taskId)?.status).toBe('completed');
  });

  it('holds an exact write plan for approval and never writes before approval', async () => {
    const { root, store, service, setResponse } = setup();
    const patch = '*** Begin Patch\n*** Update File: src/note.txt\n@@\n hello\n-world\n+approved\n*** End Patch';
    setResponse({ type: 'tool_calls', calls: [{ id: 'write-1', name: 'apply_patch', arguments: JSON.stringify({ patch }) }] });
    const started = await service.start({ mode: 'agent', message: '修改 src/note.txt' });
    await waitFor(() => store.get(started.taskId)?.status === 'waiting_for_approval');
    expect(readFileSync(join(root, 'src', 'note.txt'), 'utf8')).toBe('hello\nworld\n');
    const approval = store.get(started.taskId)?.approval;
    expect(approval?.target).toBe('src/note.txt');
    expect(approval?.plan).toContain('将更新 1 个文件');
    setResponse({ type: 'final', content: '已获批准并完成修改' });
    await service.approve(started.taskId, approval!.id, true);
    await waitFor(() => store.get(started.taskId)?.status === 'completed');
    expect(readFileSync(join(root, 'src', 'note.txt'), 'utf8')).toBe('hello\napproved\n');
  });
});
