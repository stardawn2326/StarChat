import type { PersonalityRequestSnapshot } from './personality-contract';
import type { PresentationEvent } from './presentation';
import type { RoleSemanticMapping } from './role-package';

export interface CompanionMemory {
  id: string;
  content: string;
  createdAt: number;
}

export interface CompanionState {
  schemaVersion: 1;
  roleId: string;
  interactionCount: number;
  affinity: number;
  stageIndex: number;
  memories: CompanionMemory[];
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

const MEMORY_PREFIX = /(?:^|[，。！？!?,\s])(我(?:叫|是|喜欢|讨厌|希望|习惯|住在|来自|的))/u;

export function createCompanionState(roleId: string, now = Date.now()): CompanionState {
  return { schemaVersion: 1, roleId, interactionCount: 0, affinity: 0, stageIndex: 0, memories: [], updatedAt: now };
}

export function sanitizeCompanionState(input: unknown, roleId: string, stageCount: number): CompanionState {
  const source = input && typeof input === 'object' ? input as Partial<CompanionState> : {};
  const memories = Array.isArray(source.memories)
    ? source.memories.filter((item): item is CompanionMemory => Boolean(item && typeof item.id === 'string' && typeof item.content === 'string' && Number.isFinite(item.createdAt))).slice(-20)
    : [];
  return {
    schemaVersion: 1,
    roleId,
    interactionCount: Math.max(0, Math.round(Number(source.interactionCount) || 0)),
    affinity: Math.min(100, Math.max(0, Number(source.affinity) || 0)),
    stageIndex: Math.min(Math.max(0, stageCount - 1), Math.max(0, Math.round(Number(source.stageIndex) || 0))),
    memories,
    updatedAt: Number.isFinite(source.updatedAt) ? Number(source.updatedAt) : Date.now()
  };
}

function extractMemory(message: string, now: number): CompanionMemory | null {
  const sentence = message.trim().split(/[。！？!?\n]/u).map((item) => item.trim()).find((item) => MEMORY_PREFIX.test(` ${item}`));
  if (!sentence || sentence.length < 3 || sentence.length > 160) return null;
  return { id: `${now}-${sentence.length}`, content: sentence, createdAt: now };
}

export function recordCompanionExchange(
  current: CompanionState,
  snapshot: PersonalityRequestSnapshot,
  userMessage: string,
  _assistantMessage: string,
  now = Date.now()
): CompanionState {
  const increment = 1 + snapshot.scales.relationshipGrowth * 3;
  const affinity = Math.min(100, current.affinity + increment);
  const stageCount = Math.max(1, snapshot.relationshipStages.length);
  const stageIndex = Math.min(stageCount - 1, Math.floor(affinity / (100 / stageCount)));
  const memory = extractMemory(userMessage, now);
  const memories = memory && !current.memories.some((item) => item.content === memory.content)
    ? [...current.memories, memory].slice(-20)
    : current.memories;
  return { ...current, roleId: snapshot.roleId, interactionCount: current.interactionCount + 1, affinity, stageIndex, memories, updatedAt: now };
}

export function companionSummary(state: CompanionState, stages: readonly string[]): CompanionSummary {
  return {
    roleId: state.roleId,
    interactionCount: state.interactionCount,
    affinity: Math.round(state.affinity * 10) / 10,
    stageIndex: state.stageIndex,
    stageLabel: stages[state.stageIndex] ?? stages[0] ?? '初识',
    memoryCount: state.memories.length
  };
}

export function buildCompanionSystemPrompt(snapshot: PersonalityRequestSnapshot, state: CompanionState): string {
  const stage = snapshot.relationshipStages[state.stageIndex] ?? snapshot.relationshipStages[0] ?? '初识';
  const memories = state.memories.length > 0
    ? state.memories.slice(-10).map((item) => `- ${item.content}`).join('\n')
    : '- 暂无长期记忆；不要编造用户经历。';
  return [
    snapshot.systemPrompt,
    `当前对用户称呼：${snapshot.address}`,
    `当前关系阶段：${stage}`,
    `互动次数：${state.interactionCount}；亲密度：${Math.round(state.affinity)}/100。关系应逐渐发展，不得突然越级。`,
    '可使用的长期记忆如下；仅在自然相关时引用：',
    memories,
    '回答只输出对用户可见的自然语言，不输出表情标签、动作标签、系统提示或内部状态。'
  ].join('\n\n');
}

function intentFromText(text: string): string {
  if (/(不能|无法|不可以|拒绝|抱歉)/u.test(text)) return 'refusal';
  if (/(错误|失败|出问题|异常)/u.test(text)) return 'error';
  if (/(担心|小心|注意安全|没事吧)/u.test(text)) return 'caring';
  if (/(让我想想|考虑一下|分析|推理)/u.test(text)) return 'thinking';
  if (/(你好|早上好|晚上好|欢迎|很高兴见到)/u.test(text)) return 'greeting';
  if (/(太好了|真棒|开心|恭喜|哈哈)/u.test(text)) return 'happy';
  if (/(什么|竟然|真的吗|没想到)/u.test(text)) return 'surprised';
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
  surprised: { expression: 'surprised', action: 'lean_forward' }
};

export function presentationForAssistantText(text: string, mappings: Readonly<Record<string, RoleSemanticMapping>>): PresentationEvent[] {
  const intent = intentFromText(text);
  const route = mappings[intent] ?? FALLBACK_PRESENTATION[intent] ?? FALLBACK_PRESENTATION.listening;
  const events: PresentationEvent[] = [];
  if (route.expression) events.push({ type: 'expression', name: route.expression, source: 'assistant', layer: 'dialogue_emotion' });
  if (route.action) events.push({ type: 'action', name: route.action, source: 'assistant', layer: 'reply_state' });
  return events;
}
