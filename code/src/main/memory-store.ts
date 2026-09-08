import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  MEMORY_SCHEMA_VERSION,
  normalizeProfileFact,
  sanitizeConversationSummary,
  sanitizeEpisodicMemory,
  sanitizeProfileMemory,
  type MemoryReviewState,
  type MemoryQuarantineItem,
  type ConversationSummary,
  type EpisodicMemory,
  type MemorySnapshot,
  type ProfileMemory
} from '../shared/memory';
import { sameMemoryContext, sameMemorySummaryScope, type MemoryScope } from '../shared/memory-scope';

interface PersistedMemorySnapshot {
  version?: number;
  profile?: unknown[];
  episodic?: unknown[];
  summaries?: unknown[];
  quarantine?: unknown[];
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class MemoryStore {
  private readonly filePath: string;
  private profile: ProfileMemory[] = [];
  private episodic: EpisodicMemory[] = [];
  private summaries: ConversationSummary[] = [];
  private quarantine: MemoryQuarantineItem[] = [];

  constructor(filePath: string) {
    this.filePath = filePath;
    mkdirSync(dirname(filePath), { recursive: true });
    this.load();
  }

  snapshot(): MemorySnapshot {
    return clone({
      version: MEMORY_SCHEMA_VERSION,
      profile: this.profile,
      episodic: this.episodic,
      summaries: this.summaries,
      quarantine: this.quarantine
    });
  }

  listProfile(roleId: string, reviewState?: MemoryReviewState): ProfileMemory[] {
    return clone(this.profile
      .filter((memory) => memory.roleId === roleId && (!reviewState || memory.reviewState === reviewState))
      .sort((a, b) => b.updatedAt - a.updatedAt));
  }

  listPendingProfile(roleId: string): ProfileMemory[] {
    return this.listProfile(roleId, 'needs-review');
  }

  saveProfile(input: unknown): ProfileMemory {
    const memory = sanitizeProfileMemory(input);
    if (!memory) throw new Error('资料记忆为空或包含敏感信息');
    const duplicate = this.profile.find((item) => item.roleId === memory.roleId
      && item.kind === memory.kind
      && (item.content === memory.content || normalizeProfileFact(item.content) === normalizeProfileFact(memory.content)));
    if (duplicate) {
      duplicate.confidence = Math.max(duplicate.confidence, memory.confidence);
      duplicate.updatedAt = memory.updatedAt;
      duplicate.provenance = memory.provenance;
      if (memory.source === 'user_explicit' && duplicate.reviewState === 'needs-review') {
        duplicate.content = memory.content;
        duplicate.source = memory.source;
        duplicate.reviewState = 'active';
      } else if (memory.reviewState === 'needs-review') {
        duplicate.reviewState = 'needs-review';
      }
      this.flush();
      return clone(duplicate);
    }
    this.profile = [...this.profile.filter((item) => item.id !== memory.id), memory].slice(-200);
    this.flush();
    return clone(memory);
  }

  deleteProfile(roleId: string, id: string): void {
    this.profile = this.profile.filter((memory) => !(memory.roleId === roleId && memory.id === id));
    this.flush();
  }

  reviewProfile(roleId: string, id: string, reviewState: MemoryReviewState): ProfileMemory | null {
    const memory = this.profile.find((item) => item.roleId === roleId && item.id === id);
    if (!memory) return null;
    memory.reviewState = reviewState;
    memory.updatedAt = Date.now();
    this.flush();
    return clone(memory);
  }

  listEpisodic(roleId: string, scope?: MemoryScope): EpisodicMemory[] {
    return clone(this.episodic
      .filter((memory) => memory.roleId === roleId && (!scope || sameMemoryContext(memory.scope, scope)))
      .sort((a, b) => b.occurredAt - a.occurredAt));
  }

  saveEpisodic(input: unknown): EpisodicMemory {
    const memory = sanitizeEpisodicMemory(input);
    if (!memory || memory.importance < 0.6) throw new Error('事件记忆未达到重要性阈值或包含敏感信息');
    const duplicate = this.episodic.find((item) => item.roleId === memory.roleId
      && item.sessionId === memory.sessionId
      && sameMemoryContext(item.scope, memory.scope)
      && item.content === memory.content);
    if (duplicate) {
      duplicate.importance = Math.max(duplicate.importance, memory.importance);
      duplicate.occurredAt = Math.max(duplicate.occurredAt, memory.occurredAt);
      this.flush();
      return clone(duplicate);
    }
    this.episodic = [...this.episodic.filter((item) => item.id !== memory.id), memory].slice(-400);
    this.flush();
    return clone(memory);
  }

  getSummary(sessionId: string): ConversationSummary | null {
    const summary = this.summaries.find((item) => item.sessionId === sessionId);
    return summary ? clone(summary) : null;
  }

  listSummaries(roleId: string, scope?: MemoryScope): ConversationSummary[] {
    return clone(this.summaries
      .filter((summary) => summary.roleId === roleId && (!scope || sameMemorySummaryScope(summary.scope, scope)))
      .sort((a, b) => b.updatedAt - a.updatedAt));
  }

  saveSummary(input: unknown): ConversationSummary {
    const summary = sanitizeConversationSummary(input);
    if (!summary) throw new Error('对话摘要为空或包含敏感信息');
    this.summaries = [...this.summaries.filter((item) => item.sessionId !== summary.sessionId), summary].slice(-200);
    this.flush();
    return clone(summary);
  }

  clearRole(roleId: string): void {
    this.profile = this.profile.filter((memory) => memory.roleId !== roleId);
    this.episodic = this.episodic.filter((memory) => memory.roleId !== roleId);
    this.summaries = this.summaries.filter((summary) => summary.roleId !== roleId);
    this.quarantine = this.quarantine.filter((item) => {
      if (!item.payload || typeof item.payload !== 'object') return true;
      return (item.payload as { roleId?: unknown }).roleId !== roleId;
    });
    this.flush();
  }

  private load(): void {
    if (!existsSync(this.filePath)) return;
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as PersistedMemorySnapshot;
      if (parsed.version !== 1 && parsed.version !== 2 && parsed.version !== MEMORY_SCHEMA_VERSION) return;
      const isCurrentSchema = parsed.version === MEMORY_SCHEMA_VERSION;
      this.profile = Array.isArray(parsed.profile)
        ? parsed.profile.map((item) => {
            const memory = sanitizeProfileMemory(item);
            return memory && !isCurrentSchema
              ? {
                  ...memory,
                  provenance: { contextType: 'personal' as const, source: 'legacy' as const },
                  reviewState: 'needs-review' as const
                }
              : memory;
          }).filter((item): item is ProfileMemory => Boolean(item)).slice(-200)
        : [];
      this.episodic = isCurrentSchema && Array.isArray(parsed.episodic)
        ? parsed.episodic.map((item) => sanitizeEpisodicMemory(item)).filter((item): item is EpisodicMemory => Boolean(item && item.importance >= 0.6)).slice(-400)
        : [];
      this.summaries = isCurrentSchema && Array.isArray(parsed.summaries)
        ? parsed.summaries.map((item) => sanitizeConversationSummary(item)).filter((item): item is ConversationSummary => Boolean(item)).slice(-200)
        : [];
      this.quarantine = isCurrentSchema && Array.isArray(parsed.quarantine)
        ? parsed.quarantine.filter((item): item is MemoryQuarantineItem => Boolean(item && typeof item === 'object'
          && typeof (item as MemoryQuarantineItem).id === 'string'
          && ((item as MemoryQuarantineItem).kind === 'episodic' || (item as MemoryQuarantineItem).kind === 'summary')
          && ((item as MemoryQuarantineItem).reason === 'unknown-session' || (item as MemoryQuarantineItem).reason === 'invalid-legacy-record')
          && Number.isFinite((item as MemoryQuarantineItem).quarantinedAt))).slice(-400)
        : [];
    } catch {
      this.profile = [];
      this.episodic = [];
      this.summaries = [];
      this.quarantine = [];
    }
  }

  private flush(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;
    writeFileSync(temporary, JSON.stringify(this.snapshot(), null, 2), 'utf8');
    renameSync(temporary, this.filePath);
  }
}
