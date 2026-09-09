import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EMPTY_AGENT_TASK_METRICS } from '../shared/agent-metrics';
import type { TaskContext } from '../shared/task-context';
import { TaskContextStore } from './task-context-store';

function context(taskId = 'task-a') {
  return {
    taskId,
    workspaceId: 'workspace-a',
    userRequest: '读取 src/main.ts 并运行测试',
    plan: [{ id: 'plan-1', text: '读取文件', status: 'completed' as const }],
    filesRead: [{ path: 'src/main.ts', readAt: 10 }],
    findings: [{ id: 'finding-1', type: 'file' as const, summary: '发现入口文件', sourcePath: 'src/main.ts', createdAt: 10 }],
    pendingChanges: [],
    verification: [],
    metrics: { ...EMPTY_AGENT_TASK_METRICS },
    status: 'running' as const
  };
}

describe('task context store', () => {
  it('persists bounded task context and reloads it by workspace', () => {
    const root = mkdtempSync(join(tmpdir(), 'starchat-task-context-'));
    const file = join(root, 'contexts.json');
    const store = new TaskContextStore(file, { now: () => 100 });
    const created = store.create(context());
    expect(created.taskId).toBe('task-a');
    expect(store.list('workspace-a')).toHaveLength(1);
    expect(new TaskContextStore(file, { now: () => 100 }).get('task-a')).toMatchObject({ taskId: 'task-a', filesRead: [{ path: 'src/main.ts' }] });
    expect(JSON.parse(readFileSync(file, 'utf8')).contexts[0].userRequest).toBe('读取 src/main.ts 并运行测试');
  });

  it('updates lifecycle state, preserves failure and approval summaries, and supports terminal helpers', () => {
    const root = mkdtempSync(join(tmpdir(), 'starchat-task-context-life-'));
    const store = new TaskContextStore(join(root, 'contexts.json'), { now: () => 200 });
    store.create(context());
    store.update('task-a', (current) => ({
      status: 'waiting-approval',
      pendingApproval: { summary: '将更新 src/main.ts', createdAt: 200 },
      pendingChanges: [{ id: 'change-1', operation: 'update', path: 'src/main.ts', summary: '更新入口', createdAt: 200 }],
      metrics: { ...current.metrics, writeCalls: 1 }
    }));
    expect(store.get('task-a')).toMatchObject({ status: 'waiting-approval', pendingApproval: { summary: '将更新 src/main.ts' }, metrics: { writeCalls: 1 } });
    store.markInterrupted('task-a', '验证失败：password=secret-value');
    expect(store.get('task-a')).toMatchObject({ status: 'interrupted', latestFailure: { summary: '验证失败：password=[REDACTED]' } });
    store.markCompleted('task-a');
    expect(store.get('task-a')).toMatchObject({ status: 'completed' });
  });

  it('filters secrets and unsafe paths without storing file contents', () => {
    const root = mkdtempSync(join(tmpdir(), 'starchat-task-context-safe-'));
    const file = join(root, 'contexts.json');
    const store = new TaskContextStore(file);
    store.create({
      ...context('task-safe'),
      userRequest: 'API_KEY=sk-123456789012345 读取文件内容：secret=top-secret',
      filesRead: [{ path: '../outside.txt', readAt: 1 }, { path: '.env', readAt: 2 }, { path: 'src/main.ts', readAt: 3 }],
      findings: [{ id: 'f', type: 'risk', summary: 'token=abc123', createdAt: 1 }]
    });
    const raw = readFileSync(file, 'utf8');
    expect(raw).not.toContain('sk-123456789012345');
    expect(raw).not.toContain('top secret');
    expect(raw).not.toContain('../outside.txt');
    expect(raw).not.toContain('file contents');
    expect(store.get('task-safe')?.filesRead).toEqual([{ path: 'src/main.ts', readAt: 3 }]);
  });

  it('strips absolute repository roots when persisting a runtime repo map', () => {
    const root = mkdtempSync(join(tmpdir(), 'starchat-task-context-repo-'));
    const file = join(root, 'contexts.json');
    const absoluteRoot = join(root, 'workspace');
    const runtimeRepoMap = {
      workspaceId: 'workspace-a',
      workspaceRoot: absoluteRoot,
      projectRoot: join(absoluteRoot, 'code'),
      projectType: 'electron',
      sourceRoots: ['code/src'],
      testRoots: ['code/src/main'],
      configFiles: ['package.json'],
      importantFiles: [{ path: 'package.json', kind: 'manifest' as const, size: 20 }],
      languageStats: { ts: 4 },
      generatedAt: 100
    } as unknown as NonNullable<TaskContext['repoMap']>;
    const store = new TaskContextStore(file);
    store.create({ ...context('task-repo'), repoMap: runtimeRepoMap });

    const raw = readFileSync(file, 'utf8');
    expect(raw).not.toContain(absoluteRoot);
    expect(raw).not.toContain('workspaceRoot');
    expect(raw).not.toContain('projectRoot');
    expect(store.get('task-repo')?.repoMap).toMatchObject({ projectType: 'electron', sourceRoots: ['code/src'] });
    expect(store.get('task-repo')?.repoMap).not.toHaveProperty('workspaceRoot');
    expect(store.get('task-repo')?.repoMap).not.toHaveProperty('projectRoot');
  });

  it('prunes old terminal contexts but keeps active contexts and caps the store', () => {
    const root = mkdtempSync(join(tmpdir(), 'starchat-task-context-prune-'));
    let now = 1000;
    const store = new TaskContextStore(join(root, 'contexts.json'), { maxContexts: 2, maxAgeMs: 10, now: () => now });
    store.create({ ...context('active'), createdAt: 1, updatedAt: 1 });
    store.create({ ...context('old'), status: 'completed', createdAt: 1, updatedAt: 1 });
    now = 100;
    store.create({ ...context('new-a'), status: 'completed', createdAt: 100, updatedAt: 100 });
    store.create({ ...context('new-b'), status: 'completed', createdAt: 101, updatedAt: 101 });
    expect(store.get('active')).not.toBeNull();
    expect(store.get('old')).toBeNull();
    expect(store.list()).toHaveLength(2);
  });

  it('ignores malformed persisted records instead of crashing', () => {
    const root = mkdtempSync(join(tmpdir(), 'starchat-task-context-corrupt-'));
    const file = join(root, 'contexts.json');
    writeFileSync(file, JSON.stringify({ version: 1, contexts: [{ nope: true }] }), 'utf8');
    expect(new TaskContextStore(file).list()).toEqual([]);
  });
});
