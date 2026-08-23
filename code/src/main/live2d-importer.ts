import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  realpathSync,
  statSync
} from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import {
  createParameterBindings,
  REQUIRED_LIVE2D_PARAMETER_BINDINGS,
  type Live2DAdapterConfig,
  type Live2DExpressionAsset,
  type Live2DFileKind,
  type Live2DFileRecord,
  type Live2DLicenseNotice,
  type Live2DModelGroup,
  type Live2DModelState,
  type Live2DMotionAsset,
  type Live2DParameterEffect,
  type Live2DParameterInfo,
  type Live2DPhysicsSummary,
  type Live2DSemanticCategory,
  type Live2DSemanticRoute
} from '../shared/live2d';

const MAX_JSON_BYTES = 16 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SUPPORTED_MODEL3_JSON_VERSIONS = new Set([3, 4, 5]);
const UNSUPPORTED_SCRIPT_EXTENSIONS = new Set([
  '.bat',
  '.cmd',
  '.com',
  '.dll',
  '.exe',
  '.js',
  '.jsx',
  '.mjs',
  '.ps1',
  '.py',
  '.sh',
  '.ts',
  '.vbs'
]);

type JsonRecord = Record<string, unknown>;

interface ResolvedSelection {
  entryPath: string;
  directoryPath: string;
  selectionKind: 'file' | 'directory';
}

interface ParsedJson {
  value: JsonRecord | null;
  error?: string;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function pathIsInside(rootPath: string, candidatePath: string): boolean {
  const child = relative(rootPath, candidatePath);
  return child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child);
}

function resolveSafeReference(rootPath: string, reference: string): string | null {
  if (!reference || reference.includes('\0') || isAbsolute(reference)) {
    return null;
  }
  const candidatePath = resolve(rootPath, reference);
  if (!pathIsInside(rootPath, candidatePath)) {
    return null;
  }
  try {
    const realRoot = realpathSync(rootPath);
    const realCandidate = realpathSync(candidatePath);
    if (!pathIsInside(realRoot, realCandidate)) {
      return null;
    }
  } catch {
    // The lexical check still lets us report missing files without accessing them.
  }
  return candidatePath;
}

function makeFileRecord(
  kind: Live2DFileKind,
  fileName: string,
  relativePath: string,
  absolutePath: string | null
): Live2DFileRecord {
  const base: Live2DFileRecord = {
    kind,
    fileName,
    relativePath: relativePath.replace(/\\/g, '/'),
    absolutePath,
    exists: false,
    readable: false,
    bytes: null,
    parseStatus: 'not_checked'
  };
  if (!absolutePath) {
    base.error = '外部资源引用不是模型目录内的相对路径';
    return base;
  }
  try {
    const stats = statSync(absolutePath);
    if (!stats.isFile()) {
      base.error = '资源路径不是文件';
      return base;
    }
    base.exists = true;
    base.bytes = stats.size;
    try {
      const fd = openSync(absolutePath, 'r');
      closeSync(fd);
      base.readable = true;
    } catch (error) {
      base.error = `文件不可读：${error instanceof Error ? error.message : '未知错误'}`;
    }
  } catch {
    base.error = '文件不存在';
  }
  return base;
}

function parseJsonFile(filePath: string): ParsedJson {
  try {
    const stats = statSync(filePath);
    if (stats.size > MAX_JSON_BYTES) {
      return { value: null, error: `JSON 文件超过 ${MAX_JSON_BYTES} 字节限制` };
    }
    const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'));
    if (!isRecord(parsed)) {
      return { value: null, error: 'JSON 根节点必须是对象' };
    }
    return { value: parsed };
  } catch (error) {
    return { value: null, error: error instanceof Error ? error.message : 'JSON 读取或解析失败' };
  }
}

function readPngSize(filePath: string): { width: number; height: number } | null {
  let fd: number | null = null;
  try {
    fd = openSync(filePath, 'r');
    const header = Buffer.alloc(24);
    const bytesRead = readSync(fd, header, 0, header.length, 0);
    if (bytesRead !== header.length || !header.subarray(0, 8).equals(PNG_SIGNATURE)) {
      return null;
    }
    return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
  } catch {
    return null;
  } finally {
    if (fd !== null) {
      closeSync(fd);
    }
  }
}

function inspectPngRecord(record: Live2DFileRecord): void {
  if (!record.exists || !record.readable || !record.absolutePath) {
    return;
  }
  const size = readPngSize(record.absolutePath);
  if (!size) {
    record.parseStatus = 'error';
    record.error = '不是可识别的 PNG 文件';
    return;
  }
  record.parseStatus = 'ok';
  record.width = size.width;
  record.height = size.height;
}

function resolveSelection(selection: string):
  | { resolved: ResolvedSelection }
  | { state: Live2DModelState } {
  const input = selection.trim();
  const entryPath = resolve(input);
  let stats;
  try {
    stats = statSync(entryPath);
  } catch {
    const lower = entryPath.toLowerCase();
    const looksLikeModelEntry = !UNSUPPORTED_SCRIPT_EXTENSIONS.has(lower.slice(lower.lastIndexOf('.')));
    return {
      state: createEmptyState(
        entryPath,
        looksLikeModelEntry ? 'missing' : 'invalid',
        looksLikeModelEntry ? '外部模型路径当前不存在，启动时会继续报告缺失。' : '只允许选择 .model3.json 或模型目录。',
        looksLikeModelEntry ? ['模型入口或目录不存在'] : ['路径不是允许的 Live2D 模型入口']
      )
    };
  }

  if (stats.isDirectory()) {
    let candidates: string[];
    try {
      candidates = readdirSync(entryPath, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.model3.json'))
        .map((entry) => entry.name);
    } catch (error) {
      return {
        state: createEmptyState(entryPath, 'unreadable', '模型目录不可读。', [
          error instanceof Error ? error.message : '无法读取模型目录'
        ])
      };
    }
    if (candidates.length === 0) {
      return {
        state: createEmptyState(entryPath, 'invalid', '模型目录内没有 .model3.json 入口。', [
          '目录未找到 .model3.json'
        ])
      };
    }
    if (candidates.length > 1) {
      return {
        state: createEmptyState(entryPath, 'invalid', '模型目录含多个 .model3.json，请直接选择一个入口文件。', [
          `发现多个入口：${candidates.join(', ')}`
        ])
      };
    }
    return {
      resolved: {
        entryPath: resolve(entryPath, candidates[0]),
        directoryPath: entryPath,
        selectionKind: 'directory'
      }
    };
  }

  if (!stats.isFile() || !entryPath.toLowerCase().endsWith('.model3.json')) {
    return {
      state: createEmptyState(entryPath, 'invalid', '只允许选择 .model3.json 或模型目录，不会加载脚本或任意文件。', [
        UNSUPPORTED_SCRIPT_EXTENSIONS.has(entryPath.slice(entryPath.lastIndexOf('.')).toLowerCase())
          ? '检测到脚本或可执行文件扩展名'
          : '入口文件扩展名不是 .model3.json'
      ])
    };
  }

  return {
    resolved: {
      entryPath,
      directoryPath: dirname(entryPath),
      selectionKind: 'file'
    }
  };
}

function createEmptyState(
  entryPath: string | null,
  status: Live2DModelState['status'],
  message: string,
  issues: string[] = []
): Live2DModelState {
  return {
    entryPath,
    directoryPath: null,
    selectionKind: null,
    status,
    message,
    version: null,
    files: [],
    expressions: [],
    motions: [],
    editorAnimations: [],
    parameters: [],
    groups: [],
    physics: null,
    adapter: null,
    license: null,
    issues,
    warnings: []
  };
}

function parseParameterInfo(value: unknown): Live2DParameterInfo[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }
    const id = stringValue(item.Id);
    if (!id) {
      return [];
    }
    return [
      {
        id,
        groupId: stringValue(item.GroupId) ?? '',
        name: stringValue(item.Name) ?? id
      }
    ];
  });
}

function parseModelGroups(value: unknown): Live2DModelGroup[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }
    const target = stringValue(item.Target);
    const name = stringValue(item.Name);
    if (!target || !name) {
      return [];
    }
    const ids = Array.isArray(item.Ids)
      ? item.Ids.filter((id): id is string => typeof id === 'string')
      : [];
    return [{ target, name, ids }];
  });
}

function parsePhysicsSummary(value: JsonRecord): Live2DPhysicsSummary {
  const meta = isRecord(value.Meta) ? value.Meta : {};
  return {
    settingCount: finiteNumber(meta.PhysicsSettingCount),
    inputCount: finiteNumber(meta.TotalInputCount),
    outputCount: finiteNumber(meta.TotalOutputCount),
    vertexCount: finiteNumber(meta.VertexCount),
    fps: finiteNumber(meta.Fps)
  };
}

function parseExpressionAsset(filePath: string, fileName: string): Live2DExpressionAsset {
  const parsed = parseJsonFile(filePath);
  if (!parsed.value) {
    return {
      fileName,
      absolutePath: filePath,
      parseStatus: 'error',
      parameterEffects: [],
      error: parsed.error
    };
  }
  if (!Array.isArray(parsed.value.Parameters)) {
    return {
      fileName,
      absolutePath: filePath,
      parseStatus: 'error',
      parameterEffects: [],
      error: '表达式 JSON 缺少 Parameters 数组'
    };
  }
  const parameterEffects: Live2DParameterEffect[] = [];
  for (const item of parsed.value.Parameters) {
    if (!isRecord(item)) {
      continue;
    }
    const id = stringValue(item.Id);
    const value = finiteNumber(item.Value);
    if (id && value !== null) {
      parameterEffects.push({
        id,
        value,
        blend: stringValue(item.Blend) ?? 'Add'
      });
    }
  }
  return {
    fileName,
    absolutePath: filePath,
    parseStatus: 'ok',
    parameterEffects
  };
}

function parseMotionAsset(filePath: string, fileName: string): Live2DMotionAsset {
  const parsed = parseJsonFile(filePath);
  if (!parsed.value) {
    return {
      fileName,
      absolutePath: filePath,
      parseStatus: 'error',
      duration: null,
      fps: null,
      loop: null,
      curveCount: 0,
      curveIds: [],
      error: parsed.error
    };
  }
  const meta = isRecord(parsed.value.Meta) ? parsed.value.Meta : {};
  const curves = Array.isArray(parsed.value.Curves) ? parsed.value.Curves : [];
  const curveIds = curves.flatMap((curve) => {
    if (!isRecord(curve)) {
      return [];
    }
    const target = stringValue(curve.Target) ?? 'Unknown';
    const id = stringValue(curve.Id);
    return id ? [`${target}:${id}`] : [];
  });
  return {
    fileName,
    absolutePath: filePath,
    parseStatus: 'ok',
    duration: finiteNumber(meta.Duration),
    fps: finiteNumber(meta.Fps),
    loop: typeof meta.Loop === 'boolean' ? meta.Loop : null,
    curveCount: curves.length,
    curveIds
  };
}

function parseLicenseNotice(
  directoryPath: string,
  entries: readonly string[]
): { notice: Live2DLicenseNotice | null; record: Live2DFileRecord | null } {
  const noteNames = entries.filter((name) => name.toLowerCase().endsWith('.txt')).sort();
  for (const noteName of noteNames) {
    const filePath = resolve(directoryPath, noteName);
    const record = makeFileRecord('license_note', noteName, noteName, filePath);
    try {
      const text = readFileSync(filePath, 'utf8');
      const looksLikeLicense = /商用|二传|二改|水印|attribution|commercial|redistribut|modif/i.test(text);
      if (!looksLikeLicense) {
        continue;
      }
      const artCredit = text.match(/人物绘制\s*[:：]\s*(.+)/)?.[1]?.trim() ?? null;
      const modelCredit = text.match(/人物建模\s*[:：]\s*(.+)/)?.[1]?.trim() ?? null;
      const watermarkOn = /水印.*默认打开|default.*watermark.*on/i.test(text);
      record.parseStatus = 'ok';
      return {
        record,
        notice: {
          sourceNotesFile: noteName,
          artCredit,
          modelCredit,
          commercialUse: /不可.*商用|严禁.*商用|commercial.*prohibit/i.test(text) ? 'prohibited' : 'unknown',
          redistribution: /不可二传|严禁二传|redistribut.*prohibit/i.test(text) ? 'prohibited' : 'unknown',
          modification: /(?:不可|严禁).*?(?:二改|修改)|(?:二改|修改).*?(?:禁止|严禁|prohibit)|modif.*prohibit/i.test(text)
            ? 'prohibited'
            : 'unknown',
          defaultWatermark: watermarkOn ? 'on' : 'unknown',
          attributionRequiredForPublishedVideo: /发表视频.*表明出处|attribution.*video/i.test(text) ? true : null,
          sourceReadOnly: true
        }
      };
    } catch (error) {
      record.error = error instanceof Error ? error.message : '许可说明不可读';
      record.parseStatus = 'error';
      return { notice: null, record };
    }
  }
  return { notice: null, record: null };
}

function effectFor(
  asset: Live2DExpressionAsset | undefined,
  parameterId: string,
  minimumValue = 0.5
): Live2DParameterEffect | undefined {
  return asset?.parameterEffects.find(
    (effect) => effect.id === parameterId && effect.value >= minimumValue
  );
}

function route(
  category: Live2DSemanticCategory,
  assetType: Live2DSemanticRoute['assetType'],
  sourceFile: string | null,
  effects: Live2DParameterEffect[],
  verifiedBy: string[],
  reason: string,
  supported = true,
  fallbackTo?: string
): Live2DSemanticRoute {
  return {
    category,
    assetType,
    supported,
    sourceFile,
    effects,
    verifiedBy,
    reason,
    ...(fallbackTo ? { fallbackTo } : {})
  };
}

function normalizedLabel(value: string): string {
  return value.toLocaleLowerCase().replace(/\s+/g, '');
}

function parameterIdsForLabels(
  parameters: readonly Live2DParameterInfo[],
  labels: readonly string[]
): string[] {
  const candidates = labels.map(normalizedLabel);
  return parameters
    .filter((parameter) => {
      const name = normalizedLabel(parameter.name);
      return candidates.some((candidate) => candidate.length > 0 && name.includes(candidate));
    })
    .map((parameter) => parameter.id);
}

function expressionForParameterIds(
  expressions: readonly Live2DExpressionAsset[],
  parameterIds: readonly string[],
  minimumValue = 0.5
): Live2DExpressionAsset | undefined {
  const ids = new Set(parameterIds);
  return expressions.find(
    (asset) =>
      asset.parseStatus === 'ok' &&
      asset.parameterEffects.some((effect) => ids.has(effect.id) && effect.value >= minimumValue)
  );
}

function effectsForParameterIds(
  asset: Live2DExpressionAsset | undefined,
  parameterIds: readonly string[]
): Live2DParameterEffect[] {
  if (!asset) {
    return [];
  }
  const ids = new Set(parameterIds);
  return asset.parameterEffects.filter((effect) => ids.has(effect.id));
}

function verifiedIds(fileName: string | null, effects: readonly Live2DParameterEffect[]): string[] {
  return fileName ? effects.map((effect) => `${fileName}:${effect.id}`) : [];
}

function buildLive2DAdapter(
  entryPath: string,
  modelVersion: number,
  parameters: readonly Live2DParameterInfo[],
  expressions: readonly Live2DExpressionAsset[],
  defaultWatermarkOn: boolean
): Live2DAdapterConfig {
  const parameterBindings = createParameterBindings(parameters);
  const availableIds = new Set(parameters.map((parameter) => parameter.id));
  const parameterIds = {
    blush: parameterIdsForLabels(parameters, ['脸红', 'blush']),
    circles: parameterIdsForLabels(parameters, ['圈圈', 'circle', 'confus']),
    qq: parameterIdsForLabels(parameters, ['QQ', '哭', 'cry']),
    leanForward: parameterIdsForLabels(parameters, ['前倾', 'lean']),
    sing: parameterIdsForLabels(parameters, ['唱歌', 'sing']),
    heart: parameterIdsForLabels(parameters, ['比心', 'heart']),
    leek: parameterIdsForLabels(parameters, ['大葱', '葱', 'leek']),
    watermark: parameterIdsForLabels(parameters, ['水印', 'watermark']),
    browLeft: parameterIdsForLabels(parameters, ['左眉', 'browl']),
    browRight: parameterIdsForLabels(parameters, ['右眉', 'browr'])
  };
  const blush = expressionForParameterIds(expressions, parameterIds.blush);
  const circles = expressionForParameterIds(expressions, parameterIds.circles);
  const qq = expressionForParameterIds(expressions, parameterIds.qq);
  const leanForward = expressionForParameterIds(expressions, parameterIds.leanForward);
  const sing = expressionForParameterIds(expressions, parameterIds.sing);
  const heart = expressionForParameterIds(expressions, parameterIds.heart);
  const leek = expressionForParameterIds(expressions, parameterIds.leek);
  const watermark = expressionForParameterIds(expressions, parameterIds.watermark);

  const caringEffects: Live2DParameterEffect[] = [
    { id: 'ParamEyeLOpen', value: 0.85, blend: 'Overwrite' },
    { id: 'ParamEyeROpen', value: 0.85, blend: 'Overwrite' },
    { id: 'ParamMouthForm', value: 0.2, blend: 'Overwrite' },
    { id: 'ParamMouthOpenY', value: 0.04, blend: 'Overwrite' },
    ...parameterIds.browLeft.slice(0, 1).map((id) => ({ id, value: 0.12, blend: 'Overwrite' })),
    ...parameterIds.browRight.slice(0, 1).map((id) => ({ id, value: 0.12, blend: 'Overwrite' }))
  ].filter((effect) => availableIds.has(effect.id));

  const neutral = route(
    'expression',
    'none',
    null,
    [],
    [],
    'neutral 是安全基线；切换时只重置本适配器触碰过的参数。'
  );
  const blushRoute = route(
    'expression',
    'expression',
    blush?.fileName ?? null,
    effectsForParameterIds(blush, parameterIds.blush).filter((effect) => effect.value >= 0.5),
    verifiedIds(blush?.fileName ?? null, effectsForParameterIds(blush, parameterIds.blush)),
    blush ? '由 cdi3 参数标签和 exp3 实际参数效果确认。' : '未发现可验证的脸红语义参数。',
    Boolean(blush && parameterIds.blush.length > 0)
  );
  const circlesRoute = route(
    'expression',
    'expression',
    circles?.fileName ?? null,
    effectsForParameterIds(circles, parameterIds.circles).filter((effect) => effect.value >= 0.5),
    verifiedIds(circles?.fileName ?? null, effectsForParameterIds(circles, parameterIds.circles)),
    circles ? '由 cdi3 参数标签和 exp3 实际参数效果确认。' : '未发现可验证的圈圈/困惑语义参数。',
    Boolean(circles && parameterIds.circles.length > 0)
  );
  const qqEffects = qq
    ? effectsForParameterIds(qq, parameterIds.qq).filter((effect) => effect.value >= 0.5)
    : [];
  const qqRoute = route(
    'expression',
    'expression',
    qq?.fileName ?? null,
    qqEffects,
    verifiedIds(qq?.fileName ?? null, qqEffects),
    qq ? '由 cdi3 参数标签和 exp3 实际参数效果确认。' : '未发现可验证的 QQ/哭哭语义参数。',
    Boolean(qq && parameterIds.qq.length > 0)
  );
  const leanRoute = route(
    'action',
    'expression',
    leanForward?.fileName ?? null,
    effectsForParameterIds(leanForward, parameterIds.leanForward).filter((effect) => effect.value >= 0.5),
    verifiedIds(leanForward?.fileName ?? null, effectsForParameterIds(leanForward, parameterIds.leanForward)),
    leanForward ? '文件是 exp3，但其参数语义是姿态动作，按 action 分类。' : '未发现可验证的前倾动作。',
    Boolean(leanForward && parameterIds.leanForward.length > 0)
  );
  const singRoute = route(
    'action',
    'expression',
    sing?.fileName ?? null,
    effectsForParameterIds(sing, parameterIds.sing).filter((effect) => effect.value >= 0.5),
    verifiedIds(sing?.fileName ?? null, effectsForParameterIds(sing, parameterIds.sing)),
    sing ? '由 cdi3 参数标签和 exp3 实际参数效果确认。' : '未发现可验证的唱歌动作。',
    Boolean(sing && parameterIds.sing.length > 0)
  );
  const heartRoute = route(
    'action',
    'expression',
    heart?.fileName ?? null,
    effectsForParameterIds(heart, parameterIds.heart).filter((effect) => effect.value >= 0.5),
    verifiedIds(heart?.fileName ?? null, effectsForParameterIds(heart, parameterIds.heart)),
    heart ? '由 cdi3 参数标签和 exp3 实际参数效果确认。' : '未发现可验证的比心动作。',
    Boolean(heart && parameterIds.heart.length > 0)
  );
  const leekRoute = route(
    'action',
    'expression',
    leek?.fileName ?? null,
    effectsForParameterIds(leek, parameterIds.leek).filter((effect) => effect.value >= 0.5),
    verifiedIds(leek?.fileName ?? null, effectsForParameterIds(leek, parameterIds.leek)),
    leek ? '由 cdi3 参数标签和 exp3 实际参数效果确认。' : '未发现可验证的大葱道具动作。',
    Boolean(leek && parameterIds.leek.length > 0)
  );
  const watermarkRoute = route(
    'system',
    'expression',
    watermark?.fileName ?? null,
    effectsForParameterIds(watermark, parameterIds.watermark).filter((effect) => effect.value >= 0.5),
    verifiedIds(watermark?.fileName ?? null, effectsForParameterIds(watermark, parameterIds.watermark)),
    watermark ? '由模型自带水印参数的 cdi3 标签和 exp3 实际效果确认；不删除或固化关闭状态。' : '未发现模型自带水印开关。',
    Boolean(watermark && parameterIds.watermark.length > 0)
  );
  const watermarkOnEffects = effectsForParameterIds(watermark, parameterIds.watermark).filter((effect) => effect.value >= 0.5);
  const watermarkOffEffects = watermarkOnEffects.map((effect) => ({ ...effect, value: 0, blend: 'Overwrite' as const }));

  const caringRoute = route(
    'expression',
    'parameter-preset',
    null,
    caringEffects,
    caringEffects.map((effect) => `safe-preset:${effect.id}`),
    '模型没有原生 caring 表情，使用项目侧限定的标准眼、眉、嘴参数安全组合。'
  );
  const greetingRoute = route(
    'action',
    'none',
    null,
    [],
    [],
    '扫描到动作文件但没有语义标签，不能按文件名猜测 greeting；安全回退 neutral。',
    false,
    'neutral'
  );
  const watermarkOffRoute = route(
    'system',
    'parameter-preset',
    watermark?.fileName ?? null,
    watermarkOffEffects,
    verifiedIds(watermark?.fileName ?? null, watermarkOnEffects),
    watermarkOffEffects.length > 0
      ? '仅调用模型自带水印 exp3 已确认的参数开关，将其值设为 0；不裁剪、遮挡或修改模型文件。'
      : defaultWatermarkOn
        ? '模型说明提到可在设置表情关闭水印，但当前目录没有可验证的水印参数效果，安全回退 neutral。'
        : '没有可验证的 watermark_off 资源，安全回退 neutral。',
    watermarkOffEffects.length > 0,
    watermarkOffEffects.length > 0 ? undefined : 'neutral'
  );

  const semanticMappings: Record<string, Live2DSemanticRoute> = {
    neutral,
    caring: caringRoute,
    caring_smile: caringRoute,
    blush: blushRoute,
    shy: blushRoute,
    confused: circlesRoute,
    circles: circlesRoute,
    'confused/circles': circlesRoute,
    confused_blank: circlesRoute,
    cry: qqRoute,
    qq: qqRoute,
    'cry/QQ': qqRoute,
    sad: qqRoute,
    lean_forward: leanRoute,
    sing: singRoute,
    singing: singRoute,
    heart: heartRoute,
    affection: heartRoute,
    leek_prop: leekRoute,
    prop_fun: leekRoute,
    watermark_on: watermarkRoute,
    watermark_off: watermarkOffRoute,
    greeting: greetingRoute
  };

  const resetIds = new Set<string>();
  for (const item of Object.values(semanticMappings)) {
    for (const effect of item.effects) {
      resetIds.add(effect.id);
    }
  }
  const resetValues: Record<string, number> = {};
  for (const id of resetIds) {
    if (parameterIds.watermark.includes(id) && defaultWatermarkOn) {
      resetValues[id] = 1;
    } else if (id === 'ParamEyeLOpen' || id === 'ParamEyeROpen') {
      resetValues[id] = 1;
    } else {
      resetValues[id] = 0;
    }
  }

  return {
    schemaVersion: 1,
    sourceEntryPath: entryPath,
    modelVersion,
    parameterBindings: createParameterBindings(parameters),
    semanticMappings,
    resetValues
  };
}

function inspectOptionalAssets(
  directoryPath: string,
  entries: readonly string[],
  state: Live2DModelState
): void {
  for (const fileName of entries.filter((name) => name.toLowerCase().endsWith('.exp3.json')).sort()) {
    const filePath = resolve(directoryPath, fileName);
    const record = makeFileRecord('expression', fileName, fileName, filePath);
    const asset = parseExpressionAsset(filePath, fileName);
    record.parseStatus = asset.parseStatus;
    record.error = asset.error;
    state.files.push(record);
    state.expressions.push(asset);
    if (asset.parseStatus === 'error') {
      state.warnings.push(`${fileName} 解析失败：${asset.error ?? '未知错误'}`);
    }
  }

  for (const fileName of entries.filter((name) => name.toLowerCase().endsWith('.motion3.json')).sort()) {
    const filePath = resolve(directoryPath, fileName);
    const record = makeFileRecord('motion', fileName, fileName, filePath);
    const asset = parseMotionAsset(filePath, fileName);
    record.parseStatus = asset.parseStatus;
    record.error = asset.error;
    state.files.push(record);
    state.motions.push(asset);
    if (asset.parseStatus === 'error') {
      state.warnings.push(`${fileName} 解析失败：${asset.error ?? '未知错误'}`);
    }
  }

  for (const fileName of entries.filter((name) => name.toLowerCase().endsWith('.can3')).sort()) {
    const filePath = resolve(directoryPath, fileName);
    const record = makeFileRecord('editor_animation', fileName, fileName, filePath);
    record.parseStatus = 'not_applicable';
    record.runtimeSupported = false;
    state.files.push(record);
    state.editorAnimations.push(record);
    state.warnings.push(`${fileName} 是编辑器 can3 文件，只报告存在，不作为浏览器运行时动作。`);
  }
}

export function inspectExternalLive2DModel(selection: string | null | undefined): Live2DModelState {
  if (!selection || !selection.trim()) {
    return createEmptyState(null, 'not_configured', '尚未配置外部 Live2D 模型。');
  }

  const resolvedSelection = resolveSelection(selection);
  if ('state' in resolvedSelection) {
    return resolvedSelection.state;
  }
  const { entryPath, directoryPath, selectionKind } = resolvedSelection.resolved;
  const state: Live2DModelState = {
    ...createEmptyState(entryPath, 'ready', '正在检查外部 Live2D 模型。'),
    directoryPath,
    selectionKind
  };

  const modelRecord = makeFileRecord('model', basename(entryPath), basename(entryPath), entryPath);
  state.files.push(modelRecord);
  if (!modelRecord.exists || !modelRecord.readable) {
    state.status = modelRecord.exists ? 'unreadable' : 'missing';
    state.message = modelRecord.error ?? '模型入口不可读。';
    state.issues.push(modelRecord.error ?? '模型入口不可读');
    return state;
  }

  const modelJson = parseJsonFile(entryPath);
  if (!modelJson.value) {
    modelRecord.parseStatus = 'error';
    modelRecord.error = modelJson.error;
    state.status = 'invalid';
    state.message = 'model3.json 解析失败。';
    state.issues.push(modelJson.error ?? 'model3.json 解析失败');
    return state;
  }
  modelRecord.parseStatus = 'ok';

  const version = finiteNumber(modelJson.value.Version);
  state.version = version;
  if (version === null || !SUPPORTED_MODEL3_JSON_VERSIONS.has(version)) {
    state.status = 'invalid';
    state.message = '只支持 Cubism 3/4/5 的 model3.json 格式版本。';
    state.issues.push(`model3.json Version=${String(modelJson.value.Version)}，不在 3/4/5 兼容范围`);
    return state;
  }

  const fileReferences = isRecord(modelJson.value.FileReferences) ? modelJson.value.FileReferences : null;
  if (!fileReferences) {
    state.status = 'invalid';
    state.message = 'model3.json 缺少 FileReferences。';
    state.issues.push('缺少 FileReferences');
    return state;
  }

  let hasMissingResource = false;
  let hasUnreadableResource = false;
  let hasInvalidResource = false;
  const addReferencedFile = (
    kind: Live2DFileKind,
    reference: string | null,
    parseJson = false
  ): Live2DFileRecord | null => {
    if (!reference) {
      state.issues.push(`${kind} 缺少文件引用`);
      hasInvalidResource = true;
      return null;
    }
    const absolutePath = resolveSafeReference(directoryPath, reference);
    const record = makeFileRecord(kind, basename(reference), reference, absolutePath);
    state.files.push(record);
    if (!absolutePath) {
      state.issues.push(record.error ?? `${basename(reference)} 不是模型目录内的相对路径`);
      hasInvalidResource = true;
    } else if (!record.exists) {
      hasMissingResource = true;
      state.issues.push(`${basename(reference)} 文件不存在`);
    } else if (!record.readable) {
      hasUnreadableResource = true;
      state.issues.push(`${basename(reference)} 文件不可读`);
    }
    if (parseJson && record.exists && record.readable && record.absolutePath) {
      const parsed = parseJsonFile(record.absolutePath);
      record.parseStatus = parsed.value ? 'ok' : 'error';
      if (!parsed.value) {
        record.error = parsed.error;
        state.issues.push(`${basename(reference)} JSON 解析失败：${parsed.error ?? '未知错误'}`);
        hasInvalidResource = true;
      }
    }
    return record;
  };

  const mocReference = stringValue(fileReferences.Moc);
  const mocRecord = addReferencedFile('moc', mocReference);
  if (mocReference && !mocReference.toLowerCase().endsWith('.moc3')) {
    state.issues.push('Moc 引用不是 .moc3 文件');
    hasInvalidResource = true;
  }

  const textureReferences = Array.isArray(fileReferences.Textures)
    ? fileReferences.Textures.filter((item): item is string => typeof item === 'string')
    : [];
  if (textureReferences.length === 0) {
    state.issues.push('Textures 为空');
    hasInvalidResource = true;
  }
  for (const reference of textureReferences) {
    const record = addReferencedFile('texture', reference);
    if (record) {
      if (!reference.toLowerCase().endsWith('.png')) {
        state.issues.push(`${reference} 不是 PNG 纹理引用`);
        hasInvalidResource = true;
      }
      inspectPngRecord(record);
      if (record.parseStatus === 'error') {
        state.issues.push(`${reference} PNG 头解析失败`);
        hasInvalidResource = true;
      }
    }
  }

  const physicsReference = stringValue(fileReferences.Physics);
  const physicsRecord = addReferencedFile('physics', physicsReference, true);
  const displayInfoReference = stringValue(fileReferences.DisplayInfo);
  const displayInfoRecord = addReferencedFile('display_info', displayInfoReference, true);

  if (!mocRecord || !physicsRecord || !displayInfoRecord) {
    state.status = 'invalid';
  }

  let physicsJson: JsonRecord | null = null;
  if (physicsRecord?.parseStatus === 'ok' && physicsRecord.absolutePath) {
    physicsJson = parseJsonFile(physicsRecord.absolutePath).value;
  }
  if (physicsJson) {
    state.physics = parsePhysicsSummary(physicsJson);
  }

  let displayInfoJson: JsonRecord | null = null;
  if (displayInfoRecord?.parseStatus === 'ok' && displayInfoRecord.absolutePath) {
    displayInfoJson = parseJsonFile(displayInfoRecord.absolutePath).value;
  }
  if (displayInfoJson) {
    state.parameters = parseParameterInfo(displayInfoJson.Parameters);
  }
  state.groups = parseModelGroups(modelJson.value.Groups);

  let directoryEntries: string[] = [];
  try {
    directoryEntries = readdirSync(directoryPath, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);
    inspectOptionalAssets(directoryPath, directoryEntries, state);
  } catch (error) {
    state.issues.push(`无法扫描模型目录：${error instanceof Error ? error.message : '未知错误'}`);
    hasUnreadableResource = true;
  }

  const license = parseLicenseNotice(directoryPath, directoryEntries);
  state.license = license.notice;
  if (license.record) {
    state.files.push(license.record);
  }

  const adapter = buildLive2DAdapter(
    entryPath,
    version,
    state.parameters,
    state.expressions,
    license.notice?.defaultWatermark === 'on'
  );
  state.adapter = adapter;

  if (state.expressions.some((asset) => asset.parseStatus === 'error')) {
    state.warnings.push('同目录存在无法解析的 exp3.json；已从可用语义映射中排除。');
  }
  if (state.motions.some((asset) => asset.parseStatus === 'error')) {
    state.warnings.push('同目录存在无法解析的 motion3.json；已从动作清单中标记错误。');
  }

  if (hasInvalidResource || state.issues.length > 0 && state.status === 'invalid') {
    state.status = 'invalid';
    state.message = '外部 Live2D 模型存在不安全引用或必需文件问题。';
  } else if (hasUnreadableResource) {
    state.status = 'unreadable';
    state.message = '外部 Live2D 模型存在不可读文件。';
  } else if (hasMissingResource) {
    state.status = 'missing';
    state.message = '外部 Live2D 模型缺少 model3.json 声明的资源。';
  } else if (state.warnings.length > 0) {
    state.status = 'ready_with_warnings';
    state.message = '模型入口和必需资源已通过只读检查，但存在可见警告。';
  } else {
    state.status = 'ready';
    state.message = '模型入口、必需资源和同目录 JSON 已通过只读检查。';
  }

  return state;
}

export function validateExternalModelPath(selection: string | null | undefined): boolean {
  if (!selection || !selection.trim()) {
    return false;
  }
  const lower = resolve(selection).toLowerCase();
  if (UNSUPPORTED_SCRIPT_EXTENSIONS.has(lower.slice(lower.lastIndexOf('.')))) {
    return false;
  }
  return lower.endsWith('.model3.json') || existsSync(selection) && statSync(selection).isDirectory();
}

export { REQUIRED_LIVE2D_PARAMETER_BINDINGS };
