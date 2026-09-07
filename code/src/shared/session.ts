export type SessionMessageRole = 'user' | 'assistant';

export interface SessionMessage {
  id: string;
  role: SessionMessageRole;
  content: string;
  createdAt: number;
}

export interface AuthorizedWorkspace {
  id: string;
  path: string;
  label: string;
  createdAt: number;
  updatedAt: number;
}

export interface WorkbenchSession {
  id: string;
  workspaceId: string;
  roleId: string;
  title: string;
  messages: SessionMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface SessionSnapshot {
  workspaces: AuthorizedWorkspace[];
  sessions: WorkbenchSession[];
  activeWorkspaceId: string | null;
  activeSessionId: string | null;
}

export interface SessionRenameRequest {
  sessionId: string;
  title: string;
}

export interface SessionMessageAppendRequest {
  sessionId: string;
  role: SessionMessageRole;
  content: string;
}
