import { Application } from '@pixi/app';
import { extensions } from '@pixi/extensions';
import { Ticker, TickerPlugin } from '@pixi/ticker';
import { Live2DModel, MotionPriority } from 'pixi-live2d-display/cubism4';
import { pixiWorldPointFromCursor } from './airi-world-coordinate.ts';
import { ExpressionMotionAdapter } from './expression-motion-adapter.ts';

const MIN_USER_SCALE = 0.55;
const MAX_USER_SCALE = 2.4;
const DEFAULT_VIEWPORT = { width: 432, height: 600, renderScale: 1 };

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
let currentTransform = { userScale: 1, userX: 0, userY: 0 };
let lipSyncValue = 0;
let lipSyncHandler = null;
let persistentWatermarkHandler = null;
let persistentWatermarkEffect = null;
let gazeEnabled = true;

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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
  return { width, height, renderScale };
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
  // Deliberately do not call applyModelTransform here. Resize changes the
  // renderer's transparent crop and render resolution only.
}

function applyModelTransform(next) {
  if (!model || !modelBase) {
    return;
  }
  const userScale = clamp(finite(Number(next?.userScale), 1), MIN_USER_SCALE, MAX_USER_SCALE);
  const userX = finite(Number(next?.userX), 0);
  const userY = finite(Number(next?.userY), 0);
  const finalScale = modelBase.scale * userScale;
  model.scale.set(finalScale);
  model.position.set(modelBase.x + userX, modelBase.y + userY);
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

function findExpressionName(sourceFile) {
  const definitions = model?.internalModel?.motionManager?.expressionManager?.definitions;
  for (const definition of Object.values(definitions ?? {})) {
    if (sameAsset(modelDefinitionFile(definition), sourceFile)) {
      return definition?.Name ?? definition?.name ?? stripExtension(sourceFile, /\.exp3\.json$/i);
    }
  }
  return stripExtension(sourceFile, /\.exp3\.json$/i);
}

function findMotionDefinition(sourceFile) {
  const definitions = model?.internalModel?.motionManager?.definitions ?? {};
  for (const [group, entries] of Object.entries(definitions)) {
    const index = (entries ?? []).findIndex((definition) => sameAsset(modelDefinitionFile(definition), sourceFile));
    if (index >= 0) {
      return { group, index };
    }
  }
  return null;
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
  state.activeMotion = internalModel?.motionManager?.state?.currentGroup ?? state.activeMotion;
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
  model.internalModel?.setFocusActive?.(true);
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
  if (!model || !route?.sourceFile) {
    return false;
  }
  const expressionName = findExpressionName(route.sourceFile);
  const started = await model.expression(expressionName);
  if (!started) {
    state.lastError = `AIRI 表情定义未启动：${expressionName}`;
  }
  return started;
}

function stopPackageMotion() {
  model?.internalModel?.motionManager?.stopAllMotions?.();
  semanticAdapter?.clearAction();
  state.activeMotion = null;
}

async function playPackageMotion(route, requestedName, interrupt) {
  if (!model) {
    return false;
  }
  const motionManager = model.internalModel?.motionManager;
  if (interrupt) {
    motionManager?.stopAllMotions?.();
  }
  let definition = route?.sourceFile ? findMotionDefinition(route.sourceFile) : null;
  if (!definition && requestedName === 'idle') {
    const idleGroup = motionManager?.groups?.idle ?? 'Idle';
    if (motionManager?.definitions?.[idleGroup]) {
      definition = { group: idleGroup, index: undefined };
    }
  }
  if (!definition) {
    state.lastError = `AIRI 动作定义未找到：${requestedName}`;
    state.activeMotion = null;
    return false;
  }
  const started = await model.motion(
    definition.group,
    definition.index,
    interrupt ? MotionPriority.FORCE : MotionPriority.NORMAL
  );
  if (started) {
    state.activeMotion = requestedName;
  } else {
    state.lastError = `AIRI 动作未启动：${definition.group}`;
    state.activeMotion = null;
  }
  return started;
}

function installModelEvents() {
  const internalModel = model?.internalModel;
  lipSyncHandler = () => {
    internalModel?.coreModel?.setParameterValueById?.('ParamMouthOpenY', lipSyncValue);
  };
  internalModel?.on?.('beforeModelUpdate', lipSyncHandler);
  persistentWatermarkHandler = () => {
    if (persistentWatermarkEffect?.id) {
      internalModel?.coreModel?.setParameterValueById?.(persistentWatermarkEffect.id, persistentWatermarkEffect.value);
    }
  };
  internalModel?.on?.('beforeModelUpdate', persistentWatermarkHandler);
  model?.on?.('hit', (hitAreas) => {
    const motionManager = model?.internalModel?.motionManager;
    const hitBody = (hitAreas ?? []).some((area) => /body|head/i.test(area));
    if (!hitBody || !motionManager) {
      return;
    }
    const group = ['TapBody', 'tap_body', 'Tap', 'tap'].find((candidate) => motionManager.definitions?.[candidate]);
    if (group) {
      void model.motion(group, undefined, MotionPriority.NORMAL);
    }
  });
  model?.internalModel?.motionManager?.on?.('motionFinish', () => {
    state.activeMotion = null;
  });
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

export const controller = {
  async load(nextOptions) {
    if (!nextOptions?.modelJsonName) {
      throw new Error('缺少 model3.json 文件名');
    }
    if (running) {
      this.dispose();
    }
    resetMetrics();
    options = nextOptions;
    semanticAdapter = new ExpressionMotionAdapter(nextOptions.adapter ?? null, {
      expressions: (nextOptions.expressions ?? []).map((asset) => asset.fileName),
      motions: (nextOptions.motions ?? []).map((asset) => asset.fileName)
    });
    currentTransform = { userScale: 1, userX: 0, userY: 0 };
    modelBase = null;
    state.status = 'loading';
    state.model = nextOptions.modelJsonName;
    state.lastError = null;
    canvas = document.querySelector('[data-live2d-canvas]');
    if (!(canvas instanceof HTMLCanvasElement)) {
      state.status = 'error';
      throw new Error('缺少 Live2D Pixi canvas');
    }
    viewport = readViewport();
    firstViewport = { ...viewport };
    createPixiApplication(viewport);
    running = true;
    try {
      const source = `live2d://model/${encodeURIComponent(basename(nextOptions.modelJsonName))}`;
      model = await Live2DModel.from(source, { autoInteract: false, autoUpdate: true });
      model.anchor.set(0.5, 0.5);
      app.stage.addChild(model);
      const naturalWidth = Math.max(1, finite(model.width, finite(model.internalModel?.originalWidth, 1)));
      const naturalHeight = Math.max(1, finite(model.height, finite(model.internalModel?.originalHeight, 1)));
      modelBase = {
        scale: Math.min(firstViewport.width / naturalWidth, firstViewport.height / naturalHeight),
        x: firstViewport.width / 2,
        y: firstViewport.height / 2
      };
      applyModelTransform(currentTransform);
      installModelEvents();
      state.status = 'ready';
      updateModelMetrics();
    } catch (error) {
      state.status = 'error';
      state.lastError = error instanceof Error ? error.message : String(error);
      this.dispose();
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
    lipSyncHandler = null;
    persistentWatermarkHandler = null;
    persistentWatermarkEffect = null;
    lipSyncValue = 0;
    model?.destroy?.({ children: true });
    model = null;
    app?.destroy?.(false);
    app = null;
    canvas = null;
    options = null;
    semanticAdapter = null;
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
    this.stopExpression();
  },

  playExpression(name) {
    if (!model || !name) {
      return;
    }
    let route;
    if (name === 'watermark_on' || name === 'watermark_off') {
      route = semanticAdapter?.setWatermark(name === 'watermark_on') ?? routeFor(name, 'system');
    } else {
      route = semanticAdapter?.setExpression(name) ?? routeFor(name, 'expression');
    }
    state.activeExpression = name;
    if (!route?.sourceFile) {
      if (name !== 'watermark_on' && name !== 'watermark_off') {
        this.stopExpression();
      }
      return;
    }
    void applyExpressionRoute(route).catch((error) => {
      state.lastError = error instanceof Error ? error.message : String(error);
    });
  },

  stopExpression() {
    model?.internalModel?.motionManager?.expressionManager?.resetExpression?.();
    semanticAdapter?.clearExpression();
    state.activeExpression = null;
  },

  neutral() {
    this.stopExpression();
    this.stopAction();
  },

  async playAction(name, interrupt = true) {
    if (!model || !name) {
      return;
    }
    const route = semanticAdapter?.setAction(name) ?? routeFor(name, 'action');
    await playPackageMotion(route, name, interrupt);
  },

  stopAction() {
    stopPackageMotion();
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

  setViewport(width, height, renderScale) {
    applyRendererViewport({
      width: Math.max(1, finite(Number(width), viewport.width)),
      height: Math.max(1, finite(Number(height), viewport.height)),
      renderScale: clamp(finite(Number(renderScale), viewport.renderScale), 0.5, 4)
    });
  },

  configureGaze(config) {
    gazeEnabled = config?.enabled !== false;
    state.physicsEnabled = config?.physicsEnabled !== false;
    const internalModel = model?.internalModel;
    internalModel?.configureFocus?.({
      eyeWeight: clamp(finite(Number(config?.eyeWeight), 1), 0, 1),
      headWeight: clamp(finite(Number(config?.headWeight), 0.35), 0, 1),
      bodyWeight: clamp(finite(Number(config?.bodyWeight), 0.72), 0, 1),
      bodyFollowStrength: clamp(finite(Number(config?.bodyFollowStrength), 0.82), 0, 1),
      bodyLag: clamp(finite(Number(config?.bodyLag), 0.32), 0.05, 1.5),
      inertiaStrength: clamp(finite(Number(config?.inertiaStrength), 0.72), 0, 5),
      idleSwayStrength: clamp(finite(Number(config?.idleSwayStrength), 0.06), 0, 0.15)
    });
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
    model.internalModel?.setFocusActive?.(false);
    focusAtModelCenter(false);
    state.gazeIdle = true;
  },

  setAutoBlink(_enabled) {
    // Cubism eye blink remains package-owned. No product updater is installed.
  },

  tap(x, y) {
    return tapAtNormalizedPoint(x, y);
  },

  setLipSync(value) {
    lipSyncValue = clamp(finite(Number(value), 0), 0, 1);
  },

  setWatermarkVisible(visible) {
    const route = semanticAdapter?.setWatermark(visible) ?? routeFor(visible ? 'watermark_on' : 'watermark_off', 'system');
    const effect = route?.effects?.find((candidate) => candidate?.id && Number.isFinite(Number(candidate.value)));
    persistentWatermarkEffect = effect ? { id: effect.id, value: Number(effect.value) } : null;
    persistentWatermarkHandler?.();
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
