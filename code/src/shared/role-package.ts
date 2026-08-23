export const SEMANTIC_EXPRESSIONS = [
  'neutral',
  'caring_smile',
  'bright_smile',
  'annoyed',
  'embarrassed',
  'tsundere_pout',
  'worried',
  'anxious',
  'blush',
  'surprised',
  'confused_blank',
  'sleepy'
] as const;

export const SEMANTIC_ACTIONS = [
  'idle',
  'greet',
  'look_away',
  'lean_forward',
  'nod',
  'shake_head',
  'thinking',
  'stretch'
] as const;

export type ExpressionName = (typeof SEMANTIC_EXPRESSIONS)[number];
export type ActionName = (typeof SEMANTIC_ACTIONS)[number];

export const ROLE_SCALE_KEYS = [
  'tsundere',
  'warmth',
  'patience',
  'initiative',
  'teasing',
  'assertiveness',
  'curiosity',
  'expressiveness',
  'intimacy',
  'replyLength',
  'humor',
  'ditziness',
  'relationshipGrowth',
  'proactiveFrequency'
] as const;

export type RoleScaleKey = (typeof ROLE_SCALE_KEYS)[number];
export type RoleScales = Record<RoleScaleKey, number>;

export const DEFAULT_ROLE_SCALES: RoleScales = {
  tsundere: 0.78,
  warmth: 0.7,
  patience: 0.82,
  initiative: 0.38,
  teasing: 0.42,
  assertiveness: 0.72,
  curiosity: 0.55,
  expressiveness: 0.62,
  intimacy: 0.28,
  replyLength: 0.48,
  humor: 0.35,
  ditziness: 0.2,
  relationshipGrowth: 0.32,
  proactiveFrequency: 0.16
};

export interface RoleSemanticMapping {
  expression?: ExpressionName;
  action?: ActionName;
}

export interface RolePackage {
  schemaVersion: 2;
  id: string;
  displayName: string;
  identity: {
    name: string;
    address: string;
    identity: string;
    background: string;
  };
  personality: {
    summary: string;
    core: string;
    speechStyle: string;
    likes: string;
    dislikes: string;
    boundaries: string;
    proactiveStyle: string;
    emotionalTendency: string;
    systemPrompt: string;
    relationshipStages: string[];
    scales: RoleScales;
  };
  visual: {
    description: string;
    palette: string[];
    defaultOutfit: string;
    modelAsset: string | null;
  };
  presentation: {
    expressions: ExpressionName[];
    actions: ActionName[];
    semanticMappings: Record<string, RoleSemanticMapping>;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function requireString(value: unknown, field: string, fallback = ''): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (fallback) return fallback;
  throw new Error(`角色包字段无效：${field}`);
}

function requireStringArray(value: unknown, field: string, fallback: string[] = []): string[] {
  if (value === undefined && fallback.length > 0) return fallback;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`角色包字段无效：${field}`);
  }
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function requireAllowed<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
  fallback: T[]
): T[] {
  const candidate = value === undefined ? fallback : value;
  if (!Array.isArray(candidate) || candidate.some((item) => !allowed.includes(item as T))) {
    throw new Error(`角色包包含未允许的语义名称：${field}`);
  }
  return [...new Set(candidate as T[])];
}

function sanitizeScales(value: unknown): RoleScales {
  const record = isRecord(value) ? value : {};
  return Object.fromEntries(
    ROLE_SCALE_KEYS.map((key) => {
      const number = Number(record[key]);
      const fallback = DEFAULT_ROLE_SCALES[key];
      return [key, Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : fallback];
    })
  ) as RoleScales;
}

function sanitizeSemanticMappings(value: unknown): Record<string, RoleSemanticMapping> {
  if (!isRecord(value)) {
    return {
      greeting: { expression: 'caring_smile', action: 'greet' },
      listening: { expression: 'caring_smile', action: 'lean_forward' },
      thinking: { expression: 'confused_blank', action: 'thinking' },
      refusal: { expression: 'annoyed', action: 'shake_head' },
      error: { expression: 'worried' }
    };
  }
  const result: Record<string, RoleSemanticMapping> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!isRecord(raw)) continue;
    const expression = raw.expression;
    const action = raw.action;
    if (
      (expression !== undefined && !SEMANTIC_EXPRESSIONS.includes(expression as ExpressionName)) ||
      (action !== undefined && !SEMANTIC_ACTIONS.includes(action as ActionName))
    ) {
      throw new Error(`角色包包含未允许的语义映射：${key}`);
    }
    if (expression !== undefined || action !== undefined) {
      result[key] = {
        ...(expression === undefined ? {} : { expression: expression as ExpressionName }),
        ...(action === undefined ? {} : { action: action as ActionName })
      };
    }
  }
  return result;
}

export function validateRolePackage(input: unknown): RolePackage {
  if (!isRecord(input)) throw new Error('角色包必须是 JSON 对象');
  if ('apiKey' in input || 'secrets' in input) throw new Error('角色包不得包含 API Key 或 secrets');
  const schemaVersion = Number(input.schemaVersion);
  if (schemaVersion !== 1 && schemaVersion !== 2) {
    throw new Error('暂只支持 schemaVersion=1 或 2 的角色包');
  }
  const personality = isRecord(input.personality) ? input.personality : {};
  const identity = isRecord(input.identity) ? input.identity : {};
  const visual = isRecord(input.visual) ? input.visual : {};
  const presentation = isRecord(input.presentation) ? input.presentation : {};
  const displayName = requireString(input.displayName, 'displayName');
  const modelAsset = visual.modelAsset;
  if (modelAsset !== null && modelAsset !== undefined && typeof modelAsset !== 'string') {
    throw new Error('角色包字段无效：visual.modelAsset');
  }
  return {
    schemaVersion: 2,
    id: requireString(input.id, 'id'),
    displayName,
    identity: {
      name: requireString(identity.name, 'identity.name', displayName),
      address: requireString(identity.address, 'identity.address', '用户'),
      identity: requireString(identity.identity, 'identity.identity', '陪伴型 AI'),
      background: requireString(identity.background, 'identity.background', '正在逐步了解用户的本地陪伴型 AI。')
    },
    personality: {
      summary: requireString(personality.summary, 'personality.summary'),
      core: requireString(personality.core, 'personality.core', String(personality.summary ?? '保持核心人格。')),
      speechStyle: requireString(personality.speechStyle, 'personality.speechStyle', '自然、简洁、尊重边界。'),
      likes: requireString(personality.likes, 'personality.likes', '真诚交流、清晰的请求。'),
      dislikes: requireString(personality.dislikes, 'personality.dislikes', '危险请求、无视边界和空泛命令。'),
      boundaries: requireString(personality.boundaries, 'personality.boundaries', '拒绝危险、违法或超出权限的请求。'),
      proactiveStyle: requireString(personality.proactiveStyle, 'personality.proactiveStyle', '低频、在合适时主动关心。'),
      emotionalTendency: requireString(personality.emotionalTendency, 'personality.emotionalTendency', '温和但会表达不满和担心。'),
      systemPrompt: requireString(personality.systemPrompt, 'personality.systemPrompt'),
      relationshipStages: requireStringArray(personality.relationshipStages, 'personality.relationshipStages', ['初识：礼貌克制。']),
      scales: sanitizeScales(personality.scales)
    },
    visual: {
      description: requireString(visual.description, 'visual.description', '保持角色视觉设定。'),
      palette: requireStringArray(visual.palette, 'visual.palette', ['#F6F3FF']),
      defaultOutfit: requireString(visual.defaultOutfit, 'visual.defaultOutfit', '默认服装。'),
      modelAsset: modelAsset === undefined ? null : modelAsset
    },
    presentation: {
      expressions: requireAllowed(presentation.expressions, SEMANTIC_EXPRESSIONS, 'presentation.expressions', [
        'neutral', 'caring_smile', 'annoyed', 'worried'
      ]),
      actions: requireAllowed(presentation.actions, SEMANTIC_ACTIONS, 'presentation.actions', [
        'idle', 'greet', 'thinking', 'shake_head'
      ]),
      semanticMappings: sanitizeSemanticMappings(presentation.semanticMappings)
    }
  };
}

export function cloneRolePackage(role: RolePackage, id: string, displayName: string): RolePackage {
  const cloned = structuredClone(role) as RolePackage;
  cloned.id = id;
  cloned.displayName = displayName;
  cloned.identity.name = displayName;
  return validateRolePackage(cloned);
}

export function createBlankRolePackage(id: string, displayName = '新角色'): RolePackage {
  return validateRolePackage({
    schemaVersion: 2,
    id,
    displayName,
    identity: {
      name: displayName,
      address: '你',
      identity: '陪伴型 AI 角色',
      background: '这是一个等待完善设定的自定义角色。'
    },
    personality: {
      summary: '保持自然、尊重边界的自定义角色。',
      core: '保持独立判断、尊重用户和清晰边界。',
      speechStyle: '自然、简洁。',
      likes: '真诚交流。',
      dislikes: '危险请求和无视边界。',
      boundaries: '拒绝危险、违法或超出权限的请求。',
      proactiveStyle: '仅在合适时低频主动。',
      emotionalTendency: '平稳、真诚。',
      systemPrompt: '你是一个可自定义的陪伴型角色。保持独立判断、尊重用户，不得声称拥有尚未接入的能力。',
      relationshipStages: ['初识：礼貌、克制。'],
      scales: Object.fromEntries(ROLE_SCALE_KEYS.map((key) => [key, 0.5]))
    },
    visual: {
      description: '尚未关联角色模型。',
      palette: ['#F6F3FF'],
      defaultOutfit: '未设置',
      modelAsset: null
    },
    presentation: {
      expressions: ['neutral'],
      actions: ['idle'],
      semanticMappings: {}
    }
  });
}

export function serializeRolePackage(role: RolePackage): string {
  return JSON.stringify(validateRolePackage(role), null, 2);
}

export function importRolePackage(json: string): RolePackage {
  return validateRolePackage(JSON.parse(json) as unknown);
}
