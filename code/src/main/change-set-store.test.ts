import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import type { ChangeSet } from '../shared/change-set';
import { ChangeSetStore } from './change-set-store';

function changeSet(id: string, state: ChangeSet['state'] = 'waiting-approval'): ChangeSet {
  return {
    id,
    taskId: `task-${id}`,
    workspaceId: 'workspace-1',
    invocationId: `invocation-${id}`,
    entries: [{
      path: 'src/note.txt',
      operation: 'update',
      beforeHash: 'a'.repeat(64),
      afterHash: 'b'.repeat(64),
      diffHash: 'c'.repeat(64),
      additions: 1,
      deletions: 1
    }],
    state,
    createdAt: 100,
    updatedAt: 100
  };
}

describe('change set metadata store', () => {
  it('persists only bounded hashes and metadata, then reloads it', () => {
    const root = mkdtempSync(join(tmpdir(), 'starchat-change-set-store-'));
    const file = join(root, 'change-sets.json');
    const store = new ChangeSetStore(file, { now: () => 200 });
    store.create(changeSet('one'));
    const raw = readFileSync(file, 'utf8');
    expect(raw).toContain('src/note.txt');
    expect(raw).toContain('diffHash');
    expect(raw).not.toContain('beforeContent');
    expect(raw).not.toContain('afterContent');
    expect(raw).not.toContain('PRIVATE_FILE_CONTENT');
    expect(new ChangeSetStore(file, { now: () => 200 }).get('one')).toMatchObject({ id: 'one', state: 'waiting-approval', entries: [{ beforeHash: 'a'.repeat(64) }] });
  });

  it('invalidates only restart-sensitive approval states and keeps terminal history', () => {
    const root = mkdtempSync(join(tmpdir(), 'starchat-change-set-restart-'));
    const store = new ChangeSetStore(join(root, 'change-sets.json'), { now: () => 300 });
    store.create(changeSet('waiting', 'waiting-approval'));
    store.create(changeSet('approved', 'approved'));
    store.create(changeSet('applied', 'applied'));
    store.create(changeSet('rejected', 'rejected'));
    const invalidated = store.invalidateOnRestart();
    expect(invalidated.map((item) => item.id).sort()).toEqual(['approved', 'waiting']);
    expect(store.get('waiting')?.state).toBe('invalidated');
    expect(store.get('approved')?.state).toBe('invalidated');
    expect(store.get('applied')?.state).toBe('applied');
    expect(store.get('rejected')?.state).toBe('rejected');
  });
});
