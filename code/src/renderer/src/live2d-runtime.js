import { Application } from '@pixi/app';
import { extensions } from '@pixi/extensions';
import { Ticker, TickerPlugin } from '@pixi/ticker';
import { Cubism4ExpressionManager, Live2DModel } from 'pixi-live2d-display/cubism4';
import { pixiWorldPointFromCursor } from './airi-world-coordinate.ts';
import { ExpressionMotionAdapter } from './expression-motion-adapter.ts';
import { CubismRuntimeControl } from './cubism-runtime-control.ts';
import { installPhysicsGate } from './cubism-physics-gate.ts';
import { registerRuntimeAssets } from './runtime-asset-registration.ts';
import { localPointForScreenAnchor, screenPointForLocalPoint } from './screen-space-anchor.ts';

const MIN_USER_SCALE = 0.55;
const MAX_USER_SCALE = 2.4;
const DEFAULT_VIEWPORT = { width: 432, height: 600, renderScale: 1, screenX: 0, screenY: 0 };

const state = {
  status: 'idle',
  model: null,
  fps: 0,
  frameCount: 0,
  parametersWritten: 0,
  activeExpression: null,
  activeMotion: null,
  lastError: null,
  modelLoadStep: null,
  textureCount: null,
  textureExpected: null,
  rendererReady: false,
  renderFrameCount: 0,
  shaderLoaded: false,
  shaderLoading: false,
  shaderSetCount: 0,
  drawableCount: 0,
  drawableVertexCount: 0,
  drawableTextureIndices: [],
  contextLost: false,
  glError: 0,
  drawableVisibleCount: 0,
  drawableMaxOpacity: 0,
  modelMatrix: [],
  modelCanvas: null,
  watermarkParameterValue: null,
  gazeTargetX: 0,
  gazeTargetY: 0,
  gazeX: 0,
  gazeY: 0,
  gazeIdle: false,
  focusModelX: 0,
  focusModelY: 0,
  focusReferenceHeight: null,
  updatePhase: 'pixi-live2d-display',
  nativeUpdaterOrder: ['pixi-live2d-display'],
  overlayOrder: ['package-owned'],
  timelineSequence: 0,
  trackingInput: null,
  physicsEnabled: true,
  physicsOutputValues: {},
  transform: null,
  deltaTimeSeconds: null
};

let app = null;
let model = null;
let canvas = null;
let options = null;
let semanticAdapter = null;
let running = false;
let tickerInstalled = false;
let viewport = { ...DEFAULT_VIEWPORT };
let firstViewport = { ...DEFAULT_VIEWPORT };
let modelBase = null;
let modelScreenAnchor = null;
let currentTransform = { userScale: 1, userX: 0, userY: 0 };
let runtimeControl = null;
let lipSyncValue = 0;
let lipSyncForm = 0;
let mouthFormSupported = false;
let lipSyncHandler = null;
let persistentWatermarkHandler = null;
let motionFinishHandler = null;
let persistentWatermarkEffect = null;
let gazeEnabled = true;
let gazeConfig = null;

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sanitizeGazeConfig(config) {
  return {
    eyeWeight: clamp(finite(Number(config?.eyeWeight), 1), 0, 1),
    headWeight: clamp(finite(Number(config?.headWeight), 0.35), 0, 1),
    bodyWeight: clamp(finite(Number(config?.bodyWeight), 1), 0, 1),
    bodyFollowStrength: clamp(finite(Number(config?.bodyFollowStrength), 0.82), 0, 1),
    bodyLag: clamp(finite(Number(config?.bodyLag), 0.32), 0.05, 1.5),
    inertiaStrength: clamp(finite(Number(config?.inertiaStrength), 0.72), 0, 5),
    idleSwayStrength: clamp(finite(Number(config?.idleSwayStrength), 0.06), 0, 0.15),
    smoothing: clamp(finite(Number(config?.smoothing), 0.22), 0.02, 1),
    maxStep: clamp(finite(Number(config?.maxStep), 0.08), 0.005, 0.4),
    rangeX: clamp(finite(Number(config?.rangeX), 1), 0.1, 1),
    rangeY: clamp(finite(Number(config?.rangeY), 1), 0.1, 1),
    physicsEnabled: config?.physicsEnabled !== false
  };
}

function basename(fileName) {
  return String(fileName ?? '').replace(/\\/g, '/').split('/').at(-1) ?? '';
}

function sameAsset(left, right) {
  return basename(left).toLocaleLowerCase() === basename(right).toLocaleLowerCase();
}

function stripExtension(fileName, extension) {
  return basename(fileName).replace(extension, '');
}

function resetMetrics() {
  Object.assign(state, {
    status: 'idle',
    model: null,
    fps: 0,
    frameCount: 0,
    parametersWritten: 0,
    activeExpression: null,
    activeMotion: null,
    lastError: null,
    modelLoadStep: null,
    textureCount: null,
    textureExpected: null,
    rendererReady: false,
    renderFrameCount: 0,
    shaderLoaded: false,
    shaderLoading: false,
    shaderSetCount: 0,
    drawableCount: 0,
    drawableVertexCount: 0,
    drawableTextureIndices: [],
    contextLost: false,
    glError: 0,
    drawableVisibleCount: 0,
    drawableMaxOpacity: 0,
    modelMatrix: [],
    modelCanvas: null,
    watermarkParameterValue: null,
    gazeTargetX: 0,
    gazeTargetY: 0,
    gazeX: 0,
    gazeY: 0,
    gazeIdle: false,
    focusModelX: 0,
    focusModelY: 0,
    focusReferenceHeight: null,
    updatePhase: 'pixi-live2d-display',
    nativeUpdaterOrder: ['pixi-live2d-display'],
    overlayOrder: ['package-owned'],
    timelineSequence: 0,
    trackingInput: null,
    physicsEnabled: true,
    physicsOutputValues: {},
    transform: null,
    deltaTimeSeconds: null
  });
}

function readViewport() {
  const rect = canvas?.getBoundingClientRect?.();
  const width = Math.max(1, finite(rect?.width, finite(canvas?.clientWidth, DEFAULT_VIEWPORT.width)));
  const height = Math.max(1, finite(rect?.height, finite(canvas?.clientHeight, DEFAULT_VIEWPORT.height)));
  const renderScale = clamp(finite(globalThis.devicePixelRatio, 1), 0.5, 4);
  return {
    width,
    height,
    renderScale,
    screenX: finite(globalThis.screenX, 0),
    screenY: finite(globalThis.screenY, 0)
  };
}

function installAiriTicker() {
  if (tickerInstalled) {
    return;
  }
  Live2DModel.registerTicker(Ticker);
  extensions.add(TickerPlugin);
  tickerInstalled = true;
}

function createPixiApplication(nextViewport) {
  installAiriTicker();
  app = new Application({
    view: canvas,
    width: Math.round(nextViewport.width),
    height: Math.round(nextViewport.height),
    backgroundAlpha: 0,
    preserveDrawingBuffer: true,
    autoDensity: false,
    resolution: nextViewport.renderScale
  });
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  canvas.dataset.viewportCss = `${Math.round(nextViewport.width)}x${Math.round(nextViewport.height)}`;
  canvas.dataset.renderScale = String(nextViewport.renderScale);
}

function applyRendererViewport(nextViewport) {
  const sizeChanged = viewport.width !== nextViewport.width || viewport.height !== nextViewport.height;
  const originChanged = viewport.screenX !== nextViewport.screenX || viewport.screenY !== nextViewport.screenY;
  viewport = { ...nextViewport };
  if (!app) {
    return;
  }
  // Pixi owns the canvas backing store. Keep the scene in CSS-pixel units and
  // let renderer resolution, rather than stage scale, account for the DPR.
  app.renderer.resolution = nextViewport.renderScale;
  app.renderer.resize(
    Math.round(nextViewport.width),
    Math.round(nextViewport.height)
  );
  if (canvas) {
    canvas.dataset.viewportCss = `${Math.round(nextViewport.width)}x${Math.round(nextViewport.height)}`;
    canvas.dataset.renderScale = String(nextViewport.renderScale);
  }
  // do not call applyModelTransform here: keep the model's screen-space anchor
  // stable while the window moves/resizes or the renderer DPR changes. This is
  // a runtime-only local-position update; it does not write back model
  // settings or change the user's model transform.
  if ((sizeChanged || originChanged) && model && modelScreenAnchor) {
    const local = localPointForScreenAnchor(modelScreenAnchor, {
      x: nextViewport.screenX,
      y: nextViewport.screenY
    });
    model.position.set(local.x, local.y);
  }
}

function applyTransformTo(targetModel, targetBase, next) {
  if (!targetModel || !targetBase) {
    return;
  }
  const userScale = clamp(finite(Number(next?.userScale), 1), MIN_USER_SCALE, MAX_USER_SCALE);
  const userX = finite(Number(next?.userX), 0);
  const userY = finite(Number(next?.userY), 0);
  const finalScale = targetBase.scale * userScale;
  targetModel.scale.set(finalScale);
  targetModel.position.set(targetBase.x + userX, targetBase.y + userY);
}

function applyModelTransform(next) {
  if (!model || !modelBase) return;
  const userScale = clamp(finite(Number(next?.userScale), 1), MIN_USER_SCALE, MAX_USER_SCALE);
  const userX = finite(Number(next?.userX), 0);
  const userY = finite(Number(next?.userY), 0);
  const finalScale = modelBase.scale * userScale;
  model.scale.set(finalScale);
  model.position.set(modelBase.x + userX, modelBase.y + userY);
  modelScreenAnchor = screenPointForLocalPoint(
    { x: model.position.x, y: model.position.y },
    { x: viewport.screenX, y: viewport.screenY }
  );
  currentTransform = { userScale, userX, userY };
  state.transform = {
    baseScale: modelBase.scale,
    userScale,
    finalScale,
    userX,
    userY,
    viewportW: firstViewport.width,
    viewportH: firstViewport.height,
    referenceHeight: firstViewport.height
  };
}

function modelDefinitionFile(definition) {
  return definition?.File ?? definition?.file ?? definition?.fileName ?? '';
}

function updateModelMetrics() {
  const internalModel = model?.internalModel;
  const coreModel = internalModel?.coreModel;
  const nativeModel = coreModel?.getModel?.();
  const drawables = nativeModel?.drawables;
  const focus = internalModel?.focusController;
  const worldTransform = model?.transform?.worldTransform;

  state.rendererReady = Boolean(app?.renderer && internalModel?.coreModel);
  state.textureCount = Array.isArray(model?.textures) ? model.textures.length : null;
  state.textureExpected = Array.isArray(internalModel?.settings?.textures)
    ? internalModel.settings.textures.length
    : null;
  state.drawableCount = coreModel?.getDrawableCount?.() ?? drawables?.count ?? 0;
  state.drawableVertexCount = 0;
  state.drawableTextureIndices = [];
  state.drawableVisibleCount = 0;
  state.drawableMaxOpacity = 0;
  for (let index = 0; index < state.drawableCount; index += 1) {
    state.drawableVertexCount += coreModel?.getDrawableVertexCount?.(index) ?? drawables?.vertexCounts?.[index] ?? 0;
    state.drawableTextureIndices.push(coreModel?.getDrawableTextureIndex?.(index) ?? drawables?.textureIndices?.[index] ?? -1);
    if (coreModel?.getDrawableDynamicFlagIsVisible?.(index) || drawables?.dynamicFlags?.[index]) {
      state.drawableVisibleCount += 1;
    }
    state.drawableMaxOpacity = Math.max(
      state.drawableMaxOpacity,
      coreModel?.getDrawableOpacity?.(index) ?? drawables?.opacities?.[index] ?? 0
    );
  }
  state.modelCanvas = internalModel
    ? { width: finite(internalModel.originalWidth, 0), height: finite(internalModel.originalHeight, 0) }
    : null;
  state.modelMatrix = worldTransform
    ? [worldTransform.a, worldTransform.b, worldTransform.c, worldTransform.d, worldTransform.tx, worldTransform.ty]
    : [];
  state.gazeX = finite(focus?.x, 0);
  state.gazeY = finite(focus?.y, 0);
  const runtimeStatus = runtimeControl?.getRuntimeStatus?.();
  state.activeExpression = runtimeStatus?.activeExpression ?? null;
  state.activeMotion = runtimeStatus?.activeMotion
    ? runtimeStatus.activeMotion.group + '[' + runtimeStatus.activeMotion.index + ']'
    : null;
  state.contextLost = Boolean(app?.renderer?.gl?.isContextLost?.());
}

function focusAtModelCenter(instant = true) {
  if (!model) {
    return;
  }
  const worldX = model.position.x;
  const worldY = model.position.y;
  model.focus(worldX, worldY, instant);
  state.gazeTargetX = worldX;
  state.gazeTargetY = worldY;
}

function setFocusFromScreenCursor(point) {
  if (!model || !gazeEnabled || !point) {
    return;
  }
  const worldPoint = pixiWorldPointFromCursor({
    screenX: Number(point.screenX),
    screenY: Number(point.screenY),
    canvasScreenRect: {
      left: Number(point.canvasScreenRect?.left ?? 0),
      top: Number(point.canvasScreenRect?.top ?? 0)
    }
  });
  model.focus(worldPoint.x, worldPoint.y);
  state.gazeTargetX = worldPoint.x;
  state.gazeTargetY = worldPoint.y;
  state.gazeIdle = point.moving === false;
  updateModelMetrics();
}

function routeFor(name, category = 'expression') {
  return semanticAdapter?.getRoute(name, category) ?? null;
}

async function applyExpressionRoute(route) {
  if (!runtimeControl || !route?.sourceFile) return false;
  const capability = runtimeControl.findExpressionByFile(route.sourceFile);
  const result = await runtimeControl.playExpression(capability?.id ?? null);
  syncRuntimeControlState();
  if (!result.ok) state.lastError = result.message;
  return result.ok;
}

function stopPackageMotion() {
  const result = runtimeControl?.stopMotion?.();
  if (result && !result.ok) state.lastError = result.message;
  semanticAdapter?.clearAction();
  syncRuntimeControlState();
}

async function playPackageMotion(route, requestedName, interrupt) {
  if (!runtimeControl) return false;
  let capability = route?.sourceFile ? runtimeControl.findMotionByFile(route.sourceFile) : null;
  if (!capability && requestedName === 'idle') {
    const idleGroup = runtimeControl.getCapabilities().idleGroup;
    capability = idleGroup
      ? runtimeControl.getCapabilities().motions.find((item) => item.group === idleGroup) ?? null
      : null;
  }
  const priority = interrupt ? 'force' : requestedName === 'idle' ? 'idle' : 'normal';
  const result = capability
    ? await runtimeControl.playMotion(capability.group, capability.index, priority)
    : {
        ok: false,
        message: '当前模型没有可用的动作映射：' + requestedName
      };
  syncRuntimeControlState();
  if (!result.ok) state.lastError = result.message;
  return result.ok;
}

function syncRuntimeControlState() {
  const runtimeStatus = runtimeControl?.getRuntimeStatus?.();
  state.activeExpression = runtimeStatus?.activeExpression ?? null;
  state.activeMotion = runtimeStatus?.activeMotion
    ? runtimeStatus.activeMotion.group + '[' + runtimeStatus.activeMotion.index + ']'
    : null;
}

function installModelEvents() {
  const internalModel = model?.internalModel;
  const coreModel = internalModel?.coreModel;
  mouthFormSupported = Number(coreModel?.getParameterIndex?.('ParamMouthForm')) >= 0;
  lipSyncHandler = () => {
    coreModel?.setParameterValueById?.('ParamMouthOpenY', lipSyncValue);
    if (mouthFormSupported) {
      coreModel?.setParameterValueById?.('ParamMouthForm', lipSyncForm);
    }
  };
  internalModel?.on?.('beforeModelUpdate', lipSyncHandler);
  motionFinishHandler = syncRuntimeControlState;
  persistentWatermarkHandler = () => {
    if (persistentWatermarkEffect?.id) {
      internalModel?.coreModel?.setParameterValueById?.(persistentWatermarkEffect.id, persistentWatermarkEffect.value);
    }
  };
  internalModel?.on?.('beforeModelUpdate', persistentWatermarkHandler);
  model?.internalModel?.motionManager?.on?.('motionFinish', motionFinishHandler);
}

function tapAtNormalizedPoint(x, y) {
  if (!model) {
    return false;
  }
  const worldX = (clamp(finite(Number(x), 0), -1, 1) + 1) * 0.5 * viewport.width;
  const worldY = (1 - clamp(finite(Number(y), 0), -1, 1)) * 0.5 * viewport.height;
  const hitAreas = model.hitTest(worldX, worldY);
  if (hitAreas.length === 0) {
    return false;
  }
  model.tap(worldX, worldY);
  return true;
}

function hitTestNormalized(x, y) {
  if (!model) return false;
  const worldX = (clamp(finite(Number(x), 0), -1, 1) + 1) * 0.5 * viewport.width;
  const worldY = (1 - clamp(finite(Number(y), 0), -1, 1)) * 0.5 * viewport.height;
  if (model.hitTest(worldX, worldY).length > 0) {
    return true;
  }

  const hitAreas = model.internalModel?.hitAreas ?? model.internalModel?.settings?.hitAreas;
  const hasHitAreas = Array.isArray(hitAreas) ? hitAreas.length > 0 : Boolean(hitAreas && Object.keys(hitAreas).length > 0);
  if (hasHitAreas) {
    return false;
  }

  // External models are allowed to omit HitAreas. In that case use the
  // current Pixi-rendered bounds, which include the model's actual transform
  // and scale, instead of inventing a fixed ellipse in window coordinates.
  const renderedBounds = model.getBounds?.();
  if (!renderedBounds || ![renderedBounds.x, renderedBounds.y, renderedBounds.width, renderedBounds.height].every(Number.isFinite)) {
    return false;
  }
  return worldX >= renderedBounds.x
    && worldX <= renderedBounds.x + renderedBounds.width
    && worldY >= renderedBounds.y
    && worldY <= renderedBounds.y + renderedBounds.height;
}

export const controller = {
  async load(nextOptions) {
    if (!nextOptions?.modelJsonName) {
      throw new Error('缺少 model3.json 文件名');
    }
    const sameModel = model && options?.modelIdentity && nextOptions?.modelIdentity
      ? options.modelIdentity === nextOptions.modelIdentity
      : Boolean(model && sameAsset(options?.modelJsonName, nextOptions.modelJsonName));
    if (sameModel) {
      return;
    }
    const previousModel = model;
    const previousOptions = options;
    const previousModelBase = modelBase;
    const previousTransform = { ...currentTransform };
    const hadPreviousRuntime = Boolean(previousModel && app);
    resetMetrics();
    const candidateAdapter = new ExpressionMotionAdapter(nextOptions.adapter ?? null, {
      expressions: (nextOptions.expressions ?? []).map((asset) => asset.fileName),
      motions: (nextOptions.motions ?? []).map((asset) => asset.fileName)
    });
    state.status = 'loading';
    state.model = nextOptions.modelJsonName;
    state.lastError = null;
    canvas = document.querySelector('[data-live2d-canvas]');
    if (!(canvas instanceof HTMLCanvasElement)) {
      state.status = 'error';
      throw new Error('缺少 Live2D Pixi canvas');
    }
    if (!app) {
      viewport = readViewport();
      firstViewport = { ...viewport };
      createPixiApplication(viewport);
    }
    running = true;
    let candidateModel = null;
    let candidateControl = null;
    try {
      const source = `live2d://model/${encodeURIComponent(basename(nextOptions.modelJsonName))}`;
      candidateModel = await Live2DModel.from(source, { autoInteract: false, autoUpdate: true });
      installPhysicsGate(candidateModel.internalModel);
      // The committed runtime continues to use model.anchor.set(0.5, 0.5).
      candidateModel.anchor.set(0.5, 0.5);
      candidateModel.visible = false;
      app.stage.addChild(candidateModel);
      const registration = registerRuntimeAssets(candidateModel.internalModel ?? {}, {
        expressions: nextOptions.expressions,
        motions: nextOptions.motions
      });
      if (registration.needsExpressionManager) {
        candidateModel.internalModel.motionManager.expressionManager = new Cubism4ExpressionManager(
          candidateModel.internalModel.settings,
          nextOptions
        );
      }
      const naturalWidth = Math.max(1, finite(candidateModel.width, finite(candidateModel.internalModel?.originalWidth, 1)));
      const naturalHeight = Math.max(1, finite(candidateModel.height, finite(candidateModel.internalModel?.originalHeight, 1)));
      const candidateBase = {
        scale: Math.min(firstViewport.width / naturalWidth, firstViewport.height / naturalHeight),
        x: firstViewport.width / 2,
        y: firstViewport.height / 2
      };
      applyTransformTo(candidateModel, candidateBase, { userScale: 1, userX: 0, userY: 0 });
      candidateControl = new CubismRuntimeControl();
      candidateControl.bind(candidateModel, nextOptions.modelIdentity ?? null);

      // Commit only after the complete model and its initial transform exist.
      // The old model stays visible while Live2DModel.from() parses assets.
      if (previousModel && app.stage) {
        app.stage.removeChild(previousModel);
        if (lipSyncHandler) previousModel.internalModel?.off?.('beforeModelUpdate', lipSyncHandler);
        if (persistentWatermarkHandler) previousModel.internalModel?.off?.('beforeModelUpdate', persistentWatermarkHandler);
        if (motionFinishHandler) previousModel.internalModel?.motionManager?.off?.('motionFinish', motionFinishHandler);
        previousModel.destroy?.({ children: true });
      }
      runtimeControl?.dispose?.();
      model = candidateModel;
      candidateModel = null;
      runtimeControl = candidateControl;
      candidateControl = null;
      options = nextOptions;
      semanticAdapter = candidateAdapter;
      currentTransform = { userScale: 1, userX: 0, userY: 0 };
      modelBase = candidateBase;
      model.visible = true;
      lipSyncHandler = null;
      persistentWatermarkHandler = null;
      persistentWatermarkEffect = null;
      installModelEvents();
      applyModelTransform(currentTransform);
      syncRuntimeControlState();
      state.status = 'ready';
      updateModelMetrics();
    } catch (error) {
      candidateControl?.dispose?.();
      candidateModel?.parent?.removeChild?.(candidateModel);
      candidateModel?.destroy?.({ children: true });
      if (hadPreviousRuntime && previousModel) {
        model = previousModel;
        options = previousOptions;
        modelBase = previousModelBase;
        currentTransform = previousTransform;
        state.status = 'ready';
        state.model = previousOptions?.modelJsonName ?? null;
        state.lastError = error instanceof Error ? error.message : String(error);
        updateModelMetrics();
      } else {
        state.status = 'error';
        state.lastError = error instanceof Error ? error.message : String(error);
        this.dispose();
      }
      throw error;
    }
  },

  dispose() {
    running = false;
    if (model && app?.stage) {
      app.stage.removeChild(model);
    }
    if (lipSyncHandler) model?.internalModel?.off?.('beforeModelUpdate', lipSyncHandler);
    if (persistentWatermarkHandler) model?.internalModel?.off?.('beforeModelUpdate', persistentWatermarkHandler);
    if (motionFinishHandler) model?.internalModel?.motionManager?.off?.('motionFinish', motionFinishHandler);
    lipSyncHandler = null;
    persistentWatermarkHandler = null;
    motionFinishHandler = null;
    persistentWatermarkEffect = null;
    lipSyncValue = 0;
    lipSyncForm = 0;
    mouthFormSupported = false;
    model?.destroy?.({ children: true });
    model = null;
    app?.destroy?.(false);
    app = null;
    canvas = null;
    options = null;
    semanticAdapter = null;
    runtimeControl?.dispose?.();
    runtimeControl = null;
    modelBase = null;
    currentTransform = { userScale: 1, userX: 0, userY: 0 };
    state.status = 'disposed';
    state.model = null;
    state.rendererReady = false;
    state.activeExpression = null;
    state.activeMotion = null;
  },

  setParameters(patch) {
    if (Array.isArray(patch) && patch.length > 0) {
      state.lastError = 'AIRI 运行链拥有 Cubism 参数更新；调试参数写入已停用。';
    }
  },

  resetParameters() {
    this.reset();
  },

  async playExpression(expressionId) {
    const result = runtimeControl?.playExpression
      ? await runtimeControl.playExpression(expressionId)
      : { ok: false, phase: 'expression', code: 'not_ready', message: 'Cubism 模型尚未初始化。' };
    syncRuntimeControlState();
    if (!result.ok) state.lastError = result.message;
    return result;
  },

  async playSemanticExpression(name) {
    if (!runtimeControl || !name) {
      return false;
    }
    let route;
    if (name === 'watermark_on' || name === 'watermark_off') {
      route = semanticAdapter?.setWatermark(name === 'watermark_on') ?? routeFor(name, 'system');
    } else {
      route = semanticAdapter?.setExpression(name) ?? routeFor(name, 'expression');
    }
    if (!route?.sourceFile) {
      if (name !== 'watermark_on' && name !== 'watermark_off') {
        this.stopExpression();
      }
      return false;
    }
    return applyExpressionRoute(route);
  },

  async playMotion(group, index, priority = 'normal') {
    const result = runtimeControl?.playMotion
      ? await runtimeControl.playMotion(group, index, priority)
      : { ok: false, phase: 'motion', code: 'not_ready', message: 'Cubism 模型尚未初始化。' };
    syncRuntimeControlState();
    if (!result.ok) state.lastError = result.message;
    return result;
  },

  stopExpression() {
    const result = runtimeControl?.stopExpression?.()
      ?? { ok: false, phase: 'stop_expression', code: 'not_ready', message: 'Cubism 模型尚未初始化。' };
    semanticAdapter?.clearExpression();
    syncRuntimeControlState();
    if (!result.ok) state.lastError = result.message;
    return result;
  },

  stopMotion() {
    const result = runtimeControl?.stopMotion?.()
      ?? { ok: false, phase: 'stop_motion', code: 'not_ready', message: 'Cubism 模型尚未初始化。' };
    semanticAdapter?.clearAction();
    syncRuntimeControlState();
    if (!result.ok) state.lastError = result.message;
    return result;
  },

  reset() {
    const result = runtimeControl?.reset?.()
      ?? { ok: false, phase: 'reset', code: 'not_ready', message: 'Cubism 模型尚未初始化。' };
    semanticAdapter?.clearExpression();
    semanticAdapter?.clearAction();
    syncRuntimeControlState();
    if (!result.ok) state.lastError = result.message;
    return result;
  },

  getCapabilities() {
    return runtimeControl?.getCapabilities?.() ?? {
      modelIdentity: null,
      expressions: [],
      motions: [],
      idleGroup: null
    };
  },

  getRuntimeStatus() {
    return runtimeControl?.getRuntimeStatus?.() ?? {
      modelIdentity: null,
      activeExpression: null,
      activeMotion: null
    };
  },

  neutral() {
    this.reset();
  },

  async playAction(name, interrupt = true) {
    if (!model || !name) {
      return;
    }
    const route = semanticAdapter?.setAction(name) ?? routeFor(name, 'action');
    await playPackageMotion(route, name, interrupt);
  },

  stopAction() {
    return stopPackageMotion();
  },

  interruptAction(name) {
    stopPackageMotion();
    void this.playAction(name, true);
  },

  setTransform(next) {
    if (!next) {
      return;
    }
    applyModelTransform(next);
  },

  setViewport(width, height, renderScale, screenX, screenY) {
    applyRendererViewport({
      width: Math.max(1, finite(Number(width), viewport.width)),
      height: Math.max(1, finite(Number(height), viewport.height)),
      renderScale: clamp(finite(Number(renderScale), viewport.renderScale), 0.5, 4),
      screenX: finite(Number(screenX), viewport.screenX),
      screenY: finite(Number(screenY), viewport.screenY)
    });
  },

  configureGaze(config) {
    gazeEnabled = config?.enabled !== false;
    gazeConfig = sanitizeGazeConfig(config);
    state.physicsEnabled = gazeConfig.physicsEnabled;
    model?.internalModel?.configureFocus?.(gazeConfig);
    model?.internalModel?.setPhysicsEnabled?.(state.physicsEnabled);
    if (!gazeEnabled) {
      focusAtModelCenter(true);
      state.gazeIdle = true;
    }
  },

  setGaze(x, y) {
    if (!model || !gazeEnabled) {
      return;
    }
    const worldX = finite(Number(x), 0);
    const worldY = finite(Number(y), 0);
    model.focus(worldX, worldY);
    state.gazeTargetX = worldX;
    state.gazeTargetY = worldY;
  },

  setFocusFromScreenCursor(point) {
    setFocusFromScreenCursor(point);
  },

  releaseFocus() {
    if (!model) return;
    focusAtModelCenter(false);
    state.gazeIdle = true;
  },

  setAutoBlink(_enabled) {
    // Cubism eye blink remains package-owned. No product updater is installed.
  },

  tap(x, y) {
    return tapAtNormalizedPoint(x, y);
  },

  hitTest(x, y) {
    return hitTestNormalized(x, y);
  },

  setLipSync(value, form = 0) {
    lipSyncValue = clamp(finite(Number(value), 0), 0, 1);
    lipSyncForm = clamp(finite(Number(form), 0), -1, 1);
  },

  setWatermarkVisible(visible) {
    const route = semanticAdapter?.setWatermark(visible) ?? routeFor(visible ? 'watermark_on' : 'watermark_off', 'system');
    const effect = route?.effects?.find((candidate) => candidate?.id && Number.isFinite(Number(candidate.value)));
    persistentWatermarkEffect = effect ? { id: effect.id, value: Number(effect.value) } : null;
    persistentWatermarkHandler?.();
  },

  getRenderedBounds() {
    if (!model) return null;
    const bounds = model.getBounds?.();
    if (!bounds || ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) return null;
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  },

  getMetrics() {
    updateModelMetrics();
    return { ...state };
  }
};

export async function startExternalLive2D(modelJsonName, runtimeOptions = {}) {
  return controller.load({ modelJsonName, ...runtimeOptions });
}

export function stopExternalLive2D() {
  controller.dispose();
}

export function getCubismMetrics() {
  return controller.getMetrics();
}
