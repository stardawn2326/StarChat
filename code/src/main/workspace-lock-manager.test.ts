import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { WorkspaceLockManager } from './workspace-lock-manager';

describe('workspace write lock manager', () => {
  it('allows read-only work to coexist and serializes write reservations by workspace', () => {
    const root = mkdtempSync(join(tmpdir(), 'starchat-workspace-lock-'));
    const manager = new WorkspaceLockManager();

    expect(manager.acquireWrite(root, 'task-a', 10)).toMatchObject({ taskId: 'task-a', phase: 'reserved' });
    expect(() => manager.acquireWrite(`${root}\\`, 'task-b')).toThrow(/已有写任务/);
    expect(manager.acquireWrite(root, 'task-a')).toMatchObject({ taskId: 'task-a' });
    expect(manager.promoteWrite(root, 'task-a').phase).toBe('active');
    manager.releaseWrite(root, 'task-a');
    expect(manager.hasWriteLock(root)).toBe(false);
    expect(manager.acquireWrite(root, 'task-b').taskId).toBe('task-b');
  });

  it('does not let one task release another task reservation', () => {
    const root = mkdtempSync(join(tmpdir(), 'starchat-workspace-lock-owner-'));
    const manager = new WorkspaceLockManager();
    manager.acquireWrite(root, 'task-a');
    manager.releaseWrite(root, 'task-b');
    expect(manager.get(root)?.taskId).toBe('task-a');
  });
});
