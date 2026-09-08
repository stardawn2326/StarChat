import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PERSONAL_WORKSPACE_ID } from '../shared/session';
import {
  MEMORY_SCHEMA_VERSION,
  createMemoryId,
  isSensitiveMemoryContent,
  sanitizeConversationSummary,
  sanitizeEpisodicMemory,
  sanitizeMemoryContent,
  sanitizeProfileMemory,
  type ConversationSummary,
  type EpisodicMemory,
  type MemoryProvenance,
  type MemoryQuarantineItem,
  type ProfileMemory
} from '../shared/memory';
import type { SessionExecutionContext } from './session-store';

interface LegacyMemorySnapshot {
  version?: number;
  profile?: unknown[];
  episodic?: unknown[];
  summaries?: unknown[];
  quarantine?: unknown[];
}

export interface MemorySchemaMigrationResult {
  migrated: boolean;
  fromVersion: number | null;
  backupPath: string | null;
  migratedProfileCount: number;
  migratedEpisodicCount: number;
  migratedSummaryCount: number;
  quarantinedCount: number;
}

export type MemorySessionResolver = (sessionId: string) => SessionExecutionContext | null;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function safeText(value: unknown, maximum: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function profileFromLegacy(value: unknown, now: number): ProfileMemory | null {
  const memory = sanitizeProfileMemory(value, now);
  if (!memory) return null;
  const provenance: MemoryProvenance = {
    contextType: 'personal',
    source: 'legacy'
  };
  return {
    ...memory,
    provenance,
    reviewState: 'needs-review'
  };
}

function sessionScope(context: SessionExecutionContext, sessionId: string) {
  return context.contextType === 'workspace'
    ? { contextType: 'workspace' as const, workspaceId: context.workspaceId, sessionId }
    : { contextType: 'personal' as const, workspaceId: PERSONAL_WORKSPACE_ID, sessionId };
}

function safeQuarantinePayload(value: unknown, kind: 'episodic' | 'summary'): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const contentKey = kind === 'episodic' ? 'content' : 'summary';
  const content = sanitizeMemoryContent(source[contentKey], kind === 'episodic' ? 1200 : 6000);
  if (!content) return null;
  return {
    ...(safeText(source.id, 160) ? { id: safeText(source.id, 160) } : {}),
    ...(safeText(source.roleId, 120) ? { roleId: safeText(source.roleId, 120) } : {}),
    ...(safeText(source.sessionId, 160) ? { sessionId: safeText(source.sessionId, 160) } : {}),
    [contentKey]: content
  };
}

function quarantineItem(value: unknown, kind: 'episodic' | 'summary', reason: MemoryQuarantineItem['reason'], now: number): MemoryQuarantineItem | null {
  const payload = safeQuarantinePayload(value, kind);
  if (!payload) return null;
  return {
    id: createMemoryId(`quarantine-${kind}`, now),
    kind,
    payload,
    reason,
    quarantinedAt: now
  };
}

function lookupSession(resolver: MemorySessionResolver, value: unknown): SessionExecutionContext | null {
  const sessionId = safeText(value, 160);
  if (!sessionId) return null;
  try {
    const context = resolver(sessionId);
    if (!context || context.sessionId !== sessionId || !context.workspaceId) return null;
    return context;
  } catch {
    return null;
  }
}

function writeSnapshot(filePath: string, snapshot: object): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temporary, JSON.stringify(snapshot, null, 2), 'utf8');
  renameSync(temporary, filePath);
}

export function migrateMemorySchema(
  filePath: string,
  resolveSession: MemorySessionResolver,
  now = Date.now()
): MemorySchemaMigrationResult {
  const empty: MemorySchemaMigrationResult = {
    migrated: false,
    fromVersion: null,
    backupPath: null,
    migratedProfileCount: 0,
    migratedEpisodicCount: 0,
    migratedSummaryCount: 0,
    quarantinedCount: 0
  };
  if (!existsSync(filePath)) return empty;

  let raw = '';
  let parsed: LegacyMemorySnapshot;
  try {
    raw = readFileSync(filePath, 'utf8');
    parsed = JSON.parse(raw) as LegacyMemorySnapshot;
  } catch {
    return empty;
  }
  if (parsed.version === MEMORY_SCHEMA_VERSION || (parsed.version !== 1 && parsed.version !== 2)) return empty;

  const backupPath = join(dirname(filePath), 'memory.v1.backup.json');
  if (!existsSync(backupPath)) writeFileSync(backupPath, raw, 'utf8');
  const profile = (Array.isArray(parsed.profile) ? parsed.profile : [])
    .map((item) => profileFromLegacy(item, now))
    .filter((item): item is ProfileMemory => Boolean(item))
    .slice(-200);
  const episodic: EpisodicMemory[] = [];
  const summaries: ConversationSummary[] = [];
  const quarantine: MemoryQuarantineItem[] = [];

  for (const item of Array.isArray(parsed.episodic) ? parsed.episodic : []) {
    const source = item && typeof item === 'object' ? item as { sessionId?: unknown } : {};
    const context = lookupSession(resolveSession, source.sessionId);
    if (!context) {
      const quarantined = quarantineItem(item, 'episodic', 'unknown-session', now);
      if (quarantined) quarantine.push(quarantined);
      continue;
    }
    const memory = sanitizeEpisodicMemory({ ...source, scope: sessionScope(context, safeText(source.sessionId, 160)) }, now);
    if (memory && memory.importance >= 0.6) episodic.push(memory);
    else if (!isSensitiveMemoryContent((source as Record<string, unknown>).content)) {
      const quarantined = quarantineItem(item, 'episodic', 'invalid-legacy-record', now);
      if (quarantined) quarantine.push(quarantined);
    }
  }

  for (const item of Array.isArray(parsed.summaries) ? parsed.summaries : []) {
    const source = item && typeof item === 'object' ? item as { sessionId?: unknown } : {};
    const context = lookupSession(resolveSession, source.sessionId);
    if (!context) {
      const quarantined = quarantineItem(item, 'summary', 'unknown-session', now);
      if (quarantined) quarantine.push(quarantined);
      continue;
    }
    const memory = sanitizeConversationSummary({ ...source, scope: sessionScope(context, safeText(source.sessionId, 160)) }, now);
    if (memory) summaries.push(memory);
    else if (!isSensitiveMemoryContent((source as Record<string, unknown>).summary)) {
      const quarantined = quarantineItem(item, 'summary', 'invalid-legacy-record', now);
      if (quarantined) quarantine.push(quarantined);
    }
  }

  writeSnapshot(filePath, {
    version: MEMORY_SCHEMA_VERSION,
    profile,
    episodic: episodic.slice(-400),
    summaries: summaries.slice(-200),
    quarantine: quarantine.slice(-400)
  });
  return {
    migrated: true,
    fromVersion: parsed.version ?? null,
    backupPath,
    migratedProfileCount: profile.length,
    migratedEpisodicCount: episodic.length,
    migratedSummaryCount: summaries.length,
    quarantinedCount: quarantine.length
  };
}
