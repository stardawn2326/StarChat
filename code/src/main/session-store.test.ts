import { existsSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { SessionStore } from './session-store';

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'starchat-sessions-'));
  return { root, file: join(root, 'workbench-sessions.json') };
}

describe('workbench workspace and session store', () => {
  it('starts without an implicit workspace and creates a first session only after authorization', () => {
    const { root, file } = setup();
    const store = new SessionStore(file);

    expect(store.snapshot()).toMatchObject({ activeWorkspaceId: null, activeSessionId: null, workspaces: [], sessions: [] });
    const next = store.authorizeWorkspace(root, 'baoyin.default');

    expect(next.workspaces).toHaveLength(1);
    expect(next.sessions).toHaveLength(1);
    expect(next.activeWorkspaceId).toBe(next.workspaces[0].id);
    expect(next.activeSessionId).toBe(next.sessions[0].id);
    expect(existsSync(file)).toBe(true);
  });

  it('persists workspace selection and session CRUD across restart', () => {
    const { root, file } = setup();
    const store = new SessionStore(file);
    const first = store.authorizeWorkspace(root, 'baoyin.default');
    const created = store.createSession(first.activeWorkspaceId!, 'baoyin.default');
    store.renameSession(created.activeSessionId!, '持久化会话');

    const reloaded = new SessionStore(file);
    expect(reloaded.snapshot().sessions.some((session) => session.title === '持久化会话')).toBe(true);
    const afterDelete = reloaded.deleteSession(created.activeSessionId!, 'baoyin.default');
    expect(afterDelete.sessions.some((session) => session.id === created.activeSessionId)).toBe(false);
    expect(afterDelete.activeSessionId).not.toBeNull();
  });

  it('isolates messages by session and derives the title from the first user message', () => {
    const { root, file } = setup();
    const store = new SessionStore(file);
    const first = store.authorizeWorkspace(root, 'baoyin.default');
    const firstId = first.activeSessionId!;
    const secondId = store.createSession(first.activeWorkspaceId!, 'baoyin.default').activeSessionId!;

    store.appendMessage(firstId, { role: 'user', content: '检查这个项目的设置结构' });
    store.appendMessage(firstId, { role: 'assistant', content: '已经开始检查。' });

    const snapshot = store.selectSession(secondId);
    expect(snapshot.sessions.find((session) => session.id === firstId)?.title).toBe('检查这个项目的设置结构');
    expect(snapshot.sessions.find((session) => session.id === firstId)?.messages).toHaveLength(2);
    expect(snapshot.sessions.find((session) => session.id === secondId)?.messages).toEqual([]);
  });

  it('resolves only the authorized workspace attached to a session', () => {
    const { root, file } = setup();
    const store = new SessionStore(file);
    const snapshot = store.authorizeWorkspace(root, 'baoyin.default');

    expect(store.executionContext(snapshot.activeSessionId!)).toEqual({
      sessionId: snapshot.activeSessionId,
      workspaceRoot: snapshot.workspaces[0].path
    });
    expect(() => store.executionContext('missing-session')).toThrow('会话不存在');
  });
});
