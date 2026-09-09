import { createHash, randomUUID } from 'node:crypto';
import type { ChangeSet, ChangeSetEntry } from '../shared/change-set';
import { MAX_CHANGESET_ENTRIES } from '../shared/change-set';
import { ChangeSetStore } from './change-set-store';
import { WorkspaceGuard, type PatchPreview, type PreparedPatchPreview, type PreparedWorkspaceChange } from './agent-security';

export interface ChangeSetIdentity {
  taskId: string;
  workspaceId: string;
  invocationId: string;
}

export interface CreatedChangeSet {
  changeSet: ChangeSet;
  preview: PatchPreview;
  prepared: PreparedWorkspaceChange[];
}

export class ChangeSetInvalidatedError extends Error {
  constructor(message = '文件在批准前发生变化，请重新预览并批准。') {
    super(message);
    this.name = 'ChangeSetInvalidatedError';
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function contentHash(value: string | null): string | null {
  return value === null ? null : sha256(value);
}

function normalizedContent(value: string | null): string {
  return (value ?? '').replaceAll('\r\n', '\n');
}

function entryFromPrepared(change: PreparedWorkspaceChange): ChangeSetEntry {
  const beforeHash = contentHash(change.beforeContent);
  const afterHash = contentHash(change.afterContent);
  const canonicalDiff = [
    `operation=${change.operation}`,
    `path=${change.path}`,
    `before=${normalizedContent(change.beforeContent)}`,
    '---',
    `after=${normalizedContent(change.afterContent)}`
  ].join('\n');
  return {
    path: change.path,
    operation: change.operation,
    beforeHash,
    afterHash,
    diffHash: sha256([change.operation, change.path, beforeHash ?? '', afterHash ?? '', canonicalDiff].join('\n')),
    additions: change.additions,
    deletions: change.deletions
  };
}

function sameEntry(expected: ChangeSetEntry, actual: ChangeSetEntry): boolean {
  return expected.path === actual.path &&
    expected.operation === actual.operation &&
    expected.beforeHash === actual.beforeHash &&
    expected.afterHash === actual.afterHash &&
    expected.diffHash === actual.diffHash &&
    expected.additions === actual.additions &&
    expected.deletions === actual.deletions;
}

export class ChangeSetManager {
  constructor(private readonly store: ChangeSetStore, private readonly now: () => number = () => Date.now()) {}

  createPatch(guard: WorkspaceGuard, identity: ChangeSetIdentity, patch: string): CreatedChangeSet {
    return this.create(identity, guard.preparePatchPreview(patch));
  }

  createFileChanges(guard: WorkspaceGuard, identity: ChangeSetIdentity, input: unknown): CreatedChangeSet {
    return this.create(identity, guard.prepareFileChangesPreview(input));
  }

  applyPatch(guard: WorkspaceGuard, identity: ChangeSetIdentity, patch: string): PatchPreview {
    return this.apply(identity, () => guard.preparePatchPreview(patch), (prepared) => guard.applyPreparedFileChanges(prepared));
  }

  applyFileChanges(guard: WorkspaceGuard, identity: ChangeSetIdentity, input: unknown): PatchPreview {
    return this.apply(identity, () => guard.prepareFileChangesPreview(input), (prepared) => guard.applyPreparedFileChanges(prepared));
  }

  reject(taskId: string, invocationId: string): void {
    const changeSet = this.store.findByInvocation(taskId, invocationId);
    if (changeSet && ['draft', 'waiting-approval', 'approved'].includes(changeSet.state)) this.store.update(changeSet.id, { state: 'rejected' });
  }

  invalidate(id: string): void {
    const changeSet = this.store.get(id);
    if (changeSet && ['draft', 'waiting-approval', 'approved'].includes(changeSet.state)) this.store.update(id, { state: 'invalidated' });
  }

  invalidateForTask(taskId: string): ChangeSet[] {
    return this.store.invalidateForTask(taskId);
  }

  private create(identity: ChangeSetIdentity, prepared: PreparedPatchPreview): CreatedChangeSet {
    const taskId = identity.taskId.trim().slice(0, 160);
    const workspaceId = identity.workspaceId.trim().slice(0, 160);
    const invocationId = identity.invocationId.trim().slice(0, 160);
    if (!taskId || !workspaceId || !invocationId || prepared.changes.length === 0 || prepared.changes.length > MAX_CHANGESET_ENTRIES) throw new Error('ChangeSet 创建请求无效');
    const now = this.now();
    const changeSet: ChangeSet = {
      id: randomUUID(), taskId, workspaceId, invocationId,
      entries: prepared.changes.map(entryFromPrepared), state: 'waiting-approval', createdAt: now, updatedAt: now
    };
    this.store.create(changeSet);
    return { changeSet, prepared: prepared.changes, preview: { ...prepared.preview, changeSetId: changeSet.id } };
  }

  private apply(
    identity: ChangeSetIdentity,
    prepare: () => PreparedPatchPreview,
    write: (changes: PreparedWorkspaceChange[]) => void
  ): PatchPreview {
    const changeSet = this.store.findByInvocation(identity.taskId, identity.invocationId);
    if (!changeSet || changeSet.state !== 'waiting-approval') throw new ChangeSetInvalidatedError('批准请求已过期，请重新预览并批准。');
    try {
      if (changeSet.workspaceId !== identity.workspaceId) throw new ChangeSetInvalidatedError('批准请求已过期，请重新预览并批准。');
      this.store.update(changeSet.id, { state: 'approved' });
      const prepared = prepare();
      const entries = prepared.changes.map(entryFromPrepared);
      if (entries.length !== changeSet.entries.length || entries.some((entry, index) => !sameEntry(changeSet.entries[index], entry))) {
        throw new ChangeSetInvalidatedError();
      }
      write(prepared.changes);
      this.store.update(changeSet.id, { state: 'applied' });
      return { ...prepared.preview, changeSetId: changeSet.id };
    } catch (error) {
      this.invalidate(changeSet.id);
      if (error instanceof ChangeSetInvalidatedError) throw error;
      throw new ChangeSetInvalidatedError();
    }
  }
}
