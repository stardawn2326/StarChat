import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { SessionStore } from './session-store';
import { PERSONAL_WORKSPACE_ID } from '../shared/session';

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

  it('keeps personal conversation separate from workspace execution and persists trust state', () => {
    const { root, file } = setup();
    const store = new SessionStore(file);
    const personal = store.ensurePersonalSession('starchat.default');
    const personalId = personal.activeSessionId!;

    expect(personal.activeWorkspaceId).toBeNull();
    expect(store.sessionContext(personalId)).toMatchObject({
      sessionId: personalId,
      workspaceId: PERSONAL_WORKSPACE_ID,
      contextType: 'personal',
      workspaceRoot: ''
    });
    store.appendMessage(personalId, { role: 'user', content: '只进行陪伴对话' });

    const workspace = store.authorizeWorkspace(root, 'starchat.default');
    const workspaceId = workspace.activeWorkspaceId!;
    expect(store.sessionContext(personalId).contextType).toBe('personal');
    store.selectSession(personalId);
    expect(store.snapshot().activeWorkspaceId).toBeNull();

    store.setWorkspaceTrust(workspaceId, 'trusted-execution');
    const restored = new SessionStore(file);
    expect(restored.snapshot().workspaces.find((item) => item.id === workspaceId)?.trust).toBe('trusted-execution');
    expect(restored.snapshot().sessions.find((item) => item.id === personalId)?.messages[0]?.content).toBe('只进行陪伴对话');
  });

  it('migrates version one workspaces with an untrusted execution default', () => {
    const { root, file } = setup();
    writeFileSync(file, JSON.stringify({
      version: 1,
      workspaces: [{ id: 'workspace-1', path: root, label: '旧工作区', createdAt: 1, updatedAt: 1 }],
      sessions: [{ id: 'session-1', workspaceId: 'workspace-1', roleId: 'starchat.default', title: '旧会话', messages: [], createdAt: 1, updatedAt: 1 }],
      activeWorkspaceId: 'workspace-1',
      activeSessionId: 'session-1'
    }), 'utf8');

    const store = new SessionStore(file);
    expect(store.sessionContext('session-1')).toMatchObject({ contextType: 'workspace', trust: 'untrusted' });
    expect(store.snapshot().workspaces[0]?.trust).toBe('untrusted');
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
