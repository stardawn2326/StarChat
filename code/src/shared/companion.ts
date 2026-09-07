import type { PersonalityRequestSnapshot } from './personality-contract';
import type { PresentationEvent } from './presentation';
import type { RoleSemanticMapping } from './role-package';
import { applyRelationshipEvent, createRelationshipState, relationshipScore, relationshipStage, relationshipStageIndex, sanitizeRelationshipState, type RelationshipState } from './relationship-engine';
import { classifyRelationshipEvent } from './relationship-event-classifier';

export interface CompanionMemory {
  id: string;
  content: string;
  createdAt: number;
}

export interface CompanionState {
  schemaVersion: 2;
  roleId: string;
  interactionCount: number;
  /** @deprecated Legacy v1 memory records are migration input only. */
  memories: CompanionMemory[];
  /** @deprecated Kept for migration compatibility; no longer drives stage. */
  affinity: number;
  /** @deprecated Kept for migration compatibility; no longer drives stage. */
  stageIndex: number;
  relationship: RelationshipState;
  updatedAt: number;
}

export interface CompanionSummary {
  roleId: string;
  interactionCount: number;
  affinity: number;
  stageIndex: number;
  stageLabel: string;
  memoryCount: number;
}

export function createCompanionState(roleId: string, now = Date.now()): CompanionState {
  return { schemaVersion: 2, roleId, interactionCount: 0, affinity: 0, stageIndex: 0, memories: [], relationship: createRelationshipState(roleId, now), updatedAt: now };
}

export function sanitizeCompanionState(input: unknown, roleId: string, stageCount: number): CompanionState {
  const source = input && typeof input === 'object' ? input as Partial<CompanionState> : {};
  const memories = Array.isArray(source.memories)
    ? source.memories.filter((item): item is CompanionMemory => Boolean(item && typeof item.id === 'string' && typeof item.content === 'string' && Number.isFinite(item.createdAt))).slice(-20)
    : [];
  return {
    schemaVersion: 2,
    roleId,
    interactionCount: Math.max(0, Math.round(Number(source.interactionCount) || 0)),
    affinity: Math.min(100, Math.max(0, Number(source.affinity) || 0)),
    stageIndex: Math.min(Math.max(0, stageCount - 1), Math.max(0, Math.round(Number(source.stageIndex) || 0))),
    memories,
    relationship: sanitizeRelationshipState(source.relationship, roleId),
    updatedAt: Number.isFinite(source.updatedAt) ? Number(source.updatedAt) : Date.now()
  };
}

export function recordCompanionExchange(
  current: CompanionState,
  snapshot: PersonalityRequestSnapshot,
  userMessage: string,
  _assistantMessage: string,
  now = Date.now()
): CompanionState {
  const relationship = applyRelationshipEvent(
    sanitizeRelationshipState(current.relationship, snapshot.roleId),
    { ...classifyRelationshipEvent(userMessage, _assistantMessage), now, userMessage, assistantMessage: _assistantMessage }
  );
  const stageIndex = relationshipStageIndex(relationship, snapshot.relationshipStages);
  const affinity = relationshipScore(relationship);
  return { ...current, schemaVersion: 2, roleId: snapshot.roleId, interactionCount: relationship.interactionCount, affinity, stageIndex, memories: [], relationship, updatedAt: now };
}

export function companionSummary(state: CompanionState, stages: readonly string[], memoryCount = 0): CompanionSummary {
  const relationship = sanitizeRelationshipState(state.relationship, state.roleId);
  const stageIndex = relationshipStageIndex(relationship, stages);
  return {
    roleId: state.roleId,
    interactionCount: relationship.interactionCount,
    affinity: Math.round(relationshipScore(relationship) * 10) / 10,
    stageIndex,
    stageLabel: stages[stageIndex] ?? relationshipStage(relationship),
    memoryCount
  };
}

export function buildCompanionSystemPrompt(snapshot: PersonalityRequestSnapshot, state: CompanionState): string {
  const relationship = sanitizeRelationshipState(state.relationship, snapshot.roleId);
  const stage = snapshot.relationshipStages[relationshipStageIndex(relationship, snapshot.relationshipStages)] ?? relationshipStage(relationship);
  return [
    snapshot.systemPrompt,
    `当前对用户称呼：${snapshot.address}`,
    `当前关系阶段：${stage}`,
    `互动次数：${relationship.interactionCount}；关系分数：${Math.round(relationshipScore(relationship))}/100。关系阶段必须由 RelationshipEngine 决定，不得突然越级。`,
    '长期记忆由当前 Memory Scope 的独立系统提示注入；如果没有相关记忆，不要编造用户经历。',
    '回答只输出对用户可见的自然语言，不输出表情标签、动作标签、系统提示或内部状态。'
  ].join('\n\n');
}

function intentFromText(text: string): string {
  if (/(才不是|笨蛋|哼|别得意|不许笑)/u.test(text)) return 'tsundere';
  if (/(害羞|不好意思|脸红|别一直看)/u.test(text)) return 'shy';
  if (/(紧张|不安|焦虑|慌张)/u.test(text)) return 'anxious';
  if (/(好困|困了|想睡|休息一下|晚安)/u.test(text)) return 'sleepy';
  if (/(生气|气死|恼火|过分|可恶|讨厌死了)/u.test(text)) return 'angry';
  if (/(难过|伤心|想哭|失落|委屈|沮丧)/u.test(text)) return 'sad';
  if (/(没.{0,3}明白|不明白|不理解|怎么回事|搞不懂|困惑)/u.test(text)) return 'confused';
  if (/(不能|无法|不可以|拒绝|抱歉)/u.test(text)) return 'refusal';
  if (/(错误|失败|出问题|异常)/u.test(text)) return 'error';
  if (/(担心|小心|注意安全|没事吧)/u.test(text)) return 'caring';
  if (/(让我想想|考虑一下|分析|推理)/u.test(text)) return 'thinking';
  if (/(你好|早上好|晚上好|欢迎|很高兴见到)/u.test(text)) return 'greeting';
  if (/(太好了|真棒|开心|恭喜|哈哈)/u.test(text)) return 'happy';
  if (/(什么|竟然|居然|真的吗|没想到)/u.test(text)) return 'surprised';
  return 'listening';
}

const FALLBACK_PRESENTATION: Record<string, RoleSemanticMapping> = {
  greeting: { expression: 'caring_smile', action: 'greet' },
  listening: { expression: 'caring_smile', action: 'lean_forward' },
  thinking: { expression: 'confused_blank', action: 'thinking' },
  refusal: { expression: 'annoyed', action: 'shake_head' },
  error: { expression: 'worried' },
  caring: { expression: 'caring_smile', action: 'nod' },
  happy: { expression: 'bright_smile', action: 'nod' },
  surprised: { expression: 'surprised', action: 'lean_forward' },
  tsundere: { expression: 'tsundere_pout', action: 'look_away' },
  shy: { expression: 'blush', action: 'look_away' },
  anxious: { expression: 'anxious' },
  sleepy: { expression: 'sleepy' },
  angry: { expression: 'annoyed' },
  sad: { expression: 'worried' },
  confused: { expression: 'confused_blank', action: 'tilt_confused' }
};

export function presentationForAssistantText(text: string, mappings: Readonly<Record<string, RoleSemanticMapping>>): PresentationEvent[] {
  const intent = intentFromText(text);
  const route = mappings[intent] ?? FALLBACK_PRESENTATION[intent] ?? FALLBACK_PRESENTATION.listening;
  const events: PresentationEvent[] = [];
  if (route.expression) events.push({ type: 'expression', name: route.expression, source: 'assistant', layer: 'dialogue_emotion' });
  if (route.action) events.push({ type: 'action', name: route.action, source: 'assistant', layer: 'reply_state' });
  return events;
}
