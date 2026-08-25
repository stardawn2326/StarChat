import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AgentRouteDecision, AgentTask, AgentTaskStatus } from '../shared/agent';

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

function sanitizeTask(value: unknown): AgentTask | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Partial<AgentTask>;
  if (typeof source.id !== 'string' || typeof source.sessionId !== 'string' || typeof source.roleId !== 'string' || typeof source.message !== 'string' || !isRoute(source.route)) return null;
  if (!['auto', 'companion', 'agent'].includes(source.mode ?? '') || typeof source.createdAt !== 'number' || typeof source.updatedAt !== 'number') return null;
  if (!['queued', 'running', 'waiting_for_approval', 'waiting_for_input', 'completed', 'failed', 'cancelled', 'timed_out', 'interrupted'].includes(source.status ?? '')) return null;
  const mode = source.mode;
  const status = source.status;
  if (!mode || !status) return null;
  return clone({
    id: source.id.slice(0, 100), sessionId: source.sessionId.slice(0, 100), roleId: source.roleId.slice(0, 100),
    message: source.message.slice(0, 20_000), mode, route: source.route, status,
    createdAt: source.createdAt, updatedAt: source.updatedAt, currentStep: Math.max(0, Math.floor(source.currentStep ?? 0)),
    steps: Array.isArray(source.steps) ? source.steps.slice(-100) : [],
    invocations: Array.isArray(source.invocations) ? source.invocations.slice(-100) : [],
    approval: source.approval, input: source.input, result: source.result,
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
              task.error = '应用重启时任务未完成；首版不会自动继续执行。';
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
    const data: PersistedAgentTasks = { version: 1, tasks: [...this.tasks.values()].map(clone) };
    const temporary = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;
    writeFileSync(temporary, JSON.stringify(data, null, 2), 'utf8');
    renameSync(temporary, this.filePath);
  }
}
