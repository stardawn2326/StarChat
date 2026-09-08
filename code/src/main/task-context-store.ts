import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AgentTaskMetrics } from '../shared/agent-metrics';
import { cloneAgentTaskMetrics, EMPTY_AGENT_TASK_METRICS } from '../shared/agent-metrics';
import type { RepoMap } from '../shared/repo-map';
import type {
  FileReadRecord,
  PendingChange,
  TaskContext,
  TaskContextStatus,
  TaskFinding,
  TaskPlanItem,
  VerificationRecord
} from '../shared/task-context';
import { isSensitiveWorkspacePath } from './agent-security';

const MAX_CONTEXTS = 100;
const MAX_PLAN_ITEMS = 50;
const MAX_FILES_READ = 500;
const MAX_FINDINGS = 200;
const MAX_PENDING_CHANGES = 100;
const MAX_VERIFICATIONS = 100;
const MAX_USER_CONSTRAINTS = 50;
const MAX_TEXT = 20_000;
const DEFAULT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const TASK_CONTEXT_STATUSES: readonly TaskContextStatus[] = ['running', 'waiting-approval', 'waiting-input', 'interrupted', 'completed', 'failed'];
const PLAN_STATUSES: readonly TaskPlanItem['status'][] = ['pending', 'in-progress', 'completed', 'blocked'];
const FINDING_TYPES: readonly TaskFinding['type'][] = ['project', 'file', 'test', 'risk', 'decision'];
const VERIFICATION_RESULTS: readonly VerificationRecord['result'][] = ['passed', 'failed', 'skipped', 'waiting'];

interface PersistedTaskContexts {
  version: 1;
  contexts: unknown[];
}

export interface TaskContextStoreOptions {
  maxContexts?: number;
  maxAgeMs?: number;
  now?: () => number;
}

export type TaskContextCreateInput = Omit<TaskContext, 'createdAt' | 'updatedAt'> & Partial<Pick<TaskContext, 'createdAt' | 'updatedAt'>>;
export type TaskContextPatch = Partial<Omit<TaskContext, 'taskId' | 'workspaceId' | 'createdAt' | 'updatedAt'>>;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function text(value: unknown, maximum = MAX_TEXT): string {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function redactText(value: unknown, maximum = MAX_TEXT): string {
  return text(value, maximum)
    .replace(/sk-[A-Za-z0-9_-]{12,}/gu, '[REDACTED_API_KEY]')
    .replace(/(bearer\s+)[^\s,;]+/giu, '$1[REDACTED]')
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|passwd|secret|private[_-]?key|authorization|bearer|token)\s*[:=]\s*)[^\s,;]+/giu, '$1[REDACTED]');
}

function id(value: unknown, maximum = 160): string {
  return text(value, maximum);
}

function timestamp(value: unknown, fallback: number): number {
  return Number.isFinite(value) ? Math.max(0, Number(value)) : fallback;
}

function relativePath(value: unknown): string | null {
  const candidate = text(value, 2000).replaceAll('\\', '/');
  if (!candidate || candidate.startsWith('/') || candidate.startsWith('//') || /^[A-Za-z]:/u.test(candidate) || candidate.split('/').some((part) => part === '..') || isSensitiveWorkspacePath(candidate)) return null;
  return candidate;
}

function status(value: unknown): TaskContextStatus {
  return TASK_CONTEXT_STATUSES.includes(value as TaskContextStatus) ? value as TaskContextStatus : 'running';
}

function metrics(value: unknown): AgentTaskMetrics {
  if (!value || typeof value !== 'object') return { ...EMPTY_AGENT_TASK_METRICS };
  const source = value as Partial<AgentTaskMetrics>;
  return cloneAgentTaskMetrics({
    toolCalls: Number(source.toolCalls),
    readFileCalls: Number(source.readFileCalls),
    searchCalls: Number(source.searchCalls),
    writeCalls: Number(source.writeCalls),
    verificationRuns: Number(source.verificationRuns),
    contextCompactions: Number(source.contextCompactions)
  });
}

function sanitizePlan(value: unknown): TaskPlanItem[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (!item || typeof item !== 'object') return null;
    const source = item as Partial<TaskPlanItem>;
    const itemId = id(source.id);
    const itemText = redactText(source.text, 2000);
    if (!itemId || !itemText) return null;
    return { id: itemId, text: itemText, status: PLAN_STATUSES.includes(source.status as TaskPlanItem['status']) ? source.status as TaskPlanItem['status'] : 'pending' };
  }).filter((item): item is TaskPlanItem => Boolean(item)).slice(-MAX_PLAN_ITEMS);
}

function sanitizeFilesRead(value: unknown): FileReadRecord[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === 'string') {
      const path = relativePath(item);
      return path ? { path, readAt: Date.now() } : null;
    }
    if (!item || typeof item !== 'object') return null;
    const source = item as Partial<FileReadRecord>;
    const path = relativePath(source.path);
    if (!path) return null;
    const hash = /^[A-Fa-f0-9]{16,128}$/u.test(text(source.hash, 128)) ? text(source.hash, 128).toLocaleLowerCase() : undefined;
    return { path, readAt: timestamp(source.readAt, Date.now()), ...(hash ? { hash } : {}) };
  }).filter((item): item is FileReadRecord => Boolean(item)).slice(-MAX_FILES_READ);
}

function sanitizeFindings(value: unknown): TaskFinding[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (!item || typeof item !== 'object') return null;
    const source = item as Partial<TaskFinding>;
    const findingId = id(source.id);
    const summary = redactText(source.summary, 4000);
    if (!findingId || !summary || !FINDING_TYPES.includes(source.type as TaskFinding['type'])) return null;
    const sourcePath = relativePath(source.sourcePath);
    return { id: findingId, type: source.type as TaskFinding['type'], summary, ...(sourcePath ? { sourcePath } : {}), createdAt: timestamp(source.createdAt, Date.now()) };
  }).filter((item): item is TaskFinding => Boolean(item)).slice(-MAX_FINDINGS);
}

function sanitizePendingChanges(value: unknown): PendingChange[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (!item || typeof item !== 'object') return null;
    const source = item as Partial<PendingChange>;
    const changeId = id(source.id);
    const path = relativePath(source.path);
    const summary = redactText(source.summary, 4000);
    if (!changeId || !path || !summary || !['create', 'update', 'delete'].includes(source.operation as string)) return null;
    const contentHash = /^[A-Fa-f0-9]{16,128}$/u.test(text(source.contentHash, 128)) ? text(source.contentHash, 128).toLocaleLowerCase() : undefined;
    return { id: changeId, operation: source.operation as PendingChange['operation'], path, summary, ...(contentHash ? { contentHash } : {}), createdAt: timestamp(source.createdAt, Date.now()) };
  }).filter((item): item is PendingChange => Boolean(item)).slice(-MAX_PENDING_CHANGES);
}

function sanitizeVerifications(value: unknown): VerificationRecord[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (!item || typeof item !== 'object') return null;
    const source = item as Partial<VerificationRecord>;
    const recordId = id(source.id);
    const type = redactText(source.type, 100);
    const command = redactText(source.command, 500);
    const summary = redactText(source.summary, 4000);
    if (!recordId || !type || !command || !summary || !VERIFICATION_RESULTS.includes(source.result as VerificationRecord['result'])) return null;
    const exitCode = source.exitCode === null ? null : Number.isFinite(source.exitCode) ? Math.trunc(Number(source.exitCode)) : undefined;
    return { id: recordId, type, command, result: source.result as VerificationRecord['result'], ...(exitCode === undefined ? {} : { exitCode }), summary, createdAt: timestamp(source.createdAt, Date.now()) };
  }).filter((item): item is VerificationRecord => Boolean(item)).slice(-MAX_VERIFICATIONS);
}

function sanitizeRepoMap(value: unknown): RepoMap | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as Partial<RepoMap>;
  const workspaceId = id(source.workspaceId);
  const workspaceRoot = text(source.workspaceRoot, 2000);
  const projectRoot = text(source.projectRoot, 2000);
  if (!workspaceId || !workspaceRoot || !projectRoot) return undefined;
  const paths = (items: unknown): string[] => Array.isArray(items) ? items.map(relativePath).filter((item): item is string => Boolean(item)).slice(0, 200) : [];
  const importantFiles = Array.isArray(source.importantFiles) ? source.importantFiles.map((item) => {
    if (!item || typeof item !== 'object') return null;
    const entry = item as Partial<RepoMap['importantFiles'][number]>;
    const path = relativePath(entry.path);
    if (!path || !['source', 'test', 'config', 'manifest', 'doc'].includes(entry.kind as string)) return null;
    return { path, kind: entry.kind as RepoMap['importantFiles'][number]['kind'], size: Number.isFinite(entry.size) ? Math.max(0, Math.trunc(Number(entry.size))) : 0 };
  }).filter((item): item is RepoMap['importantFiles'][number] => Boolean(item)).slice(0, 200) : [];
  const languageStats: Record<string, number> = {};
  if (source.languageStats && typeof source.languageStats === 'object') {
    for (const [language, count] of Object.entries(source.languageStats)) {
      if (/^[a-z0-9+#-]{1,20}$/iu.test(language) && Number.isFinite(count)) languageStats[language] = Math.max(0, Math.trunc(Number(count)));
    }
  }
  const limits = source.limits && typeof source.limits === 'object' ? {
    maxDepth: Math.max(0, Math.trunc(Number(source.limits.maxDepth))),
    maxEntries: Math.max(1, Math.trunc(Number(source.limits.maxEntries))),
    timeoutMs: Math.max(1, Math.trunc(Number(source.limits.timeoutMs)))
  } : undefined;
  return {
    workspaceId,
    workspaceRoot,
    projectRoot,
    projectType: text(source.projectType, 100) || 'unknown',
    ...(text(source.packageManager, 50) ? { packageManager: text(source.packageManager, 50) } : {}),
    sourceRoots: paths(source.sourceRoots),
    testRoots: paths(source.testRoots),
    configFiles: paths(source.configFiles),
    importantFiles,
    languageStats,
    generatedAt: timestamp(source.generatedAt, Date.now()),
    ...(source.partial ? { partial: true } : {}),
    ...(source.unavailable ? { unavailable: true } : {}),
    ...(Array.isArray(source.warnings) ? { warnings: source.warnings.map((item) => redactText(item, 500)).filter(Boolean).slice(0, 20) } : {}),
    ...(limits ? { limits } : {})
  };
}

function sanitizeContext(value: unknown, fallbackNow: number): TaskContext | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Partial<TaskContext>;
  const taskId = id(source.taskId);
  const workspaceId = id(source.workspaceId);
  const userRequest = redactText(source.userRequest, MAX_TEXT);
  if (!taskId || !workspaceId || !userRequest) return null;
  const latestFailure = source.latestFailure && typeof source.latestFailure === 'object' && redactText(source.latestFailure.summary, 4000)
    ? { summary: redactText(source.latestFailure.summary, 4000), createdAt: timestamp(source.latestFailure.createdAt, fallbackNow) }
    : undefined;
  const pendingApproval = source.pendingApproval && typeof source.pendingApproval === 'object' && redactText(source.pendingApproval.summary, 4000)
    ? { summary: redactText(source.pendingApproval.summary, 4000), createdAt: timestamp(source.pendingApproval.createdAt, fallbackNow) }
    : undefined;
  return {
    taskId,
    workspaceId,
    userRequest,
    plan: sanitizePlan(source.plan),
    filesRead: sanitizeFilesRead(source.filesRead),
    findings: sanitizeFindings(source.findings),
    pendingChanges: sanitizePendingChanges(source.pendingChanges),
    verification: sanitizeVerifications(source.verification),
    metrics: metrics(source.metrics),
    status: status(source.status),
    createdAt: timestamp(source.createdAt, fallbackNow),
    updatedAt: timestamp(source.updatedAt, fallbackNow),
    ...(sanitizeRepoMap(source.repoMap) ? { repoMap: sanitizeRepoMap(source.repoMap) } : {}),
    ...(latestFailure ? { latestFailure } : {}),
    ...(pendingApproval ? { pendingApproval } : {}),
    ...(Array.isArray(source.userConstraints) ? { userConstraints: source.userConstraints.map((item) => redactText(item, 2000)).filter(Boolean).slice(-MAX_USER_CONSTRAINTS) } : {})
  };
}

export class TaskContextStore {
  private readonly filePath: string;
  private readonly contexts = new Map<string, TaskContext>();
  private readonly maxContexts: number;
  private readonly maxAgeMs: number;
  private readonly now: () => number;

  constructor(filePath: string, options: TaskContextStoreOptions = {}) {
    this.filePath = filePath;
    this.maxContexts = Math.max(1, Math.floor(options.maxContexts ?? MAX_CONTEXTS));
    this.maxAgeMs = Math.max(0, Math.floor(options.maxAgeMs ?? DEFAULT_MAX_AGE_MS));
    this.now = options.now ?? (() => Date.now());
    mkdirSync(dirname(filePath), { recursive: true });
    this.load();
  }

  create(input: TaskContextCreateInput): TaskContext {
    const context = sanitizeContext({ ...input, createdAt: input.createdAt ?? this.now(), updatedAt: input.updatedAt ?? this.now() }, this.now());
    if (!context) throw new Error('任务上下文契约无效');
    this.contexts.set(context.taskId, context);
    this.prune();
    this.flush();
    return clone(context);
  }

  get(taskId: string): TaskContext | null {
    const context = this.contexts.get(taskId);
    return context ? clone(context) : null;
  }

  read(taskId: string): TaskContext | null {
    return this.get(taskId);
  }

  list(workspaceId?: string): TaskContext[] {
    return [...this.contexts.values()]
      .filter((context) => !workspaceId || context.workspaceId === workspaceId)
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .map(clone);
  }

  update(taskId: string, patch: TaskContextPatch | ((current: TaskContext) => TaskContextPatch)): TaskContext {
    const current = this.contexts.get(taskId);
    if (!current) throw new Error('任务上下文不存在');
    const nextPatch = typeof patch === 'function' ? patch(clone(current)) : patch;
    const context = sanitizeContext({ ...current, ...nextPatch, taskId: current.taskId, workspaceId: current.workspaceId, createdAt: current.createdAt, updatedAt: this.now() }, this.now());
    if (!context) throw new Error('任务上下文更新无效');
    this.contexts.set(taskId, context);
    this.prune();
    this.flush();
    return clone(context);
  }

  markCompleted(taskId: string): TaskContext {
    return this.update(taskId, { status: 'completed', pendingApproval: undefined });
  }

  markInterrupted(taskId: string, reason = '应用重启时任务未完成'): TaskContext {
    return this.update(taskId, { status: 'interrupted', latestFailure: { summary: redactText(reason, 4000), createdAt: this.now() }, pendingApproval: undefined });
  }

  delete(taskId: string): void {
    this.contexts.delete(taskId);
    this.flush();
  }

  prune(): number {
    const before = this.contexts.size;
    const cutoff = this.now() - this.maxAgeMs;
    for (const [taskId, context] of this.contexts) {
      if (['running', 'waiting-approval', 'waiting-input'].includes(context.status)) continue;
      if (context.updatedAt < cutoff) this.contexts.delete(taskId);
    }
    if (this.contexts.size > this.maxContexts) {
      const removable = [...this.contexts.values()]
        .filter((context) => !['running', 'waiting-approval', 'waiting-input'].includes(context.status))
        .sort((left, right) => left.updatedAt - right.updatedAt);
      for (const context of removable) {
        if (this.contexts.size <= this.maxContexts) break;
        this.contexts.delete(context.taskId);
      }
    }
    return before - this.contexts.size;
  }

  private load(): void {
    if (!existsSync(this.filePath)) return;
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<PersistedTaskContexts>;
      if (parsed.version !== 1 || !Array.isArray(parsed.contexts)) return;
      for (const raw of parsed.contexts) {
        const context = sanitizeContext(raw, this.now());
        if (context) this.contexts.set(context.taskId, context);
      }
      if (this.prune() > 0) this.flush();
    } catch {
      this.contexts.clear();
    }
  }

  private flush(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const data: PersistedTaskContexts = { version: 1, contexts: [...this.contexts.values()].map(clone) };
    const temporary = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;
    writeFileSync(temporary, JSON.stringify(data, null, 2), 'utf8');
    renameSync(temporary, this.filePath);
  }
}
