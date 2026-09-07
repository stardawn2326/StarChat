import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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
  resolveExecutionContext?: (sessionId?: string) => { sessionId: string; workspaceRoot: string };
  getContext: () => AgentServiceContext;
  createModel: (context: AgentServiceContext) => AgentModel;
  classifyAmbiguous?: (message: string, context: AgentServiceContext) => Promise<'agent' | 'companion'>;
  emit?: (event: AgentEvent) => void;
  now?: () => number;
  maxReadOnlyConcurrency?: number;
  executeVerification?: (root: string, script: string, signal: AbortSignal) => Promise<VerificationResult>;
}

interface LiveTask {
  runtime: AgentRuntime;
  controller: AbortController;
  readOnly: boolean;
  workspaceRoot: string;
  wrote: boolean;
  changedFiles: string[];
}

function automaticVerificationScript(workspaceRoot: string): string | null {
  const packagePath = join(workspaceRoot, 'package.json');
  if (!existsSync(packagePath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(packagePath, 'utf8')) as { scripts?: Record<string, unknown> };
    for (const script of ['typecheck', 'test', 'build']) {
      if (typeof parsed.scripts?.[script] === 'string') return script;
    }
  } catch {
    return null;
  }
  return null;
}

function active(status: AgentTaskStatus): boolean {
  return status === 'queued' || status === 'running' || status === 'waiting_for_approval' || status === 'waiting_for_input';
}

function likelyWrite(message: string): boolean {
  return /(修改|修复|实现|新增|删除|重构|补丁|写入|运行.*并修复)/iu.test(message);
}

export class AgentService {
  private readonly options: AgentServiceOptions;
  private readonly live = new Map<string, LiveTask>();

  constructor(options: AgentServiceOptions) {
    this.options = options;
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  private emit(event: AgentEvent): void {
    this.options.emit?.(event);
  }

  private save(task: AgentTask): void {
    task.updatedAt = this.now();
    this.options.store.save(task);
    this.emit({ type: 'task', task: this.options.store.get(task.id) ?? task, taskId: task.id, timestamp: this.now() });
  }

  private setStatus(task: AgentTask, status: AgentTaskStatus, error?: string): void {
    task.status = status;
    if (error) task.error = redact(error);
    this.save(task);
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
    if (live && event.toolName === 'apply_patch' && event.status === 'completed') live.wrote = true;
    task.invocations = invocations.slice(-100);
    if (event.status !== 'running') task.steps.push({ id: randomUUID(), taskId: task.id, index: task.steps.length, kind: 'tool', status: event.status === 'completed' ? 'completed' : event.status.startsWith('waiting') ? 'waiting' : 'failed', summary: `${event.toolName}：${event.summary}`, createdAt: now, finishedAt: event.status === 'completed' || event.status === 'failed' ? now : undefined, invocationId: event.invocationId });
    this.save(task);
  }

  private assertConcurrency(roleId: string, readOnly: boolean): void {
    const tasks = this.options.store.list().filter((task) => task.roleId === roleId && active(task.status));
    if (readOnly) {
      const readOnlyActive = tasks.filter((task) => !likelyWrite(task.message)).length;
      if (readOnlyActive >= (this.options.maxReadOnlyConcurrency ?? 3)) throw new Error('只读 Agent 任务已达到并发上限');
      if (tasks.some((task) => likelyWrite(task.message))) throw new Error('当前角色已有写任务运行，请等待其完成');
    } else if (tasks.length > 0) {
      throw new Error('当前角色已有任务运行；写任务默认互斥。');
    }
  }

  async start(input: AgentStartRequest, precomputedRoute?: AgentRouteDecision, resumedFromTaskId?: string): Promise<AgentStartResponse> {
    const request = sanitizeAgentStartRequest(input);
    const context = this.options.getContext();
    const execution = this.options.resolveExecutionContext
      ? this.options.resolveExecutionContext(request.sessionId)
      : { sessionId: request.sessionId ?? `${context.roleId}:default`, workspaceRoot: this.options.workspaceRoot ?? '' };
    if (!execution.workspaceRoot) throw new Error('请先选择授权工作区');
    const mode = request.mode ?? context.settings.assistantMode;
    const route = precomputedRoute ?? await routeTurn({
      mode,
      message: request.message,
      classifyAmbiguous: this.options.classifyAmbiguous ? () => this.options.classifyAmbiguous!(request.message, context) : undefined
    });
    if (route.route !== 'agent') throw new Error('当前消息被路由为陪伴对话，请使用普通发送。');
    const readOnly = !likelyWrite(request.message);
    this.assertConcurrency(context.roleId, readOnly);
    const task: AgentTask = {
      id: randomUUID(), sessionId: execution.sessionId, roleId: context.roleId,
      message: redact(request.message), mode, route, status: 'queued', createdAt: this.now(), updatedAt: this.now(), currentStep: 0,
      resumedFromTaskId,
      steps: [{ id: randomUUID(), taskId: '', index: 0, kind: 'route', status: 'completed', summary: route.explain, createdAt: this.now(), finishedAt: this.now() }]
    };
    task.steps[0].taskId = task.id;
    this.options.store.save(task);
    this.emit({ type: 'task', task, taskId: task.id, timestamp: this.now() });
    void this.execute(task, context, readOnly, execution.workspaceRoot);
    return { taskId: task.id, route };
  }

  private async execute(task: AgentTask, context: AgentServiceContext, readOnly: boolean, workspaceRoot: string): Promise<void> {
    const controller = new AbortController();
    let runtime: AgentRuntime | null = null;
    try {
      if (this.options.store.get(task.id)?.status === 'cancelled') return;
      const guard = new WorkspaceGuard(workspaceRoot, { deniedRoots: context.live2dPath ? [context.live2dPath] : [] });
      runtime = new AgentRuntime({ model: this.options.createModel(context), tools: createAgentTools(guard), maxSteps: 8, overallTimeoutMs: 10 * 60_000, toolTimeoutMs: 30_000, onTool: (event) => this.recordTool(task, event) });
      this.live.set(task.id, { runtime, controller, readOnly, workspaceRoot, wrote: false, changedFiles: [] });
      task.status = 'running';
      task.steps.push({ id: randomUUID(), taskId: task.id, index: 1, kind: 'model', status: 'started', summary: 'StarChat 已接手，正在规划后台步骤。', createdAt: this.now() });
      task.currentStep = 1;
      this.save(task);
      const result = await runtime.run({ taskId: task.id, message: task.message, signal: controller.signal, route: task.route });
      await this.finishRuntime(task, result);
    } catch (error) {
      this.setStatus(task, 'failed', error instanceof Error ? error.message : 'Agent 执行失败');
    } finally {
      const current = this.options.store.get(task.id);
      if (!current || !['waiting_for_approval', 'waiting_for_input'].includes(current.status)) this.live.delete(task.id);
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
      return;
    }
    if (result.status === 'waiting_for_input') {
      task.status = 'waiting_for_input';
      task.input = { id: randomUUID(), taskId: task.id, invocationId: result.input.invocationId, prompt: redact(result.input.prompt).slice(0, 10_000), createdAt: this.now() };
      task.steps.push({ id: randomUUID(), taskId: task.id, index: task.steps.length, kind: 'input', status: 'waiting', summary: task.input.prompt, createdAt: this.now(), invocationId: result.input.invocationId });
      this.save(task);
      this.emit({ type: 'input', taskId: task.id, request: task.input, timestamp: this.now() });
      return;
    }
    if (result.status === 'completed') {
      const live = this.live.get(task.id);
      if (live?.wrote) {
        const script = automaticVerificationScript(live.workspaceRoot);
        if (script) {
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
            return;
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
    this.live.delete(taskId);
  }

  async approve(taskId: string, requestId: string, approved: boolean): Promise<void> {
    const task = this.options.store.get(taskId);
    if (!task || task.status !== 'waiting_for_approval' || task.approval?.id !== requestId) throw new Error('审批请求已过期或不匹配');
    const live = this.live.get(taskId);
    if (!live) throw new Error('应用重启后任务已中断，不能继续执行');
    task.status = 'running'; task.approval = undefined; this.save(task);
    try {
      await this.finishRuntime(task, await live.runtime.approve(approved, live.controller.signal));
    } catch (error) {
      this.setStatus(task, 'failed', error instanceof Error ? error.message : '审批后继续执行失败');
    }
    if (this.options.store.get(taskId)?.status !== 'waiting_for_approval' && this.options.store.get(taskId)?.status !== 'waiting_for_input') this.live.delete(taskId);
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
    if (this.options.store.get(taskId)?.status !== 'waiting_for_approval' && this.options.store.get(taskId)?.status !== 'waiting_for_input') this.live.delete(taskId);
  }

  async retry(taskId: string): Promise<AgentStartResponse> {
    const source = this.options.store.get(taskId);
    if (!source) throw new Error('Agent 任务不存在');
    if (!['interrupted', 'failed', 'cancelled', 'timed_out'].includes(source.status)) throw new Error('只有已中断或未完成的任务可以重新执行');
    return this.start({ message: source.message, mode: source.mode, sessionId: source.sessionId }, source.route, source.id);
  }

  list(): AgentTask[] { return this.options.store.list(); }
  get(taskId: string): AgentTask | null { return this.options.store.get(taskId); }
}
