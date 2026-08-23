import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  applyLive2DSemantic,
  applyParameterEffects,
  buildNamedParameterPatch,
  type Live2DAdapterConfig,
  type Live2DModelState
} from '../shared/live2d';
import { inspectExternalLive2DModel } from './live2d-importer';

type CheckStatus = 'passed' | 'failed' | 'not_verified' | 'warning';

interface VerificationCheck {
  id: string;
  status: CheckStatus;
  evidence: string;
  details?: Record<string, unknown>;
}

function readArgument(name: string): string | null {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  return value && !value.startsWith('--') ? value : null;
}

function addCheck(
  checks: VerificationCheck[],
  id: string,
  condition: boolean,
  evidence: string,
  details?: Record<string, unknown>
): void {
  checks.push({ id, status: condition ? 'passed' : 'failed', evidence, ...(details ? { details } : {}) });
}

function addNotVerified(checks: VerificationCheck[], id: string, evidence: string): void {
  checks.push({ id, status: 'not_verified', evidence });
}

function adapterCheck(adapter: Live2DAdapterConfig | null): VerificationCheck[] {
  const checks: VerificationCheck[] = [];
  if (!adapter) {
    addCheck(checks, 'parameter-adapter', false, '没有生成模型级适配配置');
    return checks;
  }

  const bindings = Object.values(adapter.parameterBindings);
  const requiredBindingIds = [
    'ParamAngleX',
    'ParamAngleY',
    'ParamAngleZ',
    'ParamBodyAngleX',
    'ParamBodyAngleY',
    'ParamBodyAngleZ',
    'ParamEyeLOpen',
    'ParamEyeROpen',
    'ParamEyeBallX',
    'ParamEyeBallY',
    'ParamMouthOpenY',
    'ParamMouthForm',
    'ParamBreath',
    'ParamHairFront',
    'ParamHairSide',
    'ParamHairBack'
  ];
  addCheck(
    checks,
    'parameter-adapter-all-required-bindings',
    requiredBindingIds.every((id) => bindings.some((binding) => binding.targetId === id && binding.available)),
    '模型 cdi3 参数表对全部 16 个标准语义提供了可用目标 ID',
    { available: bindings.filter((binding) => binding.available).length, required: requiredBindingIds.length }
  );

  const controls = buildNamedParameterPatch(adapter, {
    head_x: 30,
    head_y: -30,
    head_z: 20,
    body_x: 10,
    body_y: -10,
    body_z: 10,
    eye_open_l: 0,
    eye_open_r: 1,
    gaze_x: 1,
    gaze_y: -1,
    mouth_open: 1,
    mouth_form: -1,
    breath: 1,
    hair_front: 1,
    hair_side: -1,
    hair_back: 1
  });
  const controlled = applyParameterEffects({}, adapter, controls);
  addCheck(
    checks,
    'parameter-patch-clamp-and-coverage',
    controls.length === requiredBindingIds.length &&
      controlled.ParamAngleX === 30 &&
      controlled.ParamMouthOpenY === 1 &&
      controlled.ParamMouthForm === -1,
    '只通过命名语义构造参数 patch，并按项目侧推荐范围裁剪',
    { patchCount: controls.length, controlledIds: Object.keys(controlled) }
  );

  const independentBlink = applyParameterEffects({}, adapter, [
    { id: 'ParamEyeLOpen', value: 0, blend: 'Overwrite' },
    { id: 'ParamEyeROpen', value: 1, blend: 'Overwrite' }
  ]);
  const syncedBlink = applyParameterEffects({}, adapter, [
    { id: 'ParamEyeLOpen', value: 0, blend: 'Overwrite' },
    { id: 'ParamEyeROpen', value: 0, blend: 'Overwrite' }
  ]);
  addCheck(
    checks,
    'parameter-state-blink-modes',
    independentBlink.ParamEyeLOpen === 0 &&
      independentBlink.ParamEyeROpen === 1 &&
      syncedBlink.ParamEyeLOpen === 0 &&
      syncedBlink.ParamEyeROpen === 0,
    '纯参数状态层可表达左右独立眨眼和同步眨眼；未证明 renderer 视觉效果'
  );

  const semanticExpectations: Record<string, { category: string; parameterId?: string }> = {
    blush: { category: 'expression', parameterId: 'Param130' },
    'confused/circles': { category: 'expression', parameterId: 'Param125' },
    'cry/QQ': { category: 'expression', parameterId: 'Param131' },
    lean_forward: { category: 'action', parameterId: 'Param132' },
    sing: { category: 'action', parameterId: 'Param134' },
    heart: { category: 'action', parameterId: 'Param135' },
    leek_prop: { category: 'action', parameterId: 'Param133' },
    watermark_on: { category: 'system', parameterId: 'Param137' }
  };
  for (const [semantic, expectation] of Object.entries(semanticExpectations)) {
    const route = adapter.semanticMappings[semantic];
    addCheck(
      checks,
      `semantic-map-${semantic.replace(/[^a-z0-9]+/gi, '-')}`,
      Boolean(
        route?.supported &&
          route.category === expectation.category &&
          (!expectation.parameterId || route.effects.some((effect) => effect.id === expectation.parameterId))
      ),
      route?.reason ?? '未生成语义路由',
      { sourceFile: route?.sourceFile ?? null, verifiedBy: route?.verifiedBy ?? [] }
    );
  }

  const watermarkOff = adapter.semanticMappings.watermark_off;
  const watermarkOn = adapter.semanticMappings.watermark_on;
  const nativeWatermarkOff = Boolean(
    watermarkOn?.supported &&
      watermarkOff?.supported &&
      watermarkOff.assetType === 'parameter-preset' &&
      watermarkOff.effects.length > 0 &&
      watermarkOff.effects.every((effect) => effect.value === 0)
  );
  addCheck(
    checks,
    nativeWatermarkOff ? 'watermark-off-native-switch' : 'watermark-off-safe-fallback',
    nativeWatermarkOff || (watermarkOff?.supported === false && watermarkOff.fallbackTo === 'neutral' && watermarkOff.effects.length === 0),
    nativeWatermarkOff
      ? '使用模型自带水印 exp3 确认的参数开关值 0；不编辑、裁剪或重打包模型'
      : '没有可验证的 native off 参数时只回退 neutral，不伪造关闭效果',
    { route: watermarkOff }
  );

  const eventMappings: Record<string, string> = {
    greeting: 'neutral',
    caring: 'caring',
    shy: 'blush',
    confused: 'confused',
    sad: 'sad',
    singing: 'singing',
    affection: 'affection',
    prop_fun: 'prop_fun',
    lean_forward: 'lean_forward'
  };
  const eventResults = Object.entries(eventMappings).map(([event, semantic]) => {
    const resolved = applyLive2DSemantic({}, adapter, semantic).resolved;
    return { event, semantic, resolved: resolved.resolved, fallback: resolved.fallback };
  });
  addCheck(
    checks,
    'ai-semantic-event-routing',
    eventResults.every((item) => item.resolved !== 'set_arbitrary_cubism_parameter') &&
      eventResults.find((item) => item.event === 'greeting')?.resolved === 'neutral',
    'AI 事件只进入白名单语义路由；greeting 在无可验证动作时安全回退 neutral',
    { eventResults }
  );

  let state: Record<string, number> = {};
  for (let cycle = 0; cycle < 50; cycle += 1) {
    for (const semantic of ['blush', 'confused', 'cry', 'lean_forward', 'sing', 'heart', 'leek_prop', 'neutral']) {
      state = applyLive2DSemantic(state, adapter, semantic).state;
    }
  }
  const afterStress = applyLive2DSemantic(state, adapter, 'neutral').state;
  const residualIds = Object.entries(adapter.resetValues)
    .filter(([id, defaultValue]) => afterStress[id] !== defaultValue)
    .map(([id]) => id);
  addCheck(
    checks,
    'semantic-50-cycle-state-stress',
    residualIds.length === 0,
    '纯适配器状态循环 50 次后 neutral 恢复全部语义触碰参数',
    { residualIds }
  );

  addNotVerified(checks, 'renderer-visual-parameter-reactions', '当前应用仍是 CSS 占位形象，未连接 Cubism renderer。');
  return checks;
}

export function runLive2DVerification(entryOverride?: string, reportOverride?: string) {
  const projectRoot = resolve(process.cwd(), '..');
  const defaultEntry = 'D:\\BaiduNetdiskDownload\\miku\\miku\\miku.model3.json';
  const entryPath = entryOverride ?? readArgument('--entry') ?? process.env.BAOYIN_MIKU_MODEL_ENTRY ?? defaultEntry;
  const reportPath = resolve(
    reportOverride ?? readArgument('--report') ?? resolve(projectRoot, 'logs', 'miku-external-model-verification.json')
  );
  const model = inspectExternalLive2DModel(entryPath);
  const checks: VerificationCheck[] = [];
  const modelReady = model.status === 'ready' || model.status === 'ready_with_warnings';

  addCheck(
    checks,
    'external-read-only-selection',
    model.entryPath === resolve(entryPath) && model.directoryPath !== projectRoot,
    '入口来自项目外部目录；导入器只读取路径、JSON、PNG 头和文件元数据，不复制资源。',
    { entryPath: model.entryPath, directoryPath: model.directoryPath }
  );
  addCheck(
    checks,
    'model3-version-and-required-files',
    modelReady && model.version !== null && [3, 4, 5].includes(model.version),
    model.message,
    { status: model.status, version: model.version, issues: model.issues }
  );

  const requiredFiles = model.files.filter((file) => ['model', 'moc', 'texture', 'physics', 'display_info'].includes(file.kind));
  addCheck(
    checks,
    'required-file-existence-and-readability',
    modelReady && requiredFiles.every((file) => file.exists && file.readable),
    'model3、moc3、纹理、physics3 和 cdi3 均存在且可读',
    { requiredFileCount: requiredFiles.length, unreadable: requiredFiles.filter((file) => !file.readable).map((file) => file.fileName) }
  );
  const requiredJson = model.files.filter((file) => ['model', 'physics', 'display_info'].includes(file.kind));
  addCheck(
    checks,
    'required-json-parse',
    requiredJson.length === 3 && requiredJson.every((file) => file.parseStatus === 'ok'),
    'model3/physics3/cdi3 JSON 通过解析',
    { files: requiredJson.map((file) => ({ file: file.fileName, parseStatus: file.parseStatus })) }
  );

  const textures = model.files.filter((file) => file.kind === 'texture');
  addCheck(
    checks,
    'six-4096-textures',
    textures.length === 6 && textures.every((file) => file.parseStatus === 'ok' && file.width === 4096 && file.height === 4096),
    '检查 6 张纹理的 PNG 签名与 IHDR 尺寸',
    { textures: textures.map((file) => ({ file: file.fileName, width: file.width, height: file.height, parseStatus: file.parseStatus })) }
  );

  for (const expression of model.expressions) {
    addCheck(
      checks,
      `exp3-parse-${expression.fileName}`,
      expression.parseStatus === 'ok' && expression.parameterEffects.length > 0,
      expression.error ?? `解析 ${expression.fileName} 的实际参数效果`,
      { parameterEffects: expression.parameterEffects }
    );
  }
  addCheck(
    checks,
    'all-exp3-scanned',
    model.expressions.length === 8 && model.expressions.every((asset) => asset.parseStatus === 'ok'),
    '同目录 8 个 exp3 文件均被扫描并解析',
    { expressionCount: model.expressions.length }
  );
  const sceneMotion = model.motions.find((motion) => motion.fileName === 'Scene1.motion3.json');
  addCheck(
    checks,
    'scene1-motion-parse',
    sceneMotion?.parseStatus === 'ok' && sceneMotion.curveCount === 5,
    sceneMotion?.error ?? 'Scene1.motion3.json 解析并记录曲线清单',
    { motion: sceneMotion ?? null }
  );
  addCheck(
    checks,
    'can3-editor-only-report',
    model.editorAnimations.some((file) => file.fileName === 'Untitled Animation.can3' && file.runtimeSupported === false),
    'can3 只报告存在，不作为浏览器运行时动作'
  );

  checks.push(...adapterCheck(model.adapter));
  addCheck(
    checks,
    'license-and-watermark-notice',
    model.license?.artCredit === '玄宝酱' &&
      model.license?.modelCredit === '怂怂koe' &&
      model.license.defaultWatermark === 'on',
    '记录模型说明中的绘制/建模署名、非商用限制和默认水印打开状态',
    { license: model.license }
  );

  for (const [id, evidence] of [
    ['initial-render-transparent-background', '无真实 Live2D renderer，未取得初始渲染截图。'],
    ['head-angle-extremes-and-center', '未取得 Cubism runtime 参数极值/回中画面。'],
    ['eye-gaze-and-brow-visual', '未取得双眼、眼球和眉毛的真实画面证据。'],
    ['mouth-audio-lipsync-visual', '未接入口型音量驱动或真实 ParamMouthOpenY 渲染。'],
    ['breath-physics-return', '未接入 physics3 runtime，无法验证物理响应和静止回弹。'],
    ['expression-visual-trigger-recovery', '只验证 exp3 参数清单和纯状态层，未取得逐个触发/恢复截图。'],
    ['scene1-motion-play-stop-interrupt', '未接入 motion3 播放器，无法验证播放、停止和中断。'],
    ['switch-placeholder-and-back-resource-release', '未启动真实 renderer，无法验证资源释放和切回状态。'],
    ['fixture-render-failures', '损坏 JSON/缺失纹理夹具由 Vitest 覆盖；真实 renderer 夹具未执行。'],
    ['watermark-visual-toggle', '已记录模型级 native 水印开关，但没有在本次静态报告中取得真实视觉切换证据。']
  ] as const) {
    addNotVerified(checks, id, evidence);
  }

  const counts = checks.reduce(
    (result, check) => {
      result[check.status] += 1;
      return result;
    },
    { passed: 0, failed: 0, not_verified: 0, warning: 0 } as Record<CheckStatus, number>
  );
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    task: 'Project-008 外部 Live2D 只读导入与语义适配测试',
    mode: 'static_read_only_no_cubism_runtime',
    source: {
      entryPath,
      modelDirectory: model.directoryPath,
      copiedIntoProject: false,
      sourceFilesModified: false,
      attribution: model.license,
      externalSourceIsReadOnly: true
    },
    importer: {
      status: model.status,
      message: model.message,
      fileCount: model.files.length,
      expressionCount: model.expressions.length,
      motionCount: model.motions.length,
      can3Count: model.editorAnimations.length,
      physics: model.physics,
      issues: model.issues,
      warnings: model.warnings
    },
    checks,
    summary: counts,
    visualEvidence: {
      screenshots: [],
      recordings: [],
      note: '当前应用仍使用 CSS 安全占位形象；没有把静态解析结果当作视觉渲染证据。'
    },
    commands: [
      'pnpm typecheck',
      'pnpm test',
      'pnpm verify:live2d -- --entry "D:\\BaiduNetdiskDownload\\miku\\miku\\miku.model3.json"'
    ]
  };
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  return report;
}
