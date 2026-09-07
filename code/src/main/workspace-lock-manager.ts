import { existsSync, realpathSync } from 'node:fs';

export type WorkspaceLockPhase = 'reserved' | 'active';

export interface WorkspaceWriteLock {
  workspaceRoot: string;
  taskId: string;
  phase: WorkspaceLockPhase;
  acquiredAt: number;
}

function canonicalRoot(root: string): string {
  if (!root || !existsSync(root)) throw new Error('写入锁工作区不存在');
  return realpathSync(root).replaceAll('\\', '/').replace(/\/+$/u, '').toLocaleLowerCase();
}

export class WorkspaceLockManager {
  private readonly locks = new Map<string, WorkspaceWriteLock>();

  acquireWrite(workspaceRoot: string, taskId: string, now = Date.now()): WorkspaceWriteLock {
    if (!taskId.trim()) throw new Error('写入锁任务标识无效');
    const key = canonicalRoot(workspaceRoot);
    const current = this.locks.get(key);
    if (current && current.taskId !== taskId) {
      throw new Error(`当前工作区已有写任务或待审批写任务：${current.taskId}`);
    }
    if (current) return current;
    const lock: WorkspaceWriteLock = { workspaceRoot: key, taskId, phase: 'reserved', acquiredAt: now };
    this.locks.set(key, lock);
    return lock;
  }

  promoteWrite(workspaceRoot: string, taskId: string): WorkspaceWriteLock {
    const key = canonicalRoot(workspaceRoot);
    const current = this.locks.get(key);
    if (!current || current.taskId !== taskId) throw new Error('当前任务没有对应的工作区写入锁');
    current.phase = 'active';
    return current;
  }

  releaseWrite(workspaceRoot: string, taskId: string): void {
    const key = canonicalRoot(workspaceRoot);
    const current = this.locks.get(key);
    if (current?.taskId === taskId) this.locks.delete(key);
  }

  get(workspaceRoot: string): WorkspaceWriteLock | null {
    const key = canonicalRoot(workspaceRoot);
    return this.locks.get(key) ?? null;
  }

  hasWriteLock(workspaceRoot: string): boolean {
    return this.get(workspaceRoot) !== null;
  }

  clear(): void {
    this.locks.clear();
  }
}
