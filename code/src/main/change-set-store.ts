import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ChangeSet, ChangeSetEntry, ChangeSetState } from '../shared/change-set';
import { MAX_CHANGESET_ENTRIES, MAX_CHANGESET_PATH_CHARS } from '../shared/change-set';
import { isSensitiveWorkspacePath } from './agent-security';

const STATES: readonly ChangeSetState[] = ['draft', 'waiting-approval', 'approved', 'applied', 'apply-failed', 'partial-failure', 'rejected', 'invalidated'];
const MAX_STORED_CHANGESETS = 200;

interface PersistedChangeSets {
  version: 1;
  changeSets: unknown[];
}

export interface ChangeSetStoreOptions {
  maxChangeSets?: number;
  now?: () => number;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function text(value: unknown, maximum: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function timestamp(value: unknown, fallback: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(Number(value))) : fallback;
}

function safeId(value: unknown): string {
  return text(value, 160);
}

function safePath(value: unknown): string | null {
  const path = text(value, MAX_CHANGESET_PATH_CHARS).replaceAll('\\', '/');
  if (!path || path.startsWith('/') || path.startsWith('//') || /^[A-Za-z]:/u.test(path) || path.split('/').some((part) => part === '..') || isSensitiveWorkspacePath(path)) return null;
  return path;
}

function hash(value: unknown): string | null {
  if (value === null) return null;
  const candidate = text(value, 64).toLocaleLowerCase();
  return /^[a-f0-9]{64}$/u.test(candidate) ? candidate : null;
}

function count(value: unknown): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(Number(value))) : 0;
}

function sanitizeEntry(value: unknown): ChangeSetEntry | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Partial<ChangeSetEntry>;
  const path = safePath(source.path);
  const operation = source.operation;
  const beforeHash = hash(source.beforeHash);
  const afterHash = hash(source.afterHash);
  const diffHash = hash(source.diffHash);
  if (!path || !['create', 'update', 'delete'].includes(operation ?? '') || !diffHash) return null;
  if (operation === 'create' && beforeHash !== null) return null;
  if (operation === 'delete' && afterHash !== null) return null;
  if (operation === 'update' && (beforeHash === null || afterHash === null)) return null;
  return { path, operation: operation as ChangeSetEntry['operation'], beforeHash, afterHash, diffHash, additions: count(source.additions), deletions: count(source.deletions) };
}

function sanitizeChangeSet(value: unknown, fallbackNow: number): ChangeSet | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Partial<ChangeSet>;
  const id = safeId(source.id);
  const taskId = safeId(source.taskId);
  const workspaceId = safeId(source.workspaceId);
  const invocationId = safeId(source.invocationId);
  const entries = Array.isArray(source.entries) ? source.entries.map(sanitizeEntry).filter((entry): entry is ChangeSetEntry => Boolean(entry)).slice(0, MAX_CHANGESET_ENTRIES) : [];
  if (!id || !taskId || !workspaceId || !invocationId || entries.length === 0 || !STATES.includes(source.state as ChangeSetState)) return null;
  return { id, taskId, workspaceId, invocationId, entries, state: source.state as ChangeSetState, createdAt: timestamp(source.createdAt, fallbackNow), updatedAt: timestamp(source.updatedAt, fallbackNow) };
}

export class ChangeSetStore {
  private readonly filePath: string;
  private readonly changeSets = new Map<string, ChangeSet>();
  private readonly maxChangeSets: number;
  private readonly now: () => number;

  constructor(filePath: string, options: ChangeSetStoreOptions = {}) {
    this.filePath = filePath;
    this.maxChangeSets = Math.max(1, Math.min(MAX_STORED_CHANGESETS, Math.floor(options.maxChangeSets ?? MAX_STORED_CHANGESETS)));
    this.now = options.now ?? (() => Date.now());
    mkdirSync(dirname(filePath), { recursive: true });
    this.load();
  }

  create(changeSet: ChangeSet): ChangeSet {
    const sanitized = sanitizeChangeSet(changeSet, this.now());
    if (!sanitized) throw new Error('ChangeSet 契约无效');
    if (this.changeSets.has(sanitized.id)) throw new Error('ChangeSet 已存在');
    this.changeSets.set(sanitized.id, sanitized);
    this.prune();
    this.flush();
    return clone(sanitized);
  }

  get(id: string): ChangeSet | null {
    const changeSet = this.changeSets.get(id);
    return changeSet ? clone(changeSet) : null;
  }

  list(taskId?: string): ChangeSet[] {
    return [...this.changeSets.values()]
      .filter((changeSet) => !taskId || changeSet.taskId === taskId)
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .map(clone);
  }

  findByInvocation(taskId: string, invocationId: string): ChangeSet | null {
    return this.list(taskId).find((changeSet) => changeSet.invocationId === invocationId) ?? null;
  }

  update(id: string, patch: Pick<ChangeSet, 'state'> | Partial<Pick<ChangeSet, 'state'>>): ChangeSet {
    const current = this.changeSets.get(id);
    if (!current || !STATES.includes(patch.state as ChangeSetState)) throw new Error('ChangeSet 不存在或状态无效');
    const next = sanitizeChangeSet({ ...current, state: patch.state, updatedAt: this.now() }, this.now());
    if (!next) throw new Error('ChangeSet 更新无效');
    this.changeSets.set(id, next);
    this.flush();
    return clone(next);
  }

  invalidateOnRestart(): ChangeSet[] {
    const invalidated: ChangeSet[] = [];
    for (const changeSet of this.changeSets.values()) {
      if (!['waiting-approval', 'approved'].includes(changeSet.state)) continue;
      invalidated.push(this.update(changeSet.id, { state: 'invalidated' }));
    }
    return invalidated;
  }

  invalidateForTask(taskId: string): ChangeSet[] {
    const invalidated: ChangeSet[] = [];
    for (const changeSet of this.changeSets.values()) {
      if (changeSet.taskId !== taskId || !['draft', 'waiting-approval', 'approved'].includes(changeSet.state)) continue;
      invalidated.push(this.update(changeSet.id, { state: 'invalidated' }));
    }
    return invalidated;
  }

  delete(id: string): void {
    this.changeSets.delete(id);
    this.flush();
  }

  private prune(): void {
    if (this.changeSets.size <= this.maxChangeSets) return;
    const removable = [...this.changeSets.values()]
      .filter((changeSet) => ['applied', 'apply-failed', 'partial-failure', 'rejected', 'invalidated'].includes(changeSet.state))
      .sort((left, right) => left.updatedAt - right.updatedAt);
    for (const changeSet of removable) {
      if (this.changeSets.size <= this.maxChangeSets) break;
      this.changeSets.delete(changeSet.id);
    }
  }

  private load(): void {
    if (!existsSync(this.filePath)) return;
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<PersistedChangeSets>;
      if (parsed.version !== 1 || !Array.isArray(parsed.changeSets)) return;
      for (const raw of parsed.changeSets) {
        const changeSet = sanitizeChangeSet(raw, this.now());
        if (changeSet) this.changeSets.set(changeSet.id, changeSet);
      }
      this.prune();
    } catch {
      this.changeSets.clear();
    }
  }

  private flush(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const data: PersistedChangeSets = { version: 1, changeSets: [...this.changeSets.values()].map(clone) };
    const temporary = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;
    writeFileSync(temporary, JSON.stringify(data, null, 2), 'utf8');
    renameSync(temporary, this.filePath);
  }
}
