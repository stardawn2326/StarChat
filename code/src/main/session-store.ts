import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute } from 'node:path';
import type { AuthorizedWorkspace, SessionMessage, SessionSnapshot, WorkbenchSession } from '../shared/session';

interface PersistedSessions extends SessionSnapshot {
  version: 1;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function cleanText(value: unknown, maximum: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function sanitizeWorkspace(value: unknown): AuthorizedWorkspace | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Partial<AuthorizedWorkspace>;
  const id = cleanText(source.id, 100);
  const path = cleanText(source.path, 4096);
  if (!id || !path || !isAbsolute(path)) return null;
  const createdAt = Number.isFinite(source.createdAt) ? Number(source.createdAt) : Date.now();
  return { id, path, label: cleanText(source.label, 120) || basename(path), createdAt, updatedAt: Number.isFinite(source.updatedAt) ? Number(source.updatedAt) : createdAt };
}

function sanitizeMessage(value: unknown): SessionMessage | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Partial<SessionMessage>;
  const id = cleanText(source.id, 100);
  const content = cleanText(source.content, 20_000);
  if (!id || !content || (source.role !== 'user' && source.role !== 'assistant')) return null;
  return { id, role: source.role, content, createdAt: Number.isFinite(source.createdAt) ? Number(source.createdAt) : Date.now() };
}

function sanitizeSession(value: unknown, workspaceIds: ReadonlySet<string>): WorkbenchSession | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Partial<WorkbenchSession>;
  const id = cleanText(source.id, 100);
  const workspaceId = cleanText(source.workspaceId, 100);
  const roleId = cleanText(source.roleId, 100);
  if (!id || !workspaceIds.has(workspaceId) || !roleId) return null;
  const createdAt = Number.isFinite(source.createdAt) ? Number(source.createdAt) : Date.now();
  return {
    id,
    workspaceId,
    roleId,
    title: cleanText(source.title, 64) || '新对话',
    messages: Array.isArray(source.messages) ? source.messages.map(sanitizeMessage).filter((item): item is SessionMessage => Boolean(item)).slice(-200) : [],
    createdAt,
    updatedAt: Number.isFinite(source.updatedAt) ? Number(source.updatedAt) : createdAt
  };
}

export class SessionStore {
  private readonly filePath: string;
  private workspaces: AuthorizedWorkspace[] = [];
  private sessions: WorkbenchSession[] = [];
  private activeWorkspaceId: string | null = null;
  private activeSessionId: string | null = null;

  constructor(filePath: string) {
    this.filePath = filePath;
    mkdirSync(dirname(filePath), { recursive: true });
    if (existsSync(filePath)) {
      try {
        const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as Partial<PersistedSessions>;
        if (parsed.version === 1 && Array.isArray(parsed.workspaces) && Array.isArray(parsed.sessions)) {
          this.workspaces = parsed.workspaces.map(sanitizeWorkspace).filter((item): item is AuthorizedWorkspace => Boolean(item));
          const workspaceIds = new Set(this.workspaces.map((item) => item.id));
          this.sessions = parsed.sessions.map((item) => sanitizeSession(item, workspaceIds)).filter((item): item is WorkbenchSession => Boolean(item));
          this.activeWorkspaceId = typeof parsed.activeWorkspaceId === 'string' && workspaceIds.has(parsed.activeWorkspaceId) ? parsed.activeWorkspaceId : null;
          this.activeSessionId = typeof parsed.activeSessionId === 'string' && this.sessions.some((item) => item.id === parsed.activeSessionId) ? parsed.activeSessionId : null;
        }
      } catch {
        this.workspaces = [];
        this.sessions = [];
      }
    }
    this.reconcileSelection();
    this.flush();
  }

  snapshot(): SessionSnapshot {
    return clone({
      workspaces: [...this.workspaces].sort((a, b) => b.updatedAt - a.updatedAt),
      sessions: [...this.sessions].sort((a, b) => b.updatedAt - a.updatedAt),
      activeWorkspaceId: this.activeWorkspaceId,
      activeSessionId: this.activeSessionId
    });
  }

  authorizeWorkspace(path: string, roleId: string): SessionSnapshot {
    if (!isAbsolute(path) || !existsSync(path) || !statSync(path).isDirectory()) throw new Error('所选工作区不可用');
    const canonical = realpathSync(path);
    const now = Date.now();
    let workspace = this.workspaces.find((item) => item.path.toLocaleLowerCase() === canonical.toLocaleLowerCase());
    if (!workspace) {
      workspace = { id: randomUUID(), path: canonical, label: basename(canonical), createdAt: now, updatedAt: now };
      this.workspaces.push(workspace);
    } else {
      workspace.updatedAt = now;
    }
    this.activeWorkspaceId = workspace.id;
    const existing = this.sessions.filter((item) => item.workspaceId === workspace!.id).sort((a, b) => b.updatedAt - a.updatedAt)[0];
    this.activeSessionId = existing?.id ?? this.createSessionRecord(workspace.id, roleId).id;
    this.flush();
    return this.snapshot();
  }

  selectWorkspace(workspaceId: string, roleId: string): SessionSnapshot {
    const workspace = this.workspaces.find((item) => item.id === workspaceId);
    if (!workspace) throw new Error('工作区不存在');
    this.activeWorkspaceId = workspace.id;
    workspace.updatedAt = Date.now();
    const existing = this.sessions.filter((item) => item.workspaceId === workspace.id).sort((a, b) => b.updatedAt - a.updatedAt)[0];
    this.activeSessionId = existing?.id ?? this.createSessionRecord(workspace.id, roleId).id;
    this.flush();
    return this.snapshot();
  }

  createSession(workspaceId: string, roleId: string): SessionSnapshot {
    if (!this.workspaces.some((item) => item.id === workspaceId)) throw new Error('请先选择授权工作区');
    const session = this.createSessionRecord(workspaceId, roleId);
    this.activeWorkspaceId = workspaceId;
    this.activeSessionId = session.id;
    this.flush();
    return this.snapshot();
  }

  selectSession(sessionId: string): SessionSnapshot {
    const session = this.requireSession(sessionId);
    session.updatedAt = Date.now();
    this.activeWorkspaceId = session.workspaceId;
    this.activeSessionId = session.id;
    this.flush();
    return this.snapshot();
  }

  renameSession(sessionId: string, title: string): SessionSnapshot {
    const normalized = cleanText(title, 64);
    if (!normalized) throw new Error('会话名称不能为空');
    const session = this.requireSession(sessionId);
    session.title = normalized;
    session.updatedAt = Date.now();
    this.flush();
    return this.snapshot();
  }

  deleteSession(sessionId: string, roleId: string): SessionSnapshot {
    const session = this.requireSession(sessionId);
    this.sessions = this.sessions.filter((item) => item.id !== sessionId);
    if (this.activeSessionId === sessionId) {
      const replacement = this.sessions.filter((item) => item.workspaceId === session.workspaceId).sort((a, b) => b.updatedAt - a.updatedAt)[0]
        ?? this.createSessionRecord(session.workspaceId, roleId);
      this.activeSessionId = replacement.id;
      this.activeWorkspaceId = replacement.workspaceId;
    }
    this.flush();
    return this.snapshot();
  }

  appendMessage(sessionId: string, input: { role: 'user' | 'assistant'; content: string }): SessionSnapshot {
    const content = cleanText(input.content, 20_000);
    if (!content) return this.snapshot();
    const session = this.requireSession(sessionId);
    const now = Date.now();
    session.messages = [...session.messages, { id: randomUUID(), role: input.role, content, createdAt: now }].slice(-200);
    if (input.role === 'user' && session.title === '新对话') session.title = content.replace(/\s+/gu, ' ').slice(0, 32);
    session.updatedAt = now;
    this.activeWorkspaceId = session.workspaceId;
    this.activeSessionId = session.id;
    this.flush();
    return this.snapshot();
  }

  executionContext(sessionId: string): { sessionId: string; workspaceRoot: string } {
    const session = this.requireSession(sessionId);
    const workspace = this.workspaces.find((item) => item.id === session.workspaceId);
    if (!workspace) throw new Error('会话工作区不存在');
    if (!existsSync(workspace.path)) throw new Error('授权工作区已不可用，请重新选择');
    return { sessionId: session.id, workspaceRoot: realpathSync(workspace.path) };
  }

  private requireSession(sessionId: string): WorkbenchSession {
    const session = this.sessions.find((item) => item.id === sessionId);
    if (!session) throw new Error('会话不存在');
    return session;
  }

  private createSessionRecord(workspaceId: string, roleId: string): WorkbenchSession {
    const now = Date.now();
    const session: WorkbenchSession = { id: randomUUID(), workspaceId, roleId, title: '新对话', messages: [], createdAt: now, updatedAt: now };
    this.sessions.push(session);
    return session;
  }

  private reconcileSelection(): void {
    if (!this.activeWorkspaceId && this.workspaces.length > 0) this.activeWorkspaceId = this.workspaces[0].id;
    if (!this.activeSessionId && this.activeWorkspaceId) this.activeSessionId = this.sessions.find((item) => item.workspaceId === this.activeWorkspaceId)?.id ?? null;
    if (this.activeSessionId) this.activeWorkspaceId = this.sessions.find((item) => item.id === this.activeSessionId)?.workspaceId ?? this.activeWorkspaceId;
  }

  private flush(): void {
    const data: PersistedSessions = { version: 1, ...this.snapshot() };
    const temporary = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;
    writeFileSync(temporary, JSON.stringify(data, null, 2), 'utf8');
    renameSync(temporary, this.filePath);
  }
}
