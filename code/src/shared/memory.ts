import { normalizeMemoryScope, type MemoryScope } from './memory-scope';

export const MEMORY_SCHEMA_VERSION = 3 as const;

export type ProfileMemoryKind = 'name' | 'identity' | 'preference' | 'habit' | 'person' | 'project' | 'boundary' | 'relationship';
export type MemorySource = 'user_explicit' | 'assistant_inferred' | 'manual';
export type MemoryProvenanceSource = 'companion' | 'agent' | 'manual' | 'legacy';
export type MemoryReviewState = 'active' | 'needs-review';

export interface MemoryProvenance {
  contextType?: 'personal' | 'workspace';
  workspaceId?: string;
  sessionId?: string;
  source: MemoryProvenanceSource;
}

export interface MemoryQuarantineItem {
  id: string;
  kind: 'episodic' | 'summary';
  payload: unknown;
  reason: 'unknown-session' | 'invalid-legacy-record';
  quarantinedAt: number;
}

export interface ProfileMemory {
  id: string;
  roleId: string;
  kind: ProfileMemoryKind;
  content: string;
  confidence: number;
  source: MemorySource;
  provenance: MemoryProvenance;
  reviewState: MemoryReviewState;
  createdAt: number;
  updatedAt: number;
}

export interface EpisodicMemory {
  id: string;
  roleId: string;
  sessionId: string;
  scope: MemoryScope;
  content: string;
  emotion?: string;
  importance: number;
  tags: string[];
  occurredAt: number;
  createdAt: number;
}

export interface ConversationSummary {
  id: string;
  roleId: string;
  sessionId: string;
  scope: MemoryScope;
  summary: string;
  openTopics: string[];
  unfinishedQuestions: string[];
  userMood?: string;
  messageCount: number;
  updatedAt: number;
}

export interface MemorySnapshot {
  version: typeof MEMORY_SCHEMA_VERSION;
  profile: ProfileMemory[];
  episodic: EpisodicMemory[];
  summaries: ConversationSummary[];
  quarantine: MemoryQuarantineItem[];
}

export interface MemoryQuery {
  roleId: string;
  sessionId?: string;
  scope?: MemoryScope;
  query?: string;
  limit?: number;
}

export type MemoryRetrievalItem =
  | { kind: 'profile'; score: number; memory: ProfileMemory }
  | { kind: 'episodic'; score: number; memory: EpisodicMemory }
  | { kind: 'summary'; score: number; memory: ConversationSummary };

export interface MemoryRetrievalResult {
  query: string;
  items: MemoryRetrievalItem[];
  profile: ProfileMemory[];
  episodic: EpisodicMemory[];
  summaries: ConversationSummary[];
}

const SENSITIVE_MEMORY = /(?:api[\s_-]?key|access[\s_-]?token|refresh[\s_-]?token|bearer\s+|password|passwd|secret|private[\s_-]?key|cookie|authorization|身份证|银行卡|信用卡|密码|口令|私钥|sk-[a-z0-9_-]{12,})/iu;
export const PROFILE_MEMORY_KINDS: readonly ProfileMemoryKind[] = ['name', 'identity', 'preference', 'habit', 'person', 'project', 'boundary', 'relationship'];
const MEMORY_SOURCES: readonly MemorySource[] = ['user_explicit', 'assistant_inferred', 'manual'];
const MEMORY_PROVENANCE_SOURCES: readonly MemoryProvenanceSource[] = ['companion', 'agent', 'manual', 'legacy'];

function text(value: unknown, maximum: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function timestamp(value: unknown, fallback: number): number {
  return Number.isFinite(value) ? Math.max(0, Number(value)) : fallback;
}

export function isSensitiveMemoryContent(value: unknown): boolean {
  return typeof value === 'string' && SENSITIVE_MEMORY.test(value);
}

export function normalizeProfileFact(value: string): string {
  return value
    .replace(/[，。！？…,.!?]/gu, '')
    .replace(/\s+/gu, '')
    .replace(/^我(?:(?:现在)?(?:还是|仍然|依然|还))?/u, '我')
    .trim();
}

export function sanitizeMemoryContent(value: unknown, maximum = 500): string | null {
  const content = text(value, maximum);
  if (!content || isSensitiveMemoryContent(content)) return null;
  return content;
}

export function normalizeMemoryProvenance(
  value: unknown,
  fallback: MemoryProvenance = { contextType: 'personal', source: 'manual' }
): MemoryProvenance {
  const source = value && typeof value === 'object' ? value as Partial<MemoryProvenance> : {};
  const sourceKind = MEMORY_PROVENANCE_SOURCES.includes(source.source as MemoryProvenanceSource)
    ? source.source as MemoryProvenanceSource
    : fallback.source;
  const contextType = source.contextType === 'workspace' || source.contextType === 'personal'
    ? source.contextType
    : fallback.contextType;
  const workspaceId = typeof source.workspaceId === 'string' && source.workspaceId.trim()
    ? source.workspaceId.trim().slice(0, 160)
    : fallback.workspaceId;
  const sessionId = typeof source.sessionId === 'string' && source.sessionId.trim()
    ? source.sessionId.trim().slice(0, 160)
    : fallback.sessionId;
  return {
    ...(contextType ? { contextType } : {}),
    ...(workspaceId ? { workspaceId } : {}),
    ...(sessionId ? { sessionId } : {}),
    source: sourceKind
  };
}

export function createMemoryId(prefix: string, now = Date.now()): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${now}-${random}`;
}

export function sanitizeProfileMemory(value: unknown, fallbackNow = Date.now()): ProfileMemory | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Partial<ProfileMemory>;
  const roleId = text(source.roleId, 120);
  const content = sanitizeMemoryContent(source.content, 500);
  const kind = PROFILE_MEMORY_KINDS.includes(source.kind as ProfileMemoryKind) ? source.kind as ProfileMemoryKind : null;
  const memorySource = MEMORY_SOURCES.includes(source.source as MemorySource) ? source.source as MemorySource : 'manual';
  if (!roleId || !content || !kind) return null;
  const createdAt = timestamp(source.createdAt, fallbackNow);
  return {
    id: text(source.id, 160) || createMemoryId('profile', createdAt),
    roleId,
    kind,
    content,
    confidence: Math.min(1, Math.max(0, Number.isFinite(source.confidence) ? Number(source.confidence) : 0.5)),
    source: memorySource,
    provenance: normalizeMemoryProvenance(source.provenance),
    reviewState: source.reviewState === 'needs-review' ? 'needs-review' : 'active',
    createdAt,
    updatedAt: timestamp(source.updatedAt, createdAt)
  };
}

export function sanitizeEpisodicMemory(value: unknown, fallbackNow = Date.now()): EpisodicMemory | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Partial<EpisodicMemory>;
  const roleId = text(source.roleId, 120);
  const sessionId = text(source.sessionId, 160);
  const scope = normalizeMemoryScope(source.scope, { contextType: 'personal', sessionId });
  const content = sanitizeMemoryContent(source.content, 1200);
  if (!roleId || !sessionId || !content) return null;
  const createdAt = timestamp(source.createdAt, fallbackNow);
  const tags = Array.isArray(source.tags)
    ? source.tags.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.trim().slice(0, 32)).filter(Boolean).slice(0, 12)
    : [];
  return {
    id: text(source.id, 160) || createMemoryId('episode', createdAt),
    roleId,
    sessionId,
    scope: { ...scope, ...(scope.sessionId ? {} : { sessionId }) },
    content,
    ...(sanitizeMemoryContent(source.emotion, 80) ? { emotion: sanitizeMemoryContent(source.emotion, 80) ?? undefined } : {}),
    importance: Math.min(1, Math.max(0, Number.isFinite(source.importance) ? Number(source.importance) : 0)),
    tags,
    occurredAt: timestamp(source.occurredAt, createdAt),
    createdAt
  };
}

export function sanitizeConversationSummary(value: unknown, fallbackNow = Date.now()): ConversationSummary | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Partial<ConversationSummary>;
  const roleId = text(source.roleId, 120);
  const sessionId = text(source.sessionId, 160);
  const scope = normalizeMemoryScope(source.scope, { contextType: 'personal', sessionId });
  const summary = sanitizeMemoryContent(source.summary, 6000);
  if (!roleId || !sessionId || !summary) return null;
  const updatedAt = timestamp(source.updatedAt, fallbackNow);
  const safeList = (value: unknown): string[] => Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').map((item) => item.trim().slice(0, 180)).filter((item) => item && !isSensitiveMemoryContent(item)).slice(0, 12)
    : [];
  const userMood = sanitizeMemoryContent(source.userMood, 80) ?? undefined;
  return {
    id: text(source.id, 160) || createMemoryId('summary', updatedAt),
    roleId,
    sessionId,
    scope: { ...scope, sessionId: scope.sessionId ?? sessionId },
    summary,
    openTopics: safeList(source.openTopics),
    unfinishedQuestions: safeList(source.unfinishedQuestions),
    ...(userMood ? { userMood } : {}),
    messageCount: Math.max(0, Math.min(2000, Math.round(Number(source.messageCount) || 0))),
    updatedAt
  };
}

function terms(value: string): Set<string> {
  const result = new Set<string>();
  for (const token of value.toLocaleLowerCase().match(/[a-z0-9_]+|[\u4e00-\u9fff]{2,}/gu) ?? []) result.add(token);
  return result;
}

export function memoryRelevanceScore(query: string, content: string, importance = 0.5, updatedAt = Date.now(), now = Date.now()): number {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const normalizedContent = content.toLocaleLowerCase();
  if (!normalizedQuery) return Math.min(1, 0.35 + importance * 0.45);
  const queryTerms = terms(normalizedQuery);
  const contentTerms = terms(normalizedContent);
  const overlap = queryTerms.size === 0 ? 0 : [...queryTerms].filter((term) => contentTerms.has(term)).length / queryTerms.size;
  const phrase = normalizedContent.includes(normalizedQuery) ? 0.35 : 0;
  const ageDays = Math.max(0, now - updatedAt) / 86_400_000;
  const recency = Math.max(0, 1 - ageDays / 90);
  return Math.min(1, Math.max(0, overlap * 0.45 + phrase + importance * 0.25 + recency * 0.2));
}

export function formatMemoryContext(result: MemoryRetrievalResult): string {
  if (result.items.length === 0) return '暂无可用长期记忆；不要编造用户经历。';
  return result.items.map((item) => {
    if (item.kind === 'profile') return `- 用户资料：${item.memory.content}`;
    if (item.kind === 'episodic') return `- 相关经历：${item.memory.content}`;
    return `- 对话摘要：${item.memory.summary}`;
  }).join('\n');
}
