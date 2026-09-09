import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import type { AgentModelMessage, AgentModelResponse, AgentToolDescriptor } from '../shared/agent';
import { DEFAULT_APP_SETTINGS } from '../shared/settings';
import { AgentStore } from './agent-store';
import { AgentService } from './agent-service';
import { ChangeSetStore } from './change-set-store';
import { TaskContextStore } from './task-context-store';
import { WorkspaceGuard } from './agent-security';

const ROUTE = { route: 'agent' as const, method: 'forced' as const, explain: 'D7 受控组合验收' };

async function waitFor(check: () => boolean, label = 'Agent 任务状态'): Promise<void> {
  for (let index = 0; index < 100; index += 1) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`等待${label}超时`);
}

function sourceBefore(): string {
  return [
    'export function sum(a: number, b: number): number {',
    '  return a + b;',
    '}',
    ''
  ].join('\n');
}

function sourceAfter(): string {
  return [
    'export function sum(a: number, b: number): number {',
    '  return a + b;',
    '}',
    '',
    'export function clamp(value: number, min: number, max: number): number {',
    '  return Math.min(Math.max(value, min), max);',
    '}',
    ''
  ].join('\n');
}

function testsBefore(): string {
  return [
    "import { sum } from '../src/math';",
    '',
    "if (sum(2, 3) !== 5) throw new Error('sum failed');",
    ''
  ].join('\n');
}

function testsAfter(): string {
  return [
    "import { clamp, sum } from '../src/math';",
    '',
    "if (sum(2, 3) !== 5) throw new Error('sum failed');",
    "if (clamp(8, 0, 5) !== 5) throw new Error('clamp failed');",
    ''
  ].join('\n');
}

type ModelInput = { messages: AgentModelMessage[]; tools: AgentToolDescriptor[] };

interface FixtureHarness {
  fixtureRoot: string;
  store: AgentStore;
  taskContextStore: TaskContextStore;
  changeSetStore: ChangeSetStore;
  service: AgentService;
  modelInputs: ModelInput[];
  executeVerification: ReturnType<typeof vi.fn>;
  setResponses: (responses: AgentModelResponse[]) => void;
}

function createFixture(options: {
  trust?: 'read-only' | 'trusted-execution';
  responses?: AgentModelResponse[];
} = {}): FixtureHarness {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'starchat-agent-v1-5-fixture-'));
  const stateRoot = mkdtempSync(join(tmpdir(), 'starchat-agent-v1-5-state-'));
  mkdirSync(join(fixtureRoot, 'src'));
  mkdirSync(join(fixtureRoot, 'tests'));
  writeFileSync(join(fixtureRoot, 'package.json'), JSON.stringify({
    name: 'agent-v1-5-fixture',
    scripts: { typecheck: 'node -e "process.exit(0)"', test: 'node -e "process.exit(0)"' }
  }), 'utf8');
  writeFileSync(join(fixtureRoot, 'src', 'math.ts'), sourceBefore(), 'utf8');
  writeFileSync(join(fixtureRoot, 'tests', 'math.test.ts'), testsBefore(), 'utf8');
  writeFileSync(join(fixtureRoot, '.env'), 'D7_SECRET=must-not-enter-context\n', 'utf8');

  let responses = options.responses ?? [{ type: 'final', content: 'fixture complete' }];
  let responseIndex = 0;
  const modelInputs: ModelInput[] = [];
  const complete = vi.fn(async (messages: AgentModelMessage[], tools: AgentToolDescriptor[], _signal: AbortSignal): Promise<AgentModelResponse> => {
    modelInputs.push({ messages, tools });
    return responses[responseIndex++] ?? { type: 'final', content: 'fixture complete' };
  });
  const executeVerification = vi.fn(async (_root: string, script: string, _signal: AbortSignal) => ({
    script,
    ok: true,
    output: `${script} passed in controlled D7 fixture`
  }));
  const store = new AgentStore(join(stateRoot, 'tasks.json'));
  const taskContextStore = new TaskContextStore(join(stateRoot, 'task-contexts.json'));
  const changeSetStore = new ChangeSetStore(join(stateRoot, 'change-sets.json'));
  const service = new AgentService({
    store,
    resolveExecutionContext: (sessionId) => ({
      sessionId: sessionId ?? 'd7-session',
      workspaceRoot: fixtureRoot,
      workspaceId: 'd7-fixture-workspace',
      contextType: 'workspace',
      trust: options.trust ?? 'trusted-execution'
    }),
    getContext: () => ({
      settings: { ...DEFAULT_APP_SETTINGS, assistantMode: 'agent' },
      apiKey: 'd7-test-key',
      roleId: 'd7.agent',
      live2dPath: null
    }),
    createModel: () => ({ complete }),
    executeVerification,
    taskContextStore,
    changeSetStore
  });

  return {
    fixtureRoot,
    store,
    taskContextStore,
    changeSetStore,
    service,
    modelInputs,
    executeVerification,
    setResponses: (next) => { responses = next; responseIndex = 0; }
  };
}

function applyChangesResponse(id: string): AgentModelResponse {
  return {
    type: 'tool_calls',
    calls: [{
      id,
      name: 'apply_file_changes',
      arguments: JSON.stringify({ changes: [
        { type: 'update', path: 'src/math.ts', content: sourceAfter() },
        { type: 'update', path: 'tests/math.test.ts', content: testsAfter() }
      ] })
    }]
  };
}

describe('Agent V1.5 D7 controlled composition acceptance', () => {
  it('runs the baseline chain with repo map, search, read, compression, approval, apply, verification, and final summary', async () => {
    const harness = createFixture({ responses: [
      { type: 'tool_calls', calls: [{ id: 'search-text', name: 'workspace_search', arguments: JSON.stringify({ mode: 'text', query: 'sum', path: 'src' }) }] },
      { type: 'tool_calls', calls: [{ id: 'read-math', name: 'read_file', arguments: JSON.stringify({ path: 'src/math.ts' }) }] },
      { type: 'tool_calls', calls: [{ id: 'search-file', name: 'workspace_search', arguments: JSON.stringify({ mode: 'filename', query: 'math.test', path: 'tests' }) }] },
      applyChangesResponse('apply-baseline'),
      { type: 'tool_calls', calls: [{ id: 'verify-typecheck', name: 'run_verification', arguments: JSON.stringify({ script: 'typecheck' }) }] },
      { type: 'tool_calls', calls: [{ id: 'verify-test', name: 'run_verification', arguments: JSON.stringify({ script: 'test' }) }] },
      { type: 'final', content: '已新增 clamp 与测试，并完成类型检查和测试。' }
    ] });

    const started = await harness.service.start({ mode: 'agent', message: '为 math.ts 增加 clamp，补充测试并运行 typecheck/test', sessionId: 'd7-session' });
    await waitFor(() => harness.store.get(started.taskId)?.status === 'waiting_for_approval', '基线审批');
    const waitingContext = harness.taskContextStore.get(started.taskId);
    const approval = harness.store.get(started.taskId)?.approval;
    expect(approval?.preview?.changeSetId).toBeTruthy();
    expect(waitingContext).toMatchObject({
      status: 'waiting-approval',
      repoMap: { sourceRoots: ['src'], testRoots: ['tests'] },
      pendingChanges: [
        { path: 'src/math.ts', operation: 'update' },
        { path: 'tests/math.test.ts', operation: 'update' }
      ],
      metrics: { toolCalls: 4, readFileCalls: 1, searchCalls: 2, writeCalls: 1, verificationRuns: 0 }
    });
    expect(readFileSync(join(harness.fixtureRoot, 'src', 'math.ts'), 'utf8')).toBe(sourceBefore());
    expect(readFileSync(join(harness.fixtureRoot, 'tests', 'math.test.ts'), 'utf8')).toBe(testsBefore());

    await harness.service.approve(started.taskId, approval!.id, true);
    await waitFor(() => harness.store.get(started.taskId)?.status === 'completed', '基线完成');
    const completedContext = harness.taskContextStore.get(started.taskId);
    expect(completedContext).toMatchObject({
      status: 'completed',
      pendingChanges: [],
      metrics: { toolCalls: 6, readFileCalls: 1, searchCalls: 2, writeCalls: 1, verificationRuns: 3 },
      verification: [{ result: 'passed', command: 'pnpm run typecheck' }]
    });
    expect(harness.executeVerification.mock.calls.map((call) => call[1])).toEqual(['typecheck', 'test', 'typecheck']);
    expect(readFileSync(join(harness.fixtureRoot, 'src', 'math.ts'), 'utf8')).toBe(sourceAfter());
    expect(readFileSync(join(harness.fixtureRoot, 'tests', 'math.test.ts'), 'utf8')).toBe(testsAfter());
    expect(harness.changeSetStore.get(approval!.preview!.changeSetId!)).toMatchObject({ state: 'applied' });
    expect(completedContext?.metrics.contextCompactions).toBeGreaterThanOrEqual(2);
    expect(harness.modelInputs[0].messages.some((message) => message.content.includes('受控仓库上下文'))).toBe(true);
    expect(harness.modelInputs.flatMap((input) => input.messages).some((message) => message.content.includes(harness.fixtureRoot))).toBe(false);
  });

  it('invalidates stale approval and requires a fresh preview before applying after TOCTOU', async () => {
    const harness = createFixture({ responses: [applyChangesResponse('apply-stale'), { type: 'final', content: '不应使用旧批准继续' }] });
    const first = await harness.service.start({ mode: 'agent', message: '更新 math fixture' });
    await waitFor(() => harness.store.get(first.taskId)?.status === 'waiting_for_approval', 'TOCTOU 审批');
    const firstApproval = harness.store.get(first.taskId)!.approval!;
    writeFileSync(join(harness.fixtureRoot, 'src', 'math.ts'), 'external edit\n', 'utf8');
    await harness.service.approve(first.taskId, firstApproval.id, true);
    await waitFor(() => harness.store.get(first.taskId)?.status === 'failed', 'TOCTOU 失败');
    expect(readFileSync(join(harness.fixtureRoot, 'src', 'math.ts'), 'utf8')).toBe('external edit\n');
    expect(harness.changeSetStore.get(firstApproval.preview!.changeSetId!)).toMatchObject({ state: 'invalidated' });

    harness.setResponses([applyChangesResponse('apply-reapproved'), { type: 'final', content: '已重新预览并批准' }]);
    const second = await harness.service.start({ mode: 'agent', message: '基于当前文件重新应用 clamp 变更' });
    await waitFor(() => harness.store.get(second.taskId)?.status === 'waiting_for_approval', '重新审批');
    const secondApproval = harness.store.get(second.taskId)!.approval!;
    expect(secondApproval.preview?.changeSetId).not.toBe(firstApproval.preview?.changeSetId);
    await harness.service.approve(second.taskId, secondApproval.id, true);
    await waitFor(() => harness.store.get(second.taskId)?.status === 'completed', '重新批准完成');
    expect(readFileSync(join(harness.fixtureRoot, 'src', 'math.ts'), 'utf8')).toBe(sourceAfter());
    expect(harness.changeSetStore.get(secondApproval.preview!.changeSetId!)).toMatchObject({ state: 'applied' });
  });

  it('reconciles interrupted runtime state and retries as a new linked task', async () => {
    const harness = createFixture();
    const taskPath = join(mkdtempSync(join(tmpdir(), 'starchat-agent-v1-5-restart-state-')), 'tasks.json');
    const contextPath = join(mkdtempSync(join(tmpdir(), 'starchat-agent-v1-5-restart-context-')), 'contexts.json');
    const changeSetPath = join(mkdtempSync(join(tmpdir(), 'starchat-agent-v1-5-restart-changes-')), 'change-sets.json');
    const initialStore = new AgentStore(taskPath);
    initialStore.save({
      id: 'd7-interrupted-task',
      sessionId: 'd7-session',
      roleId: 'd7.agent',
      message: '重试读取 math.ts',
      mode: 'agent',
      route: ROUTE,
      status: 'waiting_for_approval',
      createdAt: 1,
      updatedAt: 1,
      currentStep: 1,
      steps: [],
      approval: {
        id: 'd7-old-approval',
        taskId: 'd7-interrupted-task',
        invocationId: 'd7-old-invocation',
        toolName: 'apply_file_changes',
        target: 'src/math.ts',
        plan: '更新 math.ts',
        preview: { files: ['src/math.ts'], patch: 'private', additions: 1, deletions: 0 },
        createdAt: 1
      }
    });
    const contextStore = new TaskContextStore(contextPath);
    contextStore.create({
      taskId: 'd7-interrupted-task', workspaceId: 'd7-fixture-workspace', userRequest: '重试读取 math.ts', plan: [], filesRead: [], findings: [],
      pendingChanges: [{ id: 'd7-change', operation: 'update', path: 'src/math.ts', summary: '更新 math.ts', createdAt: 1 }],
      verification: [], metrics: { toolCalls: 1, readFileCalls: 0, searchCalls: 0, writeCalls: 1, verificationRuns: 0, contextCompactions: 0 },
      status: 'waiting-approval', createdAt: 1, updatedAt: 1, activeChangeSetId: 'd7-old-change-set', pendingApproval: { summary: '更新 math.ts', createdAt: 1 }
    });
    const changeSetStore = new ChangeSetStore(changeSetPath);
    changeSetStore.create({
      id: 'd7-old-change-set', taskId: 'd7-interrupted-task', workspaceId: 'd7-fixture-workspace', invocationId: 'd7-old-invocation', state: 'waiting-approval', createdAt: 1, updatedAt: 1,
      entries: [{ path: 'src/math.ts', operation: 'update', beforeHash: 'a'.repeat(64), afterHash: 'b'.repeat(64), diffHash: 'c'.repeat(64), additions: 1, deletions: 0 }]
    });

    const restartedStore = new AgentStore(taskPath);
    const restarted = new AgentService({
      store: restartedStore,
      resolveExecutionContext: () => ({ sessionId: 'd7-session', workspaceRoot: harness.fixtureRoot, workspaceId: 'd7-fixture-workspace', contextType: 'workspace', trust: 'trusted-execution' }),
      getContext: () => ({ settings: { ...DEFAULT_APP_SETTINGS, assistantMode: 'agent' }, apiKey: 'd7-test-key', roleId: 'd7.agent', live2dPath: null }),
      createModel: () => ({ complete: vi.fn(async () => ({ type: 'final' as const, content: '重试完成' })) }),
      taskContextStore: contextStore,
      changeSetStore
    });

    expect(restartedStore.get('d7-interrupted-task')).toMatchObject({ status: 'interrupted' });
    expect(contextStore.get('d7-interrupted-task')).toMatchObject({ status: 'interrupted', pendingChanges: [], interruptionReason: 'runtime-lost' });
    expect(changeSetStore.get('d7-old-change-set')?.state).toBe('invalidated');
    const retried = await restarted.retry('d7-interrupted-task');
    await waitFor(() => restartedStore.get(retried.taskId)?.status === 'completed', '重试完成');
    expect(retried.taskId).not.toBe('d7-interrupted-task');
    expect(restartedStore.get(retried.taskId)).toMatchObject({ resumedFromTaskId: 'd7-interrupted-task', sessionId: 'd7-session' });
  });

  it('keeps read-only trust free of write or execution tools and blocks sensitive paths', async () => {
    const harness = createFixture({ trust: 'read-only' });
    const started = await harness.service.start({ mode: 'agent', message: '只读检查 fixture' });
    await waitFor(() => harness.store.get(started.taskId)?.status === 'completed', '只读完成');
    const names = harness.modelInputs[0].tools.map((tool) => tool.name);
    expect(names).not.toContain('apply_patch');
    expect(names).not.toContain('apply_file_changes');
    expect(names).not.toContain('run_verification');
    expect(harness.taskContextStore.get(started.taskId)?.metrics).toMatchObject({ writeCalls: 0, verificationRuns: 0 });

    const guard = new WorkspaceGuard(harness.fixtureRoot);
    expect(() => guard.readText('.env')).toThrow('敏感文件');
    expect(() => guard.readText('../package.json')).toThrow('授权工作区');
  });
});
