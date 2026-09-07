export const LIVE2D_PARAMETER_SEMANTICS = [
  'head_x',
  'head_y',
  'head_z',
  'body_x',
  'body_y',
  'body_z',
  'eye_open_l',
  'eye_open_r',
  'gaze_x',
  'gaze_y',
  'mouth_open',
  'mouth_form',
  'breath',
  'hair_front',
  'hair_side',
  'hair_back'
] as const;

export type Live2DParameterSemantic = (typeof LIVE2D_PARAMETER_SEMANTICS)[number];

export const REQUIRED_LIVE2D_PARAMETER_BINDINGS: Record<Live2DParameterSemantic, string> = {
  head_x: 'ParamAngleX',
  head_y: 'ParamAngleY',
  head_z: 'ParamAngleZ',
  body_x: 'ParamBodyAngleX',
  body_y: 'ParamBodyAngleY',
  body_z: 'ParamBodyAngleZ',
  eye_open_l: 'ParamEyeLOpen',
  eye_open_r: 'ParamEyeROpen',
  gaze_x: 'ParamEyeBallX',
  gaze_y: 'ParamEyeBallY',
  mouth_open: 'ParamMouthOpenY',
  mouth_form: 'ParamMouthForm',
  breath: 'ParamBreath',
  hair_front: 'ParamHairFront',
  hair_side: 'ParamHairSide',
  hair_back: 'ParamHairBack'
};

export const LIVE2D_RECOMMENDED_RANGES: Record<
  Live2DParameterSemantic,
  { min: number; max: number; default: number }
> = {
  head_x: { min: -30, max: 30, default: 0 },
  head_y: { min: -30, max: 30, default: 0 },
  head_z: { min: -20, max: 20, default: 0 },
  body_x: { min: -10, max: 10, default: 0 },
  body_y: { min: -10, max: 10, default: 0 },
  body_z: { min: -10, max: 10, default: 0 },
  eye_open_l: { min: 0, max: 1, default: 1 },
  eye_open_r: { min: 0, max: 1, default: 1 },
  gaze_x: { min: -1, max: 1, default: 0 },
  gaze_y: { min: -1, max: 1, default: 0 },
  mouth_open: { min: 0, max: 1, default: 0 },
  mouth_form: { min: -1, max: 1, default: 0 },
  breath: { min: 0, max: 1, default: 0.5 },
  hair_front: { min: -1, max: 1, default: 0 },
  hair_side: { min: -1, max: 1, default: 0 },
  hair_back: { min: -1, max: 1, default: 0 }
};

export type Live2DModelStatus =
  | 'not_configured'
  | 'ready'
  | 'ready_with_warnings'
  | 'missing'
  | 'invalid'
  | 'unreadable';

export type Live2DFileKind =
  | 'model'
  | 'moc'
  | 'texture'
  | 'physics'
  | 'display_info'
  | 'pose'
  | 'user_data'
  | 'expression'
  | 'motion'
  | 'editor_animation'
  | 'license_note';

export type Live2DParseStatus = 'not_checked' | 'not_applicable' | 'ok' | 'error';

export interface Live2DFileRecord {
  kind: Live2DFileKind;
  fileName: string;
  relativePath: string;
  absolutePath: string | null;
  exists: boolean;
  readable: boolean;
  bytes: number | null;
  parseStatus: Live2DParseStatus;
  runtimeSupported?: boolean;
  width?: number;
  height?: number;
  error?: string;
}

export interface Live2DParameterInfo {
  id: string;
  groupId: string;
  name: string;
}

export interface Live2DParameterBinding {
  semantic: Live2DParameterSemantic;
  targetId: string;
  available: boolean;
  aliases: string[];
  recommendedRange: { min: number; max: number; default: number };
  source: 'model-cdi3' | 'user-override' | 'missing';
}

export interface Live2DParameterCapability {
  semantic: Live2DParameterSemantic;
  targetId: string;
  aliases: string[];
  available: boolean;
  min: number;
  max: number;
  default: number;
  source: 'runtime' | 'adapter' | 'missing';
}

export interface Live2DCapabilityManifest {
  modelIdentity: string | null;
  parameters: Record<Live2DParameterSemantic, Live2DParameterCapability>;
  missing: Live2DParameterSemantic[];
}

export interface Live2DParameterEffect {
  id: string;
  value: number;
  blend: string;
}

export interface Live2DExpressionAsset {
  fileName: string;
  absolutePath: string;
  parseStatus: Live2DParseStatus;
  parameterEffects: Live2DParameterEffect[];
  error?: string;
}

export interface Live2DMotionAsset {
  fileName: string;
  absolutePath: string;
  parseStatus: Live2DParseStatus;
  duration: number | null;
  fps: number | null;
  loop: boolean | null;
  curveCount: number;
  curveIds: string[];
  error?: string;
}

export type Live2DSemanticCategory = 'expression' | 'action' | 'system';
export type Live2DRouteAssetType = 'expression' | 'motion' | 'parameter-preset' | 'none';

export interface Live2DSemanticRoute {
  category: Live2DSemanticCategory;
  assetType: Live2DRouteAssetType;
  supported: boolean;
  sourceFile: string | null;
  effects: Live2DParameterEffect[];
  verifiedBy: string[];
  fallbackTo?: string;
  reason: string;
}

export interface Live2DAdapterConfig {
  schemaVersion: 1;
  sourceEntryPath: string;
  modelVersion: number;
  parameterBindings: Record<Live2DParameterSemantic, Live2DParameterBinding>;
  semanticMappings: Record<string, Live2DSemanticRoute>;
  resetValues: Record<string, number>;
  overrides?: Live2DAdapterOverride;
}

export interface Live2DAdapterOverride {
  schemaVersion: 1;
  sourceEntryPath: string;
  parameterBindings?: Partial<Record<Live2DParameterSemantic, string>>;
  semanticMappings?: Record<string, { sourceFile: string | null; supported?: boolean; reason?: string }>;
  updatedAt: number;
}

export interface Live2DLicenseNotice {
  sourceNotesFile: string | null;
  artCredit: string | null;
  modelCredit: string | null;
  commercialUse: 'prohibited' | 'unknown';
  redistribution: 'prohibited' | 'unknown';
  modification: 'prohibited' | 'unknown';
  defaultWatermark: 'on' | 'unknown';
  attributionRequiredForPublishedVideo: boolean | null;
  sourceReadOnly: true;
}

export interface Live2DModelGroup {
  target: string;
  name: string;
  ids: string[];
}

export interface Live2DPhysicsSummary {
  settingCount: number | null;
  inputCount: number | null;
  outputCount: number | null;
  vertexCount: number | null;
  fps: number | null;
}

export interface Live2DModelState {
  entryPath: string | null;
  directoryPath: string | null;
  selectionKind: 'file' | 'directory' | null;
  status: Live2DModelStatus;
  message: string;
  version: number | null;
  files: Live2DFileRecord[];
  expressions: Live2DExpressionAsset[];
  motions: Live2DMotionAsset[];
  editorAnimations: Live2DFileRecord[];
  parameters: Live2DParameterInfo[];
  groups: Live2DModelGroup[];
  physics: Live2DPhysicsSummary | null;
  adapter: Live2DAdapterConfig | null;
  license: Live2DLicenseNotice | null;
  issues: string[];
  warnings: string[];
}

export type Live2DModelSourceKind = 'folder' | 'file' | 'zip';

export interface Live2DModelRecord {
  id: string;
  displayName: string;
  sourcePath: string;
  sourceKind: Live2DModelSourceKind;
  runtimeDirectory: string;
  entryPath: string;
  importedAt: number;
  lastUsedAt: number | null;
  lastStatus: Live2DModelStatus;
  lastMessage: string;
}

export interface Live2DResolvedSemantic {
  requested: string;
  resolved: string;
  fallback: boolean;
  category: Live2DSemanticCategory;
  assetType: Live2DRouteAssetType;
  sourceFile: string | null;
  effects: Live2DParameterEffect[];
  reason: string;
}

export type Live2DParameterState = Record<string, number>;

export function applyLive2DAdapterOverride(
  adapter: Live2DAdapterConfig,
  override: Live2DAdapterOverride | null | undefined
): Live2DAdapterConfig {
  if (!override || override.schemaVersion !== 1 || override.sourceEntryPath !== adapter.sourceEntryPath) return adapter;
  const parameterBindings = { ...adapter.parameterBindings };
  for (const [semantic, targetId] of Object.entries(override.parameterBindings ?? {})) {
    const current = parameterBindings[semantic as Live2DParameterSemantic];
    if (!current || typeof targetId !== 'string' || !targetId.trim()) continue;
    parameterBindings[semantic as Live2DParameterSemantic] = {
      ...current,
      targetId: targetId.trim(),
      available: true,
      aliases: [...new Set([...current.aliases, targetId.trim()])],
      source: 'user-override'
    };
  }
  const semanticMappings = { ...adapter.semanticMappings };
  for (const [name, change] of Object.entries(override.semanticMappings ?? {})) {
    const current = semanticMappings[name];
    if (!current || !change || typeof change.sourceFile !== 'string' && change.sourceFile !== null) continue;
    semanticMappings[name] = {
      ...current,
      sourceFile: change.sourceFile,
      supported: change.supported ?? Boolean(change.sourceFile),
      reason: change.reason?.trim() || '用户手动覆盖适配器映射。'
    };
  }
  return { ...adapter, parameterBindings, semanticMappings, overrides: override };
}

export function createParameterBindings(
  availableParameters: readonly Live2DParameterInfo[]
): Record<Live2DParameterSemantic, Live2DParameterBinding> {
  const normalize = (value: string): string => value.toLocaleLowerCase().replace(/[\s_\-:./\\]/gu, '');
  const aliases: Record<Live2DParameterSemantic, string[]> = {
    head_x: ['AngleX', 'HeadX', 'HeadAngleX', '头部X', '角度X', '头部角度X'],
    head_y: ['AngleY', 'HeadY', 'HeadAngleY', '头部Y', '角度Y', '头部角度Y'],
    head_z: ['AngleZ', 'HeadZ', 'HeadAngleZ', '头部Z', '角度Z', '头部角度Z'],
    body_x: ['BodyAngleX', 'BodyX', '身体X', '身体角度X'],
    body_y: ['BodyAngleY', 'BodyY', '身体Y', '身体角度Y'],
    body_z: ['BodyAngleZ', 'BodyZ', '身体Z', '身体角度Z'],
    eye_open_l: ['EyeLOpen', 'EyeOpenL', 'LeftEyeOpen', '左眼', '左眼开合'],
    eye_open_r: ['EyeROpen', 'EyeOpenR', 'RightEyeOpen', '右眼', '右眼开合'],
    gaze_x: ['EyeBallX', 'GazeX', '眼球X', '视线X'],
    gaze_y: ['EyeBallY', 'GazeY', '眼球Y', '视线Y'],
    mouth_open: ['MouthOpenY', 'MouthOpen', '嘴巴开合', '嘴张开'],
    mouth_form: ['MouthForm', 'MouthShape', '嘴形', '嘴型'],
    breath: ['Breath', '呼吸'],
    hair_front: ['HairFront', '前发'],
    hair_side: ['HairSide', '侧发'],
    hair_back: ['HairBack', '后发']
  };
  return Object.fromEntries(
    LIVE2D_PARAMETER_SEMANTICS.map((semantic) => [
      semantic, (() => {
        const standardId = REQUIRED_LIVE2D_PARAMETER_BINDINGS[semantic];
        const candidates = [standardId, ...aliases[semantic]].map(normalize);
        const match = availableParameters.find((parameter) => candidates.includes(normalize(parameter.id)) || candidates.includes(normalize(parameter.name)));
        return {
          semantic,
          targetId: match?.id ?? standardId,
          aliases: [...new Set([standardId, ...aliases[semantic], match?.id ?? '', match?.name ?? ''].filter(Boolean))],
          available: Boolean(match),
          recommendedRange: LIVE2D_RECOMMENDED_RANGES[semantic],
          source: match
          ? 'model-cdi3'
          : 'missing'
        };
      })()
    ])
  ) as Record<Live2DParameterSemantic, Live2DParameterBinding>;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function bindingForParameter(
  adapter: Live2DAdapterConfig,
  parameterId: string
): Live2DParameterBinding | undefined {
  return Object.values(adapter.parameterBindings).find(
    (binding) => binding.targetId === parameterId && binding.available
  );
}

function clampEffect(adapter: Live2DAdapterConfig, effect: Live2DParameterEffect): number {
  const binding = bindingForParameter(adapter, effect.id);
  if (binding) {
    return clamp(effect.value, binding.recommendedRange.min, binding.recommendedRange.max);
  }
  return clamp(effect.value, -1, 1);
}

export function applyParameterEffects(
  state: Live2DParameterState,
  adapter: Live2DAdapterConfig,
  effects: readonly Live2DParameterEffect[]
): Live2DParameterState {
  const next = { ...state };
  const allowedIds = new Set([
    ...Object.keys(adapter.resetValues),
    ...Object.values(adapter.parameterBindings)
      .filter((binding) => binding.available)
      .map((binding) => binding.targetId)
  ]);
  for (const effect of effects) {
    if (!allowedIds.has(effect.id) || !Number.isFinite(effect.value)) {
      continue;
    }
    next[effect.id] = clampEffect(adapter, effect);
  }
  return next;
}

export function resetSemanticParameters(
  state: Live2DParameterState,
  adapter: Live2DAdapterConfig
): Live2DParameterState {
  const next = { ...state };
  for (const [id, value] of Object.entries(adapter.resetValues)) {
    next[id] = value;
  }
  return next;
}

export function resolveLive2DSemantic(
  adapter: Live2DAdapterConfig,
  semantic: string
): Live2DResolvedSemantic {
  const requestedRoute = adapter.semanticMappings[semantic];
  const fallbackKey = requestedRoute?.supported ? semantic : requestedRoute?.fallbackTo ?? 'neutral';
  const route = adapter.semanticMappings[fallbackKey] ?? adapter.semanticMappings.neutral;
  if (!route) {
    return {
      requested: semantic,
      resolved: 'neutral',
      fallback: true,
      category: 'expression',
      assetType: 'none',
      sourceFile: null,
      effects: [],
      reason: '适配器没有 neutral 路由，安全返回空效果。'
    };
  }
  return {
    requested: semantic,
    resolved: fallbackKey,
    fallback: fallbackKey !== semantic,
    category: route.category,
    assetType: route.assetType,
    sourceFile: route.sourceFile,
    effects: route.effects,
    reason:
      fallbackKey === semantic
        ? route.reason
        : requestedRoute?.reason ?? '语义不存在或当前模型没有可验证资源，已回退 neutral。'
  };
}

export function applyLive2DSemantic(
  state: Live2DParameterState,
  adapter: Live2DAdapterConfig,
  semantic: string
): { state: Live2DParameterState; resolved: Live2DResolvedSemantic } {
  const resolved = resolveLive2DSemantic(adapter, semantic);
  const reset = resetSemanticParameters(state, adapter);
  return {
    state: applyParameterEffects(reset, adapter, resolved.effects),
    resolved
  };
}

export function buildNamedParameterPatch(
  adapter: Live2DAdapterConfig,
  values: Partial<Record<Live2DParameterSemantic, number>>
): Live2DParameterEffect[] {
  const effects: Live2DParameterEffect[] = [];
  for (const [semantic, value] of Object.entries(values)) {
    const binding = adapter.parameterBindings[semantic as Live2DParameterSemantic];
    if (!binding?.available || typeof value !== 'number' || !Number.isFinite(value)) {
      continue;
    }
    effects.push({
      id: binding.targetId,
      value: clamp(value, binding.recommendedRange.min, binding.recommendedRange.max),
      blend: 'Overwrite'
    });
  }
  return effects;
}
