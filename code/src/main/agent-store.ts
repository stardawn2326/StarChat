import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AgentChangePreview, AgentInterruptionReason, AgentRouteDecision, AgentTask, AgentTaskStatus } from '../shared/agent';

interface PersistedAgentTasks {
  version: 1;
  tasks: AgentTask[];
}

const ACTIVE_STATUSES: readonly AgentTaskStatus[] = ['queued', 'running', 'waiting_for_approval', 'waiting_for_input'];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRoute(value: unknown): value is AgentRouteDecision {
  if (!value || typeof value !== 'object') return false;
  const route = value as Partial<AgentRouteDecision>;
  return (route.route === 'agent' || route.route === 'companion') &&
    ['forced', 'deterministic', 'classifier', 'safe-fallback'].includes(route.method ?? '') &&
    typeof route.explain === 'string';
}

function interruptionReason(value: unknown): AgentInterruptionReason | undefined {
  return ['application-restart', 'runtime-lost', 'workspace-unavailable', 'approval-expired', 'input-expired'].includes(value as string)
    ? value as AgentInterruptionReason
    : undefined;
}

function sanitizePreview(preview: AgentChangePreview): AgentChangePreview {
  const changes = Array.isArray(preview.changes)
    ? preview.changes.filter((change) => change && typeof change.path === 'string' && ['create', 'update', 'delete'].includes(change.operation)).slice(0, 50)
    : undefined;
  return {
    files: preview.files.filter((path): path is string => typeof path === 'string').slice(0, 100).map((path) => path.slice(0, 2000)),
    patch: typeof preview.patch === 'string' ? preview.patch.slice(0, 512 * 1024) : '',
    additions: Math.max(0, Math.floor(preview.additions)),
    deletions: Math.max(0, Math.floor(preview.deletions)),
    ...(changes && changes.length > 0 ? { changes } : {}),
    ...(typeof preview.changeSetId === 'string' ? { changeSetId: preview.changeSetId.slice(0, 160) } : {})
  };
}

function persistedTask(task: AgentTask): AgentTask {
  const copy = clone(task);
  if (copy.approval?.preview) {
    copy.approval.preview.patch = '[审批补丁正文不持久化；重启后必须重新预览]';
  }
  return copy;
}

function sanitizeTask(value: unknown): AgentTask | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Partial<AgentTask>;
  if (typeof source.id !== 'string' || typeof source.sessionId !== 'string' || typeof source.roleId !== 'string' || typeof source.message !== 'string' || !isRoute(source.route)) return null;
  if (!['auto', 'companion', 'agent'].includes(source.mode ?? '') || typeof source.createdAt !== 'number' || typeof source.updatedAt !== 'number') return null;
  if (!['queued', 'running', 'waiting_for_approval', 'waiting_for_input', 'completed', 'failed', 'cancelled', 'timed_out', 'interrupted'].includes(source.status ?? '')) return null;
  const mode = source.mode;
  const status = source.status;
  if (!mode || !status) return null;
  const interruptionReasonValue = interruptionReason(source.interruptionReason);
  return clone({
    id: source.id.slice(0, 100), sessionId: source.sessionId.slice(0, 100), roleId: source.roleId.slice(0, 100),
    message: source.message.slice(0, 20_000), mode, route: source.route, status,
    ...(interruptionReasonValue ? { interruptionReason: interruptionReasonValue } : {}),
    createdAt: source.createdAt, updatedAt: source.updatedAt, currentStep: Math.max(0, Math.floor(source.currentStep ?? 0)),
    resumedFromTaskId: typeof source.resumedFromTaskId === 'string' ? source.resumedFromTaskId.slice(0, 100) : undefined,
    steps: Array.isArray(source.steps) ? source.steps.slice(-100) : [],
    invocations: Array.isArray(source.invocations) ? source.invocations.slice(-100) : [],
    approval: source.approval ? {
      ...source.approval,
      target: source.approval.target.slice(0, 2000),
      plan: source.approval.plan.slice(0, 20_000),
      preview: source.approval.preview ? {
        ...sanitizePreview(source.approval.preview)
      } : undefined
    } : undefined,
    input: source.input, result: source.result,
    error: typeof source.error === 'string' ? source.error.slice(0, 2000) : undefined
  });
}

export class AgentStore {
  private readonly filePath: string;
  private readonly tasks = new Map<string, AgentTask>();

  constructor(filePath: string) {
    this.filePath = filePath;
    mkdirSync(dirname(filePath), { recursive: true });
    let dirty = false;
    if (existsSync(filePath)) {
      try {
        const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'));
        if (parsed && typeof parsed === 'object' && (parsed as { version?: unknown }).version === 1 && Array.isArray((parsed as { tasks?: unknown }).tasks)) {
          for (const raw of (parsed as { tasks: unknown[] }).tasks) {
            const task = sanitizeTask(raw);
            if (!task) continue;
            if (ACTIVE_STATUSES.includes(task.status)) {
              task.status = 'interrupted';
              task.interruptionReason = 'application-restart';
              task.error = '应用重启时任务未完成；可在任务管理中重新执行。';
              task.approval = undefined;
              task.input = undefined;
              task.invocations = task.invocations?.map((invocation) => {
                if (!['queued', 'running', 'waiting_for_approval', 'waiting_for_input'].includes(invocation.status)) return invocation;
                return { ...invocation, status: 'cancelled' as const, finishedAt: Date.now(), summary: '应用重启后未继续执行' };
              });
              task.updatedAt = Date.now();
              dirty = true;
            }
            this.tasks.set(task.id, task);
          }
        } else {
          dirty = true;
        }
      } catch {
        dirty = true;
      }
    }
    if (dirty || !existsSync(filePath)) this.flush();
  }

  list(): AgentTask[] {
    return [...this.tasks.values()].sort((a, b) => b.updatedAt - a.updatedAt).map(clone);
  }

  get(id: string): AgentTask | null {
    const task = this.tasks.get(id);
    return task ? clone(task) : null;
  }

  save(task: AgentTask): void {
    const sanitized = sanitizeTask(task);
    if (!sanitized) throw new Error('Agent 任务契约无效');
    this.tasks.set(sanitized.id, sanitized);
    this.flush();
  }

  delete(id: string): void {
    this.tasks.delete(id);
    this.flush();
  }

  private flush(): void {
    const data: PersistedAgentTasks = { version: 1, tasks: [...this.tasks.values()].map(persistedTask) };
    const temporary = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;
    writeFileSync(temporary, JSON.stringify(data, null, 2), 'utf8');
    renameSync(temporary, this.filePath);
  }
}
