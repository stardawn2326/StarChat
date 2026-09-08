import {
  createMemoryId,
  formatMemoryContext,
  isSensitiveMemoryContent,
  memoryRelevanceScore,
  sanitizeMemoryContent,
  type ConversationSummary,
  type EpisodicMemory,
  type MemoryQuery,
  type MemoryProvenance,
  type MemoryReviewState,
  type MemoryRetrievalResult,
  type ProfileMemory,
  type ProfileMemoryKind
} from '../shared/memory';
import { normalizeMemoryScope, type MemoryScope } from '../shared/memory-scope';
import { MemoryStore } from './memory-store';

export interface MemoryConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  createdAt?: number;
}

export interface MemoryServiceOptions {
  store: MemoryStore;
  now?: () => number;
  enabled?: boolean | (() => boolean);
  summaryMessageInterval?: number;
  summaryCharacterThreshold?: number;
}

export interface ProfileMemoryCandidate {
  roleId: string;
  kind: ProfileMemoryKind;
  content: string;
  confidence?: number;
  source?: 'user_explicit' | 'assistant_inferred' | 'manual';
  provenance?: MemoryProvenance;
}

export interface MemorySessionContext {
  roleId: string;
  sessionId: string;
  scope: MemoryScope;
  source: 'companion' | 'agent';
  messages: readonly MemoryConversationMessage[];
}

export class MemoryExtractor {
  extractProfileCandidates(messages: readonly MemoryConversationMessage[], roleId: string): ProfileMemoryCandidate[] {
    const candidates: ProfileMemoryCandidate[] = [];
    for (const message of messages) {
      if (message.role !== 'user') continue;
      for (const sentence of sentences(message.content)) {
        const kind = kindForSentence(sentence);
        if (!kind || sentence.length < 3 || sentence.length > 500 || isSensitiveMemoryContent(sentence)) continue;
        candidates.push({ roleId, kind, content: sentence, confidence: 0.92, source: 'user_explicit' });
      }
    }
    return candidates.filter((candidate, index) => candidates.findIndex((item) => item.kind === candidate.kind && item.content === candidate.content) === index).slice(-12);
  }
}

function compact(value: string, maximum: number): string {
  return value.replace(/\s+/gu, ' ').trim().slice(0, maximum);
}

function sentences(value: string): string[] {
  return value.split(/[。！？!?\n]/u).map((item) => compact(item, 500)).filter(Boolean);
}

function kindForSentence(value: string): ProfileMemoryKind | null {
  const stable = value.replace(/^我(?:(?:现在)?(?:还是|仍然|依然|还))?/u, '我');
  if (/^我(?:叫|的名字是)/u.test(stable)) return 'name';
  if (/^我是/u.test(stable)) return 'identity';
  if (/^我(?:喜欢|偏好|爱)/u.test(stable)) return 'preference';
  if (/^我(?:习惯|通常|一般会)/u.test(stable)) return 'habit';
  if (/^我的(?:朋友|家人|同事|伴侣)/u.test(stable)) return 'person';
  if (/^我的(?:项目|工作|计划|目标)/u.test(stable)) return 'project';
  if (/^我(?:不喜欢|讨厌|不希望|不要)/u.test(stable)) return 'boundary';
  return null;
}

function isEnabled(value: MemoryServiceOptions['enabled']): boolean {
  return typeof value === 'function' ? value() : value !== false;
}

export class MemoryService {
  private readonly nowFn: () => number;
  private readonly summaryMessageInterval: number;
  private readonly summaryCharacterThreshold: number;
  private readonly extractor = new MemoryExtractor();

  constructor(private readonly options: MemoryServiceOptions) {
    this.nowFn = options.now ?? (() => Date.now());
    this.summaryMessageInterval = Math.max(2, Math.round(options.summaryMessageInterval ?? 20));
    this.summaryCharacterThreshold = Math.max(1000, Math.round(options.summaryCharacterThreshold ?? 6000));
  }

  private now(): number {
    return this.nowFn();
  }

  extractProfileCandidates(messages: readonly MemoryConversationMessage[], roleId: string): ProfileMemoryCandidate[] {
    return this.extractor.extractProfileCandidates(messages, roleId);
  }

  rememberProfile(candidate: ProfileMemoryCandidate | ProfileMemory): ProfileMemory | null {
    if (candidate.confidence !== undefined && candidate.confidence < 0.5) return null;
    if (!candidate.content || isSensitiveMemoryContent(candidate.content)) throw new Error('敏感信息不会写入长期记忆');
    return this.options.store.saveProfile({
      ...candidate,
      id: 'id' in candidate ? candidate.id : createMemoryId('profile', this.now()),
      confidence: candidate.confidence ?? 0.7,
      source: candidate.source ?? 'manual',
      provenance: candidate.provenance ?? { contextType: 'personal', source: 'manual' },
      createdAt: 'createdAt' in candidate ? candidate.createdAt : this.now(),
      updatedAt: this.now()
    });
  }

  rememberEpisode(input: { roleId: string; sessionId: string; scope?: MemoryScope; content: string; emotion?: string; importance: number; tags?: string[]; occurredAt?: number }): EpisodicMemory | null {
    if (input.importance < 0.6) return null;
    if (isSensitiveMemoryContent(input.content)) throw new Error('敏感信息不会写入事件记忆');
    return this.options.store.saveEpisodic({
      ...input,
      scope: normalizeMemoryScope(input.scope, { contextType: 'personal', sessionId: input.sessionId }),
      id: createMemoryId('episode', this.now()),
      occurredAt: input.occurredAt ?? this.now(),
      createdAt: this.now()
    });
  }

  summarizeConversation(roleId: string, sessionId: string, messages: readonly MemoryConversationMessage[], scope: MemoryScope = normalizeMemoryScope({ contextType: 'personal', sessionId })): ConversationSummary | null {
    const safeMessages = messages.slice(-20).map((message) => {
      const content = sanitizeMemoryContent(message.content, 260);
      return content ? { ...message, content } : null;
    }).filter((message): message is MemoryConversationMessage => Boolean(message));
    if (safeMessages.length === 0) return null;
    const summary = compact(safeMessages.map((message) => `${message.role === 'user' ? '用户' : '角色'}：${message.content}`).join('；'), 6000);
    if (!summary) return null;
    const questions = safeMessages.filter((message) => message.role === 'user' && /[？?]|(?:吗|如何|怎么|为什么|哪个|什么)[^。！？!?]{0,30}$/u.test(message.content)).map((message) => compact(message.content, 180)).slice(-8);
    const moodMessage = [...safeMessages].reverse().find((message: MemoryConversationMessage) => message.role === 'user' && /开心|难过|生气|焦虑|紧张|疲惫|困|担心/u.test(message.content));
    const userMood = moodMessage?.content.match(/开心|难过|生气|焦虑|紧张|疲惫|困|担心/u)?.[0];
    return this.options.store.saveSummary({
      id: createMemoryId('summary', this.now()),
      roleId,
      sessionId,
      scope: normalizeMemoryScope(scope, { contextType: 'personal', sessionId }),
      summary,
      openTopics: questions.slice(-6),
      unfinishedQuestions: questions.slice(-6),
      ...(userMood ? { userMood } : {}),
      messageCount: messages.length,
      updatedAt: this.now()
    });
  }

  recordConversation(context: MemorySessionContext): ConversationSummary | null;
  recordConversation(roleId: string, sessionId: string, messages: readonly MemoryConversationMessage[]): ConversationSummary | null;
  recordConversation(
    contextOrRoleId: MemorySessionContext | string,
    legacySessionId?: string,
    legacyMessages?: readonly MemoryConversationMessage[]
  ): ConversationSummary | null {
    if (!isEnabled(this.options.enabled)) return null;
    const context: MemorySessionContext = typeof contextOrRoleId === 'string'
      ? {
          roleId: contextOrRoleId,
          sessionId: legacySessionId ?? '',
          scope: normalizeMemoryScope({ contextType: 'personal', sessionId: legacySessionId }),
          source: 'companion',
          messages: legacyMessages ?? []
        }
      : {
          ...contextOrRoleId,
          scope: normalizeMemoryScope(contextOrRoleId.scope, contextOrRoleId.scope)
        };
    if (!context.sessionId || context.messages.length === 0) return null;
    const canWritePersonalProfile = context.source === 'companion' && context.scope.contextType === 'personal';
    if (canWritePersonalProfile) for (const candidate of this.extractProfileCandidates(context.messages, context.roleId)) {
      try {
      this.rememberProfile({
        ...candidate,
        provenance: {
          contextType: context.scope.contextType,
          ...(context.scope.workspaceId ? { workspaceId: context.scope.workspaceId } : {}),
          sessionId: context.sessionId,
          source: context.source
        }
      });
      } catch {
        // Sensitive candidates are deliberately rejected and never persisted.
      }
    }
    const characterCount = context.messages.reduce((total, message) => total + message.content.length, 0);
    if (context.messages.length < this.summaryMessageInterval && characterCount < this.summaryCharacterThreshold) return null;
    return this.summarizeConversation(context.roleId, context.sessionId, context.messages, context.scope);
  }

  retrieve(query: MemoryQuery): MemoryRetrievalResult {
    const limit = Math.min(8, Math.max(3, Math.round(query.limit ?? 5)));
    const now = this.now();
    const normalizedQuery = compact(query.query ?? '', 500);
    const scope = normalizeMemoryScope(query.scope ?? { contextType: 'personal', sessionId: query.sessionId });
    const items: MemoryRetrievalResult['items'] = [
      ...(scope.contextType === 'personal' ? this.options.store.listProfile(query.roleId, 'active').map((memory) => ({ kind: 'profile' as const, score: memoryRelevanceScore(normalizedQuery, memory.content, memory.confidence, memory.updatedAt, now), memory })) : []),
      ...this.options.store.listEpisodic(query.roleId, scope).map((memory) => ({ kind: 'episodic' as const, score: memoryRelevanceScore(normalizedQuery, memory.content, memory.importance, memory.occurredAt, now), memory })),
      ...this.options.store.listSummaries(query.roleId, scope).map((memory) => ({ kind: 'summary' as const, score: memoryRelevanceScore(normalizedQuery, memory.summary, 0.55, memory.updatedAt, now), memory }))
    ].sort((left, right) => right.score - left.score).slice(0, limit);
    return {
      query: normalizedQuery,
      items,
      profile: items.filter((item): item is Extract<typeof item, { kind: 'profile' }> => item.kind === 'profile').map((item) => item.memory),
      episodic: items.filter((item): item is Extract<typeof item, { kind: 'episodic' }> => item.kind === 'episodic').map((item) => item.memory),
      summaries: items.filter((item): item is Extract<typeof item, { kind: 'summary' }> => item.kind === 'summary').map((item) => item.memory)
    };
  }

  contextFor(query: MemoryQuery): string {
    if (!isEnabled(this.options.enabled)) return '暂无可用长期记忆；长期记忆已关闭。';
    return formatMemoryContext(this.retrieve(query));
  }

  listProfile(roleId: string): ProfileMemory[] {
    return this.options.store.listProfile(roleId);
  }

  listPendingProfile(roleId: string): ProfileMemory[] {
    return this.options.store.listPendingProfile(roleId);
  }

  reviewProfile(roleId: string, id: string, reviewState: MemoryReviewState): ProfileMemory | null {
    return this.options.store.reviewProfile(roleId, id, reviewState);
  }

  deleteProfile(roleId: string, id: string): void {
    this.options.store.deleteProfile(roleId, id);
  }

  clearRoleMemory(roleId: string): void {
    this.options.store.clearRole(roleId);
  }
}
