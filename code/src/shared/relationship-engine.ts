export interface RelationshipState {
  roleId: string;
  interactionCount: number;
  trust: number;
  familiarity: number;
  conflict: number;
  continuity: number;
  lastInteractionAt: number | null;
}

export type RelationshipEvent =
  | { type: 'conversation'; now: number; userMessage?: string; assistantMessage?: string }
  | { type: 'normal_interaction' | 'positive_interaction' | 'personal_disclosure' | 'shared_event' | 'conflict' | 'long_absence' | 'return'; now: number; userMessage?: string; assistantMessage?: string }
  | { type: 'repair'; now: number; userMessage?: string; assistantMessage?: string }
  | { type: 'boundary'; now: number; userMessage?: string; assistantMessage?: string };

export type RelationshipEventInput =
  | { type: 'conversation'; now?: number; userMessage?: string; assistantMessage?: string }
  | { type: 'normal_interaction' | 'positive_interaction' | 'personal_disclosure' | 'shared_event' | 'conflict' | 'long_absence' | 'return'; now?: number; userMessage?: string; assistantMessage?: string }
  | { type: 'repair'; now?: number; userMessage?: string; assistantMessage?: string }
  | { type: 'boundary'; now?: number; userMessage?: string; assistantMessage?: string };

export type RelationshipStage = '初识' | '熟悉' | '信赖' | '亲密';

export function relationshipScore(state: RelationshipState): number {
  const safe = sanitizeRelationshipState(state, state.roleId);
  return Math.min(100, Math.max(0, safe.familiarity * 0.45 + safe.trust * 0.4 + safe.continuity * 0.15 - safe.conflict * 0.2));
}

export function createRelationshipState(roleId: string, now: number | null = null): RelationshipState {
  return { roleId, interactionCount: 0, trust: 0, familiarity: 0, conflict: 0, continuity: 0, lastInteractionAt: now };
}

export function sanitizeRelationshipState(value: unknown, roleId: string): RelationshipState {
  const source = value && typeof value === 'object' ? value as Partial<RelationshipState> : {};
  const bounded = (candidate: unknown): number => Number.isFinite(candidate) ? Math.min(100, Math.max(0, Number(candidate))) : 0;
  return {
    roleId,
    interactionCount: Math.max(0, Math.min(100_000, Math.round(Number(source.interactionCount) || 0))),
    trust: bounded(source.trust),
    familiarity: bounded(source.familiarity),
    conflict: bounded(source.conflict),
    continuity: bounded(source.continuity),
    lastInteractionAt: Number.isFinite(source.lastInteractionAt) ? Number(source.lastInteractionAt) : null
  };
}

function hasNegativeCue(value: string): boolean {
  return /生气|难过|失望|不满|讨厌|糟糕|错误|失败|焦虑|不安/u.test(value);
}

export function applyRelationshipEvent(current: RelationshipState, event: RelationshipEvent): RelationshipState {
  const userMessage = 'userMessage' in event ? `${event.userMessage ?? ''}${event.assistantMessage ?? ''}` : '';
  const conversationLike = ['conversation', 'normal_interaction', 'positive_interaction', 'personal_disclosure', 'shared_event', 'conflict'].includes(event.type);
  const negative = event.type === 'conflict' || hasNegativeCue(userMessage);
  const next: RelationshipState = {
    ...current,
    interactionCount: current.interactionCount + (conversationLike ? 1 : 0),
    trust: current.trust,
    familiarity: current.familiarity,
    conflict: current.conflict,
    continuity: current.continuity,
    lastInteractionAt: event.now
  };
  if (conversationLike) {
    next.familiarity = Math.min(100, current.familiarity + 1.2);
    const trustDelta = event.type === 'positive_interaction' || event.type === 'shared_event' ? 1.2 : event.type === 'personal_disclosure' ? 1 : negative ? 0.1 : 0.8;
    next.trust = Math.min(100, Math.max(0, current.trust + trustDelta));
    next.conflict = Math.min(100, Math.max(0, current.conflict + (negative ? 0.8 : -0.2)));
    next.continuity = Math.min(100, current.continuity + (event.type === 'shared_event' ? 2 : 1.5));
  } else if (event.type === 'repair') {
    next.trust = Math.min(100, current.trust + 1.2);
    next.conflict = Math.max(0, current.conflict - 4);
    next.continuity = Math.min(100, current.continuity + 0.5);
  } else if (event.type === 'boundary') {
    next.trust = Math.min(100, current.trust + 0.4);
    next.conflict = Math.max(0, current.conflict - 0.4);
  } else if (event.type === 'long_absence') {
    next.continuity = Math.max(0, current.continuity - 2);
    next.familiarity = Math.max(0, current.familiarity - 0.5);
  } else if (event.type === 'return') {
    next.continuity = Math.min(100, current.continuity + 1);
    next.familiarity = Math.min(100, current.familiarity + 0.5);
  }
  return next;
}

export function relationshipStage(state: RelationshipState): RelationshipStage {
  const score = relationshipScore(state);
  if (score >= 72) return '亲密';
  if (score >= 42) return '信赖';
  if (score >= 16) return '熟悉';
  return '初识';
}

export function relationshipStageIndex(state: RelationshipState, stages: readonly string[]): number {
  if (stages.length === 0) return 0;
  const stage = relationshipStage(state);
  const named = stages.findIndex((label) => label.trim().startsWith(stage));
  if (named >= 0) return named;
  const score = relationshipScore(state);
  return Math.min(stages.length - 1, Math.floor((score / 100) * stages.length));
}

export class RelationshipEngine {
  constructor(private readonly roleId: string, private readonly now: () => number = () => Date.now()) {}

  initial(): RelationshipState {
    return createRelationshipState(this.roleId, this.now());
  }

  apply(state: RelationshipState, event: RelationshipEventInput): RelationshipState {
    return applyRelationshipEvent(sanitizeRelationshipState(state, this.roleId), { ...event, now: event.now ?? this.now() } as RelationshipEvent);
  }

  stage(state: RelationshipState): RelationshipStage {
    return relationshipStage(sanitizeRelationshipState(state, this.roleId));
  }
}
