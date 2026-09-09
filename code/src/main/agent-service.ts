import { randomUUID } from 'node:crypto';
import type {
  AgentEvent,
  AgentResult,
  AgentRouteDecision,
  AgentStartRequest,
  AgentStartResponse,
  AgentTask,
  AgentTaskStatus
} from '../shared/agent';
import { sanitizeAgentStartRequest } from '../shared/agent';
import type { AppSettings } from '../shared/settings';
import { AgentStore } from './agent-store';
import { AgentRuntime, type AgentModel, type AgentToolExecutionEvent } from './agent-runtime';
import { createAgentTools, runVerification, type VerificationResult } from './agent-tools';
import { WorkspaceGuard } from './agent-security';
import { routeTurn } from './agent-router';
import type { SessionExecutionContext } from './session-store';
import { detectProject } from './project-detector';
import { WorkspaceLockManager } from './workspace-lock-manager';
import type { AgentTaskMetrics } from '../shared/agent-metrics';
import { cloneAgentTaskMetrics, EMPTY_AGENT_TASK_METRICS, incrementAgentTaskMetrics } from '../shared/agent-metrics';
import { taskContextStatusFromAgentStatus, type TaskContext } from '../shared/task-context';
import { buildRepoContextSummary, RepoMapBuilder, toTaskRepoSummary } from './repo-map';
import type { RepoMap } from '../shared/repo-map';
import { TaskContextStore, type TaskContextPatch } from './task-context-store';

function redact(text: string): string {
  return text
    .replace(/sk-[A-Za-z0-9_-]{12,}/gu, '[REDACTED_API_KEY]')
    .replace(/(?:api[_-]?key|token|secret)\s*[:=]\s*[^\s,;]{8,}/giu, '$1=[REDACTED]');
}

export interface AgentServiceContext {
  settings: AppSettings;
  apiKey: string;
  roleId: string;
  live2dPath?: string | null;
}

export interface AgentServiceOptions {
  store: AgentStore;
  workspaceRoot?: string;
  resolveExecutionContext?: (sessionId?: string) => Pick<SessionExecutionContext, 'sessionId' | 'workspaceRoot'> & Partial<Omit<SessionExecutionContext, 'sessionId' | 'workspaceRoot'>>;
  getContext: () => AgentServiceContext;
  createModel: (context: AgentServiceContext) => AgentModel;
  classifyAmbiguous?: (message: string, context: AgentServiceContext) => Promise<'agent' | 'companion'>;
  emit?: (event: AgentEvent) => void;
  now?: () => number;
  maxReadOnlyConcurrency?: number;
  executeVerification?: (root: string, script: string, signal: AbortSignal) => Promise<VerificationResult>;
  workspaceLockManager?: WorkspaceLockManager;
  taskContextStore?: TaskContextStore;
  repoMapBuilder?: RepoMapBuilder;
}

interface LiveTask {
  runtime: AgentRuntime;
  controller: AbortController;
  workspaceRoot: string;
  wrote: boolean;
  changedFiles: string[];
  trust?: SessionExecutionContext['trust'];
  metrics: AgentTaskMetrics;
  countedInvocations: Set<string>;
}

function automaticVerificationScript(workspaceRoot: string): string | null {
  try {
    const project = detectProject(workspaceRoot);
    for (const script of ['typecheck', 'test', 'build']) {
      if (typeof project.scripts[script] === 'string') return script;
    }
  } catch {
    return null;
  }
  return null;
}

function active(status: AgentTaskStatus): boolean {
  return status === 'queued' || status === 'running' || status === 'waiting_for_approval' || status === 'waiting_for_input';
}

function metricFieldForTool(toolName: string): keyof AgentTaskMetrics | null {
  if (toolName === 'read_file') return 'readFileCalls';
  if (toolName === 'search_text' || toolName === 'workspace_search') return 'searchCalls';
  if (toolName === 'apply_patch' || toolName === 'apply_file_changes') return 'writeCalls';
  if (toolName === 'run_verification') return 'verificationRuns';
  return null;
}

export class AgentService {
  private readonly options: AgentServiceOptions;
  private readonly live = new Map<string, LiveTask>();
  private readonly workspaceLocks: WorkspaceLockManager;
  private readonly repoMapBuilder: RepoMapBuilder;

  constructor(options: AgentServiceOptions) {
    this.options = options;
    this.workspaceLocks = options.workspaceLockManager ?? new WorkspaceLockManager();
    this.repoMapBuilder = options.repoMapBuilder ?? new RepoMapBuilder();
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  private emit(event: AgentEvent): void {
    this.options.emit?.(event);
  }

  private updateTaskContext(taskId: string, patch: TaskContextPatch | ((current: TaskContext) => TaskContextPatch)): void {
    try {
      this.options.taskContextStore?.update(taskId, patch);
    } catch {
      // Task context is best-effort telemetry and must never interrupt Agent execution.
    }
  }

  private syncTaskContextStatus(task: AgentTask): void {
    this.updateTaskContext(task.id, {
      status: taskContextStatusFromAgentStatus(task.status),
      ...(task.error ? { latestFailure: { summary: redact(task.error).slice(0, 4000), createdAt: this.now() } } : {})
    });
  }

  private workspaceIdFor(execution: Pick<SessionExecutionContext, 'workspaceRoot'> & Partial<Pick<SessionExecutionContext, 'workspaceId'>>): string {
    return typeof execution.workspaceId === 'string' && execution.workspaceId.trim() ? execution.workspaceId : execution.workspaceRoot;
  }

  private buildRepoMap(task: AgentTask, execution: Pick<SessionExecutionContext, 'workspaceRoot'> & Partial<Pick<SessionExecutionContext, 'workspaceId'>>, context: AgentServiceContext): RepoMap | undefined {
    try {
      return this.repoMapBuilder.build(this.workspaceIdFor(execution), execution.workspaceRoot, {
        deniedRoots: context.live2dPath ? [context.live2dPath] : []
      });
    } catch {
      return undefined;
    }
  }

  private initializeTaskContext(task: AgentTask, execution: Pick<SessionExecutionContext, 'sessionId' | 'workspaceRoot'> & Partial<Omit<SessionExecutionContext, 'sessionId' | 'workspaceRoot'>>, repoMap?: RepoMap): void {
    const store = this.options.taskContextStore;
    if (!store) return;
    const workspaceId = this.workspaceIdFor(execution);
    try {
      store.create({
        taskId: task.id,
        workspaceId,
        userRequest: task.message,
        plan: [{ id: `${task.id}:plan`, text: '执行当前 Agent 任务', status: 'in-progress' }],
        filesRead: [],
        findings: [],
        pendingChanges: [],
        verification: [],
        metrics: { ...EMPTY_AGENT_TASK_METRICS },
        status: taskContextStatusFromAgentStatus(task.status),
        ...(repoMap ? { repoMap: toTaskRepoSummary(repoMap) } : {}),
        createdAt: task.createdAt,
        updatedAt: task.updatedAt
      });
    } catch {
      // Invalid or unavailable telemetry storage must not block the task itself.
    }
  }

  private save(task: AgentTask): void {
    task.updatedAt = this.now();
    this.options.store.save(task);
    this.emit({ type: 'task', task: this.options.store.get(task.id) ?? task, taskId: task.id, timestamp: this.now() });
    this.syncTaskContextStatus(task);
  }

  private setStatus(task: AgentTask, status: AgentTaskStatus, error?: string): void {
    task.status = status;
    if (error) task.error = redact(error);
    this.save(task);
    if (!active(status)) this.syncTerminalTaskContext(task);
    if (!active(status)) this.releaseWriteLock(task.id);
  }

  private syncTerminalTaskContext(task: AgentTask, verification?: { value: VerificationResult; result: 'passed' | 'failed' | 'waiting' }): void {
    this.updateTaskContext(task.id, (current) => ({
      status: taskContextStatusFromAgentStatus(task.status),
      ...(task.status === 'completed' ? { plan: current.plan.map((item) => ({ ...item, status: 'completed' as const })) } : {}),
      ...(!active(task.status) ? { pendingApproval: undefined, pendingChanges: [] } : {}),
      ...(task.error ? { latestFailure: { summary: redact(task.error).slice(0, 4000), createdAt: this.now() } } : {}),
      ...(verification ? {
        verification: [...current.verification, {
          id: randomUUID(),
          type: 'automatic',
          command: `pnpm run ${verification.value.script}`,
          result: verification.result,
          exitCode: verification.result === 'passed' ? 0 : verification.result === 'failed' ? 1 : null,
          summary: redact(verification.value.output).slice(0, 4000),
          createdAt: this.now()
        }]
      } : {})
    }));
  }

  private releaseWriteLock(taskId: string): void {
    const live = this.live.get(taskId);
    if (!live) return;
    try {
      this.workspaceLocks.releaseWrite(live.workspaceRoot, taskId);
    } catch {
      // A removed workspace cannot retain an in-memory reservation.
    }
  }

  private cleanupLiveTask(taskId: string): void {
    this.releaseWriteLock(taskId);
    this.live.delete(taskId);
  }

  private recordTool(task: AgentTask, event: AgentToolExecutionEvent): void {
    const now = this.now();
    const invocations = task.invocations ?? [];
    let invocation = invocations.find((item) => item.id === event.invocationId);
    if (!invocation) {
      invocation = { id: event.invocationId, taskId: task.id, name: event.toolName, arguments: '[已按最小必要原则省略]', status: event.status === 'running' ? 'running' : event.status === 'waiting_for_approval' ? 'waiting_for_approval' : event.status === 'waiting_for_input' ? 'waiting_for_input' : event.status === 'completed' ? 'completed' : 'failed', createdAt: now, summary: event.summary };
      invocations.push(invocation);
    } else {
      invocation.status = event.status === 'running' ? 'running' : event.status === 'waiting_for_approval' ? 'waiting_for_approval' : event.status === 'waiting_for_input' ? 'waiting_for_input' : event.status === 'completed' ? 'completed' : 'failed';
      invocation.summary = event.summary;
    }
    if (event.status === 'completed' || event.status === 'failed') invocation.finishedAt = now;
    const live = this.live.get(task.id);
    if (live && !live.countedInvocations.has(event.invocationId)) {
      live.countedInvocations.add(event.invocationId);
      live.metrics = incrementAgentTaskMetrics(live.metrics, 'toolCalls');
      const field = metricFieldForTool(event.toolName);
      if (field) live.metrics = incrementAgentTaskMetrics(live.metrics, field);
    }
    if (live && ['apply_patch', 'apply_file_changes'].includes(event.toolName) && event.status === 'completed') {
      live.wrote = true;
      try {
        this.workspaceLocks.promoteWrite(live.workspaceRoot, task.id);
      } catch {
        // The reservation was acquired before approval; keep the event record even
        // if the workspace disappeared while the approved write was finishing.
      }
    }
    task.invocations = invocations.slice(-100);
    if (event.status !== 'running') task.steps.push({ id: randomUUID(), taskId: task.id, index: task.steps.length, kind: 'tool', status: event.status === 'completed' ? 'completed' : event.status.startsWith('waiting') ? 'waiting' : 'failed', summary: `${event.toolName}：${event.summary}`, createdAt: now, finishedAt: event.status === 'completed' || event.status === 'failed' ? now : undefined, invocationId: event.invocationId });
    this.save(task);
    this.updateTaskContext(task.id, (current) => {
      const readFiles = event.toolName === 'read_file' && event.status === 'completed'
        ? (event.paths ?? []).map((path) => ({ path, readAt: now }))
        : [];
      const nextStatus = event.status === 'waiting_for_approval'
        ? 'waiting-approval' as const
        : event.status === 'waiting_for_input'
          ? 'waiting-input' as const
          : current.status;
      return {
        status: nextStatus,
        metrics: live ? cloneAgentTaskMetrics(live.metrics) : current.metrics,
        ...(readFiles.length > 0 ? { filesRead: [...current.filesRead, ...readFiles] } : {}),
        ...(event.status === 'waiting_for_approval' ? { pendingApproval: { summary: '等待用户批准精确计划', createdAt: now } } : {}),
        ...(event.status === 'waiting_for_input' ? { pendingApproval: undefined } : {})
      };
    });
  }

  private assertConcurrency(roleId: string): void {
    const tasks = this.options.store.list().filter((task) => task.roleId === roleId && active(task.status));
    if (tasks.length >= (this.options.maxReadOnlyConcurrency ?? 3)) throw new Error('Agent 任务已达到并发上限');
  }

  async start(input: AgentStartRequest, precomputedRoute?: AgentRouteDecision, resumedFromTaskId?: string): Promise<AgentStartResponse> {
    const request = sanitizeAgentStartRequest(input);
    const context = this.options.getContext();
    const execution = this.options.resolveExecutionContext
      ? this.options.resolveExecutionContext(request.sessionId)
      : { sessionId: request.sessionId ?? `${context.roleId}:default`, workspaceRoot: this.options.workspaceRoot ?? '' };
    if (!execution.workspaceRoot) throw new Error('Agent 任务需要先选择授权工作区；个人会话仍可直接进行陪伴对话');
    const mode = request.mode ?? context.settings.assistantMode;
    const route = precomputedRoute ?? await routeTurn({
      mode,
      message: request.message,
      classifyAmbiguous: this.options.classifyAmbiguous ? () => this.options.classifyAmbiguous!(request.message, context) : undefined
    });
    if (route.route !== 'agent') throw new Error('当前消息被路由为陪伴对话，请使用普通发送。');
    this.assertConcurrency(context.roleId);
    const task: AgentTask = {
      id: randomUUID(), sessionId: execution.sessionId, roleId: context.roleId,
      message: redact(request.message), mode, route, status: 'queued', createdAt: this.now(), updatedAt: this.now(), currentStep: 0,
      resumedFromTaskId,
      steps: [{ id: randomUUID(), taskId: '', index: 0, kind: 'route', status: 'completed', summary: route.explain, createdAt: this.now(), finishedAt: this.now() }]
    };
    task.steps[0].taskId = task.id;
    this.options.store.save(task);
    this.emit({ type: 'task', task, taskId: task.id, timestamp: this.now() });
    const repoMap = this.buildRepoMap(task, execution, context);
    this.initializeTaskContext(task, execution, repoMap);
    void this.execute(task, context, execution, repoMap);
    return { taskId: task.id, route };
  }

  private async execute(task: AgentTask, context: AgentServiceContext, execution: Pick<SessionExecutionContext, 'sessionId' | 'workspaceRoot'> & Partial<Omit<SessionExecutionContext, 'sessionId' | 'workspaceRoot'>>, repoMap?: RepoMap): Promise<void> {
    const controller = new AbortController();
    let runtime: AgentRuntime | null = null;
    const trust = execution.trust ?? 'untrusted';
    const allowWrite = trust !== 'read-only';
    const allowExecution = trust === 'trusted-execution';
    try {
      if (this.options.store.get(task.id)?.status === 'cancelled') return;
      const guard = new WorkspaceGuard(execution.workspaceRoot, { deniedRoots: context.live2dPath ? [context.live2dPath] : [] });
      runtime = new AgentRuntime({
        model: this.options.createModel(context),
        tools: createAgentTools(guard, this.options.executeVerification ?? runVerification, {
          allowWrite,
          allowExecution,
          beforeWrite: (_toolName) => {
            this.workspaceLocks.acquireWrite(execution.workspaceRoot, task.id, this.now());
          },
          beforeVerification: () => {
            if (!allowExecution) throw new Error('当前工作区未信任脚本执行，请先在环境信息中允许执行');
          }
        }),
        maxSteps: 8,
        overallTimeoutMs: 10 * 60_000,
        toolTimeoutMs: 30_000,
        onTool: (event) => this.recordTool(task, event),
        onContextCompaction: () => {
          const current = this.live.get(task.id);
          if (!current) return;
          current.metrics = incrementAgentTaskMetrics(current.metrics, 'contextCompactions');
          this.updateTaskContext(task.id, { metrics: cloneAgentTaskMetrics(current.metrics) });
        }
      });
      this.live.set(task.id, { runtime, controller, workspaceRoot: execution.workspaceRoot, wrote: false, changedFiles: [], trust, metrics: { ...EMPTY_AGENT_TASK_METRICS }, countedInvocations: new Set() });
      task.status = 'running';
      task.steps.push({ id: randomUUID(), taskId: task.id, index: 1, kind: 'model', status: 'started', summary: 'StarChat 已接手，正在规划后台步骤。', createdAt: this.now() });
      task.currentStep = 1;
      this.save(task);
      const repositoryContext = repoMap ? buildRepoContextSummary(repoMap) : undefined;
      const result = await runtime.run({ taskId: task.id, message: task.message, signal: controller.signal, route: task.route, ...(repositoryContext ? { repositoryContext } : {}) });
      await this.finishRuntime(task, result);
    } catch (error) {
      this.setStatus(task, 'failed', error instanceof Error ? error.message : 'Agent 执行失败');
    } finally {
      const current = this.options.store.get(task.id);
      if (!current || !['waiting_for_approval', 'waiting_for_input'].includes(current.status)) this.cleanupLiveTask(task.id);
    }
  }

  private async finishRuntime(task: AgentTask, result: Awaited<ReturnType<AgentRuntime['run']>>): Promise<void> {
    if (result.status === 'waiting_for_approval') {
      task.status = 'waiting_for_approval';
      task.approval = {
        id: randomUUID(), taskId: task.id, invocationId: result.approval.invocationId, toolName: result.approval.toolName,
        target: redact(result.approval.target), plan: redact(result.approval.plan).slice(0, 20_000),
        preview: result.approval.preview ? { ...result.approval.preview, patch: result.approval.preview.patch.slice(0, 512 * 1024) } : undefined,
        createdAt: this.now()
      };
      const live = this.live.get(task.id);
      if (live && task.approval.preview) live.changedFiles = [...task.approval.preview.files];
      task.steps.push({ id: randomUUID(), taskId: task.id, index: task.steps.length, kind: 'approval', status: 'waiting', summary: `等待批准：${task.approval.target}`, createdAt: this.now(), invocationId: result.approval.invocationId });
      this.save(task);
      this.emit({ type: 'approval', taskId: task.id, request: task.approval, timestamp: this.now() });
      this.updateTaskContext(task.id, {
        status: 'waiting-approval',
        pendingApproval: { summary: redact(task.approval.plan).slice(0, 4000), createdAt: this.now() },
        pendingChanges: task.approval.preview?.changes?.map((change, index) => ({ id: `${task.id}:change:${index}`, operation: change.operation, path: change.path, summary: redact(task.approval!.plan).slice(0, 4000), createdAt: this.now() }))
          ?? task.approval.preview?.files.map((path, index) => ({ id: `${task.id}:change:${index}`, operation: 'update' as const, path, summary: redact(task.approval!.plan).slice(0, 4000), createdAt: this.now() }))
          ?? []
      });
      return;
    }
    if (result.status === 'waiting_for_input') {
      task.status = 'waiting_for_input';
      task.input = { id: randomUUID(), taskId: task.id, invocationId: result.input.invocationId, prompt: redact(result.input.prompt).slice(0, 10_000), createdAt: this.now() };
      task.steps.push({ id: randomUUID(), taskId: task.id, index: task.steps.length, kind: 'input', status: 'waiting', summary: task.input.prompt, createdAt: this.now(), invocationId: result.input.invocationId });
      this.save(task);
      this.emit({ type: 'input', taskId: task.id, request: task.input, timestamp: this.now() });
      this.updateTaskContext(task.id, { status: 'waiting-input', pendingApproval: undefined });
      return;
    }
    if (result.status === 'completed') {
      const live = this.live.get(task.id);
      if (live?.wrote) {
        const script = automaticVerificationScript(live.workspaceRoot);
        if (script) {
          live.metrics = incrementAgentTaskMetrics(live.metrics, 'verificationRuns');
          this.updateTaskContext(task.id, { metrics: cloneAgentTaskMetrics(live.metrics) });
          if (live.trust && live.trust !== 'trusted-execution') {
            const verification: VerificationResult = { script, ok: false, output: '自动验证未运行：当前工作区未信任脚本执行。请在环境信息中允许执行后重试验证。' };
            task.steps.push({ id: randomUUID(), taskId: task.id, index: task.steps.length, kind: 'verification', status: 'waiting', summary: `自动验证 ${script}：等待工作区信任`, createdAt: this.now(), finishedAt: this.now() });
            task.result = { ...result.result, summary: redact(result.result.summary), changedFiles: live.changedFiles, verification };
          } else {
            let verification: VerificationResult;
            try {
              verification = await (this.options.executeVerification ?? runVerification)(live.workspaceRoot, script, live.controller.signal);
            } catch (error) {
              verification = { script, ok: false, output: error instanceof Error ? error.message : '自动验证无法启动' };
            }
            task.steps.push({ id: randomUUID(), taskId: task.id, index: task.steps.length, kind: 'verification', status: verification.ok ? 'completed' : 'failed', summary: `自动验证 ${script}：${verification.ok ? '通过' : '失败'}`, createdAt: this.now(), finishedAt: this.now() });
            task.result = { ...result.result, summary: redact(result.result.summary), changedFiles: live.changedFiles, verification };
            if (!verification.ok) {
              task.status = 'failed';
              task.error = `文件已写入，但自动验证失败：pnpm run ${script}`;
              task.approval = undefined;
              task.input = undefined;
              this.save(task);
              this.emit({ type: 'error', taskId: task.id, message: task.error, timestamp: this.now() });
              this.syncTerminalTaskContext(task, { value: verification, result: 'failed' });
              return;
            }
          }
        }
      }
      task.status = 'completed';
      task.result ??= { ...result.result, summary: redact(result.result.summary), ...(live?.wrote ? { changedFiles: live.changedFiles } : {}) };
      task.approval = undefined;
      task.input = undefined;
      task.steps.push({ id: randomUUID(), taskId: task.id, index: task.steps.length, kind: 'result', status: 'completed', summary: task.result.summary, createdAt: this.now(), finishedAt: this.now() });
      this.save(task);
      this.emit({ type: 'complete', taskId: task.id, result: task.result, timestamp: this.now() });
      this.syncTerminalTaskContext(task, task.result.verification ? {
        value: {
          script: task.result.verification.script,
          ok: task.result.verification.ok,
          output: task.result.verification.output ?? ''
        },
        result: task.result.verification.ok ? 'passed' : 'waiting'
      } : undefined);
      return;
    }
    this.setStatus(task, result.status, result.error);
    this.emit({ type: 'error', taskId: task.id, message: result.error, timestamp: this.now() });
  }

  async cancel(taskId: string): Promise<void> {
    const task = this.options.store.get(taskId);
    if (!task) throw new Error('Agent 任务不存在');
    const live = this.live.get(taskId);
    live?.runtime.cancel();
    live?.controller.abort();
    if (active(task.status)) this.setStatus(task, 'cancelled', '用户取消了任务');
    this.cleanupLiveTask(taskId);
  }

  async approve(taskId: string, requestId: string, approved: boolean): Promise<void> {
    const task = this.options.store.get(taskId);
    if (!task || task.status !== 'waiting_for_approval' || task.approval?.id !== requestId) throw new Error('审批请求已过期或不匹配');
    const live = this.live.get(taskId);
    if (!live) throw new Error('应用重启后任务已中断，不能继续执行');
    task.status = 'running'; task.approval = undefined; this.save(task);
    if (!approved) this.releaseWriteLock(taskId);
    try {
      await this.finishRuntime(task, await live.runtime.approve(approved, live.controller.signal));
    } catch (error) {
      this.setStatus(task, 'failed', error instanceof Error ? error.message : '审批后继续执行失败');
    }
    if (this.options.store.get(taskId)?.status !== 'waiting_for_approval' && this.options.store.get(taskId)?.status !== 'waiting_for_input') this.cleanupLiveTask(taskId);
  }

  async respond(taskId: string, requestId: string, value: string): Promise<void> {
    const task = this.options.store.get(taskId);
    if (!task || task.status !== 'waiting_for_input' || task.input?.id !== requestId) throw new Error('输入请求已过期或不匹配');
    const live = this.live.get(taskId);
    if (!live) throw new Error('应用重启后任务已中断，不能继续执行');
    task.status = 'running'; task.input = undefined; this.save(task);
    try {
      await this.finishRuntime(task, await live.runtime.respond(redact(value), live.controller.signal));
    } catch (error) {
      this.setStatus(task, 'failed', error instanceof Error ? error.message : '补充信息后继续执行失败');
    }
    if (this.options.store.get(taskId)?.status !== 'waiting_for_approval' && this.options.store.get(taskId)?.status !== 'waiting_for_input') this.cleanupLiveTask(taskId);
  }

  async retry(taskId: string): Promise<AgentStartResponse> {
    const source = this.options.store.get(taskId);
    if (!source) throw new Error('Agent 任务不存在');
    if (!['interrupted', 'failed', 'cancelled', 'timed_out'].includes(source.status)) throw new Error('只有已中断或未完成的任务可以重新执行');
    return this.start({ message: source.message, mode: source.mode, sessionId: source.sessionId }, source.route, source.id);
  }

  list(): AgentTask[] { return this.options.store.list(); }
  get(taskId: string): AgentTask | null { return this.options.store.get(taskId); }

  shutdown(): void {
    for (const task of this.options.store.list()) {
      if (!active(task.status)) continue;
      const live = this.live.get(task.id);
      live?.runtime.cancel();
      live?.controller.abort();
      this.setStatus(task, 'cancelled', '应用正在关闭，任务已停止');
      this.cleanupLiveTask(task.id);
    }
    this.workspaceLocks.clear();
  }
}
