import { PERSONAL_WORKSPACE_ID, type SessionContextType } from './session';

export type MemoryContextType = SessionContextType;

export interface MemoryScope {
  contextType: MemoryContextType;
  workspaceId?: string;
  sessionId?: string;
}

export function personalMemoryScope(sessionId?: string): MemoryScope {
  return {
    contextType: 'personal',
    workspaceId: PERSONAL_WORKSPACE_ID,
    ...(sessionId ? { sessionId } : {})
  };
}

export function normalizeMemoryScope(input: unknown, fallback: MemoryScope = { contextType: 'personal' }): MemoryScope {
  const source = input && typeof input === 'object' ? input as Partial<MemoryScope> : {};
  const contextType: MemoryContextType = source.contextType === 'workspace' ? 'workspace' : 'personal';
  const workspaceId = typeof source.workspaceId === 'string' && source.workspaceId.trim()
    ? source.workspaceId.trim().slice(0, 160)
    : contextType === 'personal'
      ? PERSONAL_WORKSPACE_ID
      : fallback.workspaceId;
  const sessionId = typeof source.sessionId === 'string' && source.sessionId.trim()
    ? source.sessionId.trim().slice(0, 160)
    : undefined;
  return {
    contextType,
    ...(workspaceId ? { workspaceId } : {}),
    ...(sessionId ? { sessionId } : {})
  };
}

export function sameMemoryContext(left: MemoryScope, right: MemoryScope): boolean {
  if (left.contextType !== right.contextType) return false;
  if (left.contextType === 'workspace') return Boolean(left.workspaceId && right.workspaceId && left.workspaceId === right.workspaceId);
  return true;
}

export function sameMemorySummaryScope(left: MemoryScope, right: MemoryScope): boolean {
  if (!sameMemoryContext(left, right)) return false;
  return Boolean(left.sessionId && right.sessionId && left.sessionId === right.sessionId);
}
