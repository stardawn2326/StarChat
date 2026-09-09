import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, renameSync as nativeRenameSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_APP_SETTINGS } from '../shared/settings';
import { AgentStore } from './agent-store';
import { AgentService } from './agent-service';
import { ChangeSetStore } from './change-set-store';
import { TaskContextStore } from './task-context-store';
import { createWorkspaceFileSystemAdapter, type WorkspaceFileSystemAdapter } from './agent-security';

async function waitFor(check: () => boolean): Promise<void> {
  for (let index = 0; index < 40; index += 1) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('等待 Agent 任务状态超时');
}

function setup(options: { workspaceFileSystem?: WorkspaceFileSystemAdapter } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'starchat-agent-service-'));
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src', 'note.txt'), 'hello\nworld\n', 'utf8');
  writeFileSync(join(root, 'src', 'main.ts'), 'export const main = true\n', 'utf8');
  writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: { typecheck: 'tsc --noEmit' } }), 'utf8');
  const store = new AgentStore(join(root, 'tasks.json'));
  const taskContextStore = new TaskContextStore(join(root, 'task-contexts.json'));
  const changeSetStore = new ChangeSetStore(join(root, 'change-sets.json'));
  const executeVerification = vi.fn(async () => ({ script: 'typecheck', ok: true, output: 'types ok' }));
  let response: { type: 'final'; content: string } | { type: 'tool_calls'; calls: Array<{ id: string; name: string; arguments: string }> } = { type: 'final', content: '完成了' };
  const service = new AgentService({
    store,
    workspaceRoot: root,
    resolveExecutionContext: (sessionId) => ({ sessionId: sessionId ?? 'session-a', workspaceRoot: root, workspaceId: 'workspace-a', contextType: 'workspace', trust: 'trusted-execution' }),
    getContext: () => ({ settings: { ...DEFAULT_APP_SETTINGS, assistantMode: 'agent' }, apiKey: 'test-key', roleId: 'baoyin.default', live2dPath: null }),
    createModel: () => ({ complete: vi.fn(async () => response) }),
    executeVerification,
    taskContextStore,
    changeSetStore,
    workspaceFileSystem: options.workspaceFileSystem,
    now: () => Date.now()
  });
  return { root, store, service, executeVerification, taskContextStore, changeSetStore, setResponse: (next: typeof response) => { response = next; } };
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

  it('creates a repo-aware task context and records safe tool metrics and file paths', async () => {
    const { root, store } = setup();
    const contextStore = new TaskContextStore(join(root, 'task-contexts.json'));
    let completions = 0;
    const service = new AgentService({
      store,
      resolveExecutionContext: (sessionId) => ({ sessionId: sessionId ?? 'session-a', workspaceRoot: root, workspaceId: 'workspace-a', contextType: 'workspace', trust: 'trusted-execution' }),
      getContext: () => ({ settings: { ...DEFAULT_APP_SETTINGS, assistantMode: 'agent' }, apiKey: 'test-key', roleId: 'baoyin.default', live2dPath: null }),
      createModel: () => ({ complete: vi.fn(async () => {
        if (completions++ === 0) return { type: 'tool_calls' as const, calls: [{ id: 'read-1', name: 'read_file', arguments: JSON.stringify({ path: 'src/note.txt' }) }] };
        return { type: 'final' as const, content: '已读取' };
      }) }),
      taskContextStore: contextStore
    });

    const started = await service.start({ mode: 'agent', message: '读取 src/note.txt' });
    await waitFor(() => store.get(started.taskId)?.status === 'completed');
    expect(contextStore.get(started.taskId)).toMatchObject({
      workspaceId: 'workspace-a',
      status: 'completed',
      filesRead: [{ path: 'src/note.txt' }],
      metrics: { toolCalls: 1, readFileCalls: 1 },
      repoMap: { sourceRoots: ['src'] }
    });
  });

  it('passes only bounded repository metadata to the Agent model', async () => {
    const { root, store } = setup();
    let modelMessages: Array<{ role: string; content: string }> = [];
    const service = new AgentService({
      store,
      resolveExecutionContext: (sessionId) => ({ sessionId: sessionId ?? 'session-a', workspaceRoot: root, workspaceId: 'workspace-a', contextType: 'workspace', trust: 'trusted-execution' }),
      getContext: () => ({ settings: { ...DEFAULT_APP_SETTINGS, assistantMode: 'agent' }, apiKey: 'test-key', roleId: 'baoyin.default', live2dPath: null }),
      createModel: () => ({ complete: vi.fn(async (messages) => {
        modelMessages = messages;
        return { type: 'final' as const, content: '已读取' };
      }) })
    });

    const started = await service.start({ mode: 'agent', message: '检查项目结构' });
    await waitFor(() => store.get(started.taskId)?.status === 'completed');
    const repositoryMessage = modelMessages.find((message) => message.content.includes('受控仓库上下文'));
    expect(repositoryMessage?.content).toContain('Project: node');
    expect(repositoryMessage?.content).toContain('Source roots:');
    expect(repositoryMessage?.content).not.toContain(root);
    expect(repositoryMessage?.content).not.toContain('package.json 内容');
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

  it('persists pending approval and automatic verification as bounded task context', async () => {
    const { root, store, executeVerification } = setup();
    const contextStore = new TaskContextStore(join(root, 'task-contexts.json'));
    const patch = '*** Begin Patch\n*** Update File: src/note.txt\n@@\n hello\n-world\n+context\n*** End Patch';
    let response: { type: 'final'; content: string } | { type: 'tool_calls'; calls: Array<{ id: string; name: string; arguments: string }> } = { type: 'tool_calls', calls: [{ id: 'write-context', name: 'apply_patch', arguments: JSON.stringify({ patch }) }] };
    const service = new AgentService({
      store,
      resolveExecutionContext: (sessionId) => ({ sessionId: sessionId ?? 'session-a', workspaceRoot: root, workspaceId: 'workspace-a', contextType: 'workspace', trust: 'trusted-execution' }),
      getContext: () => ({ settings: { ...DEFAULT_APP_SETTINGS, assistantMode: 'agent' }, apiKey: 'test-key', roleId: 'baoyin.default', live2dPath: null }),
      createModel: () => ({ complete: vi.fn(async () => response) }),
      executeVerification,
      taskContextStore: contextStore
    });
    const started = await service.start({ mode: 'agent', message: '修改并验证 src/note.txt' });
    await waitFor(() => store.get(started.taskId)?.status === 'waiting_for_approval');
    expect(contextStore.get(started.taskId)).toMatchObject({ status: 'waiting-approval', pendingChanges: [{ path: 'src/note.txt', operation: 'update' }], metrics: { toolCalls: 1, writeCalls: 1 } });
    const approval = store.get(started.taskId)!.approval!;
    response = { type: 'final', content: '已完成' };
    await service.approve(started.taskId, approval.id, true);
    await waitFor(() => store.get(started.taskId)?.status === 'completed');
    expect(contextStore.get(started.taskId)).toMatchObject({ status: 'completed', pendingChanges: [], metrics: { writeCalls: 1, verificationRuns: 1 }, verification: [{ result: 'passed', type: 'automatic' }] });
  });

  it('persists exact create, update and delete operations while approval is pending', async () => {
    const { root, store, executeVerification } = setup();
    writeFileSync(join(root, 'src', 'remove.txt'), 'remove me\n', 'utf8');
    const contextStore = new TaskContextStore(join(root, 'task-contexts.json'));
    let response: { type: 'final'; content: string } | { type: 'tool_calls'; calls: Array<{ id: string; name: string; arguments: string }> } = {
      type: 'tool_calls',
      calls: [{ id: 'mixed-write', name: 'apply_file_changes', arguments: JSON.stringify({ changes: [
        { type: 'create', path: 'src/new.txt', content: 'new file\n' },
        { type: 'update', path: 'src/note.txt', content: 'updated file\n' },
        { type: 'delete', path: 'src/remove.txt' }
      ] }) }]
    };
    const service = new AgentService({
      store,
      resolveExecutionContext: (sessionId) => ({ sessionId: sessionId ?? 'session-a', workspaceRoot: root, workspaceId: 'workspace-a', contextType: 'workspace', trust: 'trusted-execution' }),
      getContext: () => ({ settings: { ...DEFAULT_APP_SETTINGS, assistantMode: 'agent' }, apiKey: 'test-key', roleId: 'baoyin.default', live2dPath: null }),
      createModel: () => ({ complete: vi.fn(async () => response) }),
      executeVerification,
      taskContextStore: contextStore
    });

    const started = await service.start({ mode: 'agent', message: '准备三类文件变更' });
    await waitFor(() => store.get(started.taskId)?.status === 'waiting_for_approval');
    expect(contextStore.get(started.taskId)?.pendingChanges).toMatchObject([
      { path: 'src/new.txt', operation: 'create' },
      { path: 'src/note.txt', operation: 'update' },
      { path: 'src/remove.txt', operation: 'delete' }
    ]);
    expect(readFileSync(join(root, 'src', 'note.txt'), 'utf8')).toBe('hello\nworld\n');
    expect(readFileSync(join(root, 'src', 'remove.txt'), 'utf8')).toBe('remove me\n');

    const approval = store.get(started.taskId)!.approval!;
    response = { type: 'final', content: '三类变更已完成' };
    await service.approve(started.taskId, approval.id, true);
    await waitFor(() => store.get(started.taskId)?.status === 'completed');
    expect(readFileSync(join(root, 'src', 'new.txt'), 'utf8')).toBe('new file\n');
    expect(readFileSync(join(root, 'src', 'note.txt'), 'utf8')).toBe('updated file\n');
    expect(store.get(started.taskId)?.result?.changedFiles).toEqual(['src/new.txt', 'src/note.txt', 'src/remove.txt']);
    expect(contextStore.get(started.taskId)?.pendingChanges).toEqual([]);
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
    const { store, service, taskContextStore } = setup();
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
    expect(taskContextStore.get(retried.taskId)?.repoMap).toBeDefined();
  });

  it('invalidates the ChangeSet and fails without writing after an external edit', async () => {
    const { root, store, service, setResponse, taskContextStore, changeSetStore } = setup();
    const patch = '*** Begin Patch\n*** Update File: src/note.txt\n@@\n hello\n-world\n+approved\n*** End Patch';
    setResponse({ type: 'tool_calls', calls: [{ id: 'write-toctou', name: 'apply_patch', arguments: JSON.stringify({ patch }) }] });
    const started = await service.start({ mode: 'agent', message: '修改 src/note.txt' });
    await waitFor(() => store.get(started.taskId)?.status === 'waiting_for_approval');
    const approval = store.get(started.taskId)!.approval!;
    const changeSetId = approval.preview?.changeSetId;
    expect(changeSetId).toBeTruthy();
    writeFileSync(join(root, 'src', 'note.txt'), 'external\n', 'utf8');
    setResponse({ type: 'final', content: '不应继续到最终摘要' });

    await service.approve(started.taskId, approval.id, true);
    await waitFor(() => store.get(started.taskId)?.status === 'failed');
    expect(readFileSync(join(root, 'src', 'note.txt'), 'utf8')).toBe('external\n');
    expect(changeSetStore.get(changeSetId!)?.state).toBe('invalidated');
    expect(taskContextStore.get(started.taskId)).toMatchObject({ status: 'failed', pendingChanges: [] });
    expect(taskContextStore.get(started.taskId)?.activeChangeSetId).toBeUndefined();
  });

  it('records a risk finding and affected paths after partial ChangeSet rollback failure', async () => {
    const fileSystem = createWorkspaceFileSystemAdapter({
      renameSync: (source, destination) => {
        if (/[\\/]second\.txt$/u.test(source) && /\.backup$/u.test(destination)) throw new Error('injected second item failure');
        if (/[\\/]\.note\.txt\.starchat-agent-.*\.backup$/u.test(source) && /[\\/]note\.txt$/u.test(destination)) throw new Error('injected rollback failure');
        nativeRenameSync(source, destination);
      }
    });
    const { root, store, service, setResponse, taskContextStore } = setup({ workspaceFileSystem: fileSystem });
    writeFileSync(join(root, 'src', 'second.txt'), 'second before\n', 'utf8');
    const changes = [
      { type: 'update', path: 'src/note.txt', content: 'first after\n' },
      { type: 'update', path: 'src/second.txt', content: 'second after\n' }
    ];
    setResponse({ type: 'tool_calls', calls: [{ id: 'partial-write', name: 'apply_file_changes', arguments: JSON.stringify({ changes }) }] });
    const started = await service.start({ mode: 'agent', message: '执行多文件变更' });
    await waitFor(() => store.get(started.taskId)?.status === 'waiting_for_approval');
    const approval = store.get(started.taskId)!.approval!;
    setResponse({ type: 'final', content: '不应继续到最终摘要' });

    await service.approve(started.taskId, approval.id, true);
    await waitFor(() => store.get(started.taskId)?.status === 'failed');
    expect(store.get(started.taskId)?.error).toContain('partial-failure');
    expect(taskContextStore.get(started.taskId)?.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'risk', summary: expect.stringContaining('src/note.txt') })
    ]));
  });

  it('reconciles interrupted tasks, old approvals, contexts, and ChangeSets on restart', () => {
    const root = mkdtempSync(join(tmpdir(), 'starchat-agent-service-restart-'));
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src', 'note.txt'), 'hello\n', 'utf8');
    const taskFile = join(root, 'tasks.json');
    const contextFile = join(root, 'contexts.json');
    const changeSetFile = join(root, 'change-sets.json');
    const initialStore = new AgentStore(taskFile);
    initialStore.save({
      id: 'task-restart', sessionId: 'session-a', roleId: 'baoyin.default', message: '修改文件', mode: 'agent',
      route: { route: 'agent', method: 'forced', explain: '后台 Agent 任务' }, status: 'waiting_for_approval', createdAt: 1, updatedAt: 1, currentStep: 1, steps: [],
      approval: { id: 'approval-restart', taskId: 'task-restart', invocationId: 'invocation-restart', toolName: 'apply_patch', target: 'src/note.txt', plan: '更新文件', preview: { files: ['src/note.txt'], patch: 'private', additions: 1, deletions: 1 }, createdAt: 1 }
    });
    const taskContextStore = new TaskContextStore(contextFile);
    taskContextStore.create({
      taskId: 'task-restart', workspaceId: 'workspace-a', userRequest: '修改文件', plan: [], filesRead: [], findings: [],
      pendingChanges: [{ id: 'change-1', operation: 'update', path: 'src/note.txt', summary: '更新文件', createdAt: 1 }], verification: [], metrics: { toolCalls: 1, readFileCalls: 0, searchCalls: 0, writeCalls: 1, verificationRuns: 0, contextCompactions: 0 },
      status: 'waiting-approval', createdAt: 1, updatedAt: 1, activeChangeSetId: 'change-set-restart', pendingApproval: { summary: '更新文件', createdAt: 1 }
    });
    const changeSetStore = new ChangeSetStore(changeSetFile);
    changeSetStore.create({
      id: 'change-set-restart', taskId: 'task-restart', workspaceId: 'workspace-a', invocationId: 'invocation-restart', state: 'waiting-approval', createdAt: 1, updatedAt: 1,
      entries: [{ path: 'src/note.txt', operation: 'update', beforeHash: 'a'.repeat(64), afterHash: 'b'.repeat(64), diffHash: 'c'.repeat(64), additions: 1, deletions: 1 }]
    });

    const restartedStore = new AgentStore(taskFile);
    new AgentService({
      store: restartedStore,
      workspaceRoot: root,
      resolveExecutionContext: () => ({ sessionId: 'session-a', workspaceRoot: root, workspaceId: 'workspace-a', contextType: 'workspace', trust: 'trusted-execution' }),
      getContext: () => ({ settings: { ...DEFAULT_APP_SETTINGS, assistantMode: 'agent' }, apiKey: 'test-key', roleId: 'baoyin.default', live2dPath: null }),
      createModel: () => ({ complete: vi.fn(async () => ({ type: 'final' as const, content: '不会执行' })) }),
      taskContextStore,
      changeSetStore
    });

    expect(restartedStore.get('task-restart')).toMatchObject({ status: 'interrupted' });
    expect(restartedStore.get('task-restart')?.approval).toBeUndefined();
    expect(taskContextStore.get('task-restart')).toMatchObject({ status: 'interrupted', interruptionReason: 'runtime-lost', pendingChanges: [] });
    expect(taskContextStore.get('task-restart')?.findings).toEqual(expect.arrayContaining([expect.objectContaining({ summary: 'Task interrupted because previous runtime no longer exists.' })]));
    expect(taskContextStore.get('task-restart')?.findings).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'risk' })]));
    expect(taskContextStore.get('task-restart')?.pendingApproval).toBeUndefined();
    expect(taskContextStore.get('task-restart')?.activeChangeSetId).toBeUndefined();
    expect(changeSetStore.get('change-set-restart')?.state).toBe('invalidated');
  });
});
