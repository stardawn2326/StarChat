import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { ChangeSetInvalidatedError, ChangeSetManager } from './change-set';
import { ChangeSetStore } from './change-set-store';
import { WorkspaceGuard } from './agent-security';

const UPDATE_PATCH = '*** Begin Patch\n*** Update File: src/note.txt\n@@\n hello\n-world\n+approved\n*** End Patch';

function setup(): { root: string; guard: WorkspaceGuard; store: ChangeSetStore; manager: ChangeSetManager } {
  const root = mkdtempSync(join(tmpdir(), 'starchat-change-set-'));
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src', 'note.txt'), 'hello\nworld\n', 'utf8');
  writeFileSync(join(root, 'src', 'remove.txt'), 'remove me\n', 'utf8');
  const store = new ChangeSetStore(join(root, 'change-sets.json'));
  return { root, guard: new WorkspaceGuard(root), store, manager: new ChangeSetManager(store) };
}

function identity(invocationId = 'invocation-1') {
  return { taskId: 'task-1', workspaceId: 'workspace-1', invocationId };
}

describe('change set approval boundary', () => {
  it('records SHA-256 metadata, keeps content out of the store, and applies one exact update', () => {
    const { root, guard, store, manager } = setup();
    const created = manager.createPatch(guard, identity(), UPDATE_PATCH);

    expect(created.preview.changeSetId).toBe(created.changeSet.id);
    expect(created.changeSet).toMatchObject({ state: 'waiting-approval', entries: [{ operation: 'update', path: 'src/note.txt' }] });
    expect(created.changeSet.entries[0]?.beforeHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(created.changeSet.entries[0]?.afterHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(created.changeSet.entries[0]?.diffHash).toMatch(/^[a-f0-9]{64}$/u);
    const persisted = readFileSync(join(root, 'change-sets.json'), 'utf8');
    expect(persisted).not.toContain('hello');
    expect(persisted).not.toContain('approved');
    expect(readFileSync(join(root, 'src', 'note.txt'), 'utf8')).toBe('hello\nworld\n');

    const applied = manager.applyPatch(guard, identity(), UPDATE_PATCH);
    expect(applied.changeSetId).toBe(created.changeSet.id);
    expect(readFileSync(join(root, 'src', 'note.txt'), 'utf8')).toBe('hello\napproved\n');
    expect(store.get(created.changeSet.id)?.state).toBe('applied');
    expect(() => manager.applyPatch(guard, identity(), UPDATE_PATCH)).toThrow(ChangeSetInvalidatedError);
  });

  it('freezes create, update and delete scope and applies all three only after approval', () => {
    const { root, guard, manager } = setup();
    const changes = [
      { type: 'create' as const, path: 'src/new.txt', content: 'new file\n' },
      { type: 'update' as const, path: 'src/note.txt', content: 'updated file\n' },
      { type: 'delete' as const, path: 'src/remove.txt' }
    ];
    const created = manager.createFileChanges(guard, identity('mixed-invocation'), changes);
    expect(created.changeSet.entries).toMatchObject([
      { operation: 'create', path: 'src/new.txt', beforeHash: null },
      { operation: 'update', path: 'src/note.txt' },
      { operation: 'delete', path: 'src/remove.txt', afterHash: null }
    ]);
    expect(existsSync(join(root, 'src', 'new.txt'))).toBe(false);

    manager.applyFileChanges(guard, { taskId: 'task-1', workspaceId: 'workspace-1', invocationId: 'mixed-invocation' }, changes);
    expect(readFileSync(join(root, 'src', 'new.txt'), 'utf8')).toBe('new file\n');
    expect(readFileSync(join(root, 'src', 'note.txt'), 'utf8')).toBe('updated file\n');
    expect(existsSync(join(root, 'src', 'remove.txt'))).toBe(false);
  });

  it('invalidates approval when the workspace identity changes', () => {
    const { root, guard, store, manager } = setup();
    const created = manager.createPatch(guard, identity('workspace-mismatch'), UPDATE_PATCH);

    expect(() => manager.applyPatch(guard, { taskId: 'task-1', workspaceId: 'another-workspace', invocationId: 'workspace-mismatch' }, UPDATE_PATCH))
      .toThrow('批准请求已过期，请重新预览并批准。');
    expect(readFileSync(join(root, 'src', 'note.txt'), 'utf8')).toBe('hello\nworld\n');
    expect(store.get(created.changeSet.id)?.state).toBe('invalidated');
  });

  it('invalidates without writing when a file changes or disappears before approval', () => {
    const first = setup();
    const firstSet = first.manager.createPatch(first.guard, identity('external-edit'), UPDATE_PATCH);
    writeFileSync(join(first.root, 'src', 'note.txt'), 'external\n', 'utf8');
    expect(() => first.manager.applyPatch(first.guard, { taskId: 'task-1', workspaceId: 'workspace-1', invocationId: 'external-edit' }, UPDATE_PATCH)).toThrow(ChangeSetInvalidatedError);
    expect(readFileSync(join(first.root, 'src', 'note.txt'), 'utf8')).toBe('external\n');
    expect(first.store.get(firstSet.changeSet.id)?.state).toBe('invalidated');

    const second = setup();
    const secondSet = second.manager.createPatch(second.guard, identity('target-disappeared'), UPDATE_PATCH);
    unlinkSync(join(second.root, 'src', 'note.txt'));
    expect(() => second.manager.applyPatch(second.guard, { taskId: 'task-1', workspaceId: 'workspace-1', invocationId: 'target-disappeared' }, UPDATE_PATCH)).toThrow(ChangeSetInvalidatedError);
    expect(existsSync(join(second.root, 'src', 'note.txt'))).toBe(false);
    expect(second.store.get(secondSet.changeSet.id)?.state).toBe('invalidated');
  });

  it('invalidates without writing when the approved content, operation, or scope changes', () => {
    const content = setup();
    const contentSet = content.manager.createFileChanges(content.guard, identity('content-change'), [{ type: 'update', path: 'src/note.txt', content: 'first\n' }]);
    expect(() => content.manager.applyFileChanges(content.guard, { taskId: 'task-1', workspaceId: 'workspace-1', invocationId: 'content-change' }, [{ type: 'update', path: 'src/note.txt', content: 'tampered\n' }])).toThrow(ChangeSetInvalidatedError);
    expect(readFileSync(join(content.root, 'src', 'note.txt'), 'utf8')).toBe('hello\nworld\n');
    expect(content.store.get(contentSet.changeSet.id)?.state).toBe('invalidated');

    const operation = setup();
    const operationSet = operation.manager.createFileChanges(operation.guard, identity('operation-change'), [{ type: 'update', path: 'src/note.txt', content: 'first\n' }]);
    expect(() => operation.manager.applyFileChanges(operation.guard, { taskId: 'task-1', workspaceId: 'workspace-1', invocationId: 'operation-change' }, [{ type: 'delete', path: 'src/note.txt' }])).toThrow(ChangeSetInvalidatedError);
    expect(readFileSync(join(operation.root, 'src', 'note.txt'), 'utf8')).toBe('hello\nworld\n');
    expect(operation.store.get(operationSet.changeSet.id)?.state).toBe('invalidated');

    const scope = setup();
    const scopeSet = scope.manager.createFileChanges(scope.guard, identity('scope-change'), [{ type: 'update', path: 'src/note.txt', content: 'first\n' }]);
    expect(() => scope.manager.applyFileChanges(scope.guard, { taskId: 'task-1', workspaceId: 'workspace-1', invocationId: 'scope-change' }, [
      { type: 'update', path: 'src/note.txt', content: 'first\n' },
      { type: 'create', path: 'src/extra.txt', content: 'extra\n' }
    ])).toThrow(ChangeSetInvalidatedError);
    expect(existsSync(join(scope.root, 'src', 'extra.txt'))).toBe(false);
    expect(scope.store.get(scopeSet.changeSet.id)?.state).toBe('invalidated');
  });

  it('reuses the existing workspace guard for denied, sensitive, and symlink paths', () => {
    const root = mkdtempSync(join(tmpdir(), 'starchat-change-set-security-'));
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src', 'note.txt'), 'hello\n', 'utf8');
    writeFileSync(join(root, '.env'), 'API_KEY=hidden', 'utf8');
    mkdirSync(join(root, 'denied'));
    writeFileSync(join(root, 'denied', 'note.txt'), 'denied\n', 'utf8');
    const guard = new WorkspaceGuard(root, { deniedRoots: [join(root, 'denied')] });
    expect(() => guard.previewFileChanges([{ type: 'update', path: '.env', content: 'changed\n' }])).toThrow(/敏感/);
    expect(() => guard.previewFileChanges([{ type: 'update', path: 'denied/note.txt', content: 'changed\n' }])).toThrow(/授权工作区/);

    const outside = mkdtempSync(join(tmpdir(), 'starchat-change-set-outside-'));
    writeFileSync(join(outside, 'note.txt'), 'outside\n', 'utf8');
    let symlinkCreated = false;
    try {
      symlinkSync(join(outside, 'note.txt'), join(root, 'src', 'link.txt'), 'file');
      symlinkCreated = true;
    } catch {
      // Windows may deny symlink creation without developer mode; other gates above remain covered.
    }
    if (symlinkCreated) expect(() => guard.previewFileChanges([{ type: 'update', path: 'src/link.txt', content: 'changed\n' }])).toThrow(/符号链接|授权工作区/);
  });

  it('rejects oversized paths and patches at the approval boundary', () => {
    const { guard } = setup();
    expect(() => guard.previewFileChanges([{ type: 'create', path: `src/${'a'.repeat(2_000)}`, content: 'x' }])).toThrow(/路径/);
    expect(() => guard.previewPatch(`*** Begin Patch\n${'x'.repeat(512 * 1024)}\n*** End Patch`)).toThrow(/补丁/);
  });

  it('rejects a change set explicitly and never writes it afterwards', () => {
    const { root, guard, store, manager } = setup();
    const created = manager.createPatch(guard, identity('rejected'), UPDATE_PATCH);
    manager.reject('task-1', 'rejected');
    expect(store.get(created.changeSet.id)?.state).toBe('rejected');
    expect(() => manager.applyPatch(guard, { taskId: 'task-1', workspaceId: 'workspace-1', invocationId: 'rejected' }, UPDATE_PATCH)).toThrow(ChangeSetInvalidatedError);
    expect(readFileSync(join(root, 'src', 'note.txt'), 'utf8')).toBe('hello\nworld\n');
  });
});
