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
  trust: WorkspaceTrustState;
  createdAt: number;
  updatedAt: number;
}

export type WorkspaceTrustState = 'untrusted' | 'read-only' | 'trusted-execution';

export const WORKSPACE_TRUST_STATES: readonly WorkspaceTrustState[] = [
  'untrusted',
  'read-only',
  'trusted-execution'
];

export const PERSONAL_WORKSPACE_ID = 'personal:default';

export type SessionContextType = 'personal' | 'workspace';

export interface WorkbenchSession {
  id: string;
  workspaceId: string;
  contextType: SessionContextType;
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
