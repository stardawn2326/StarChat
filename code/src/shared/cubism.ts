import type { ActionName, ExpressionName } from './role-package';
import type { Live2DAdapterConfig, Live2DModelState } from './live2d';

export type CubismExpressionName = ExpressionName | 'watermark_on' | 'watermark_off';

export interface CubismTransform {
  userScale: number;
  userX: number;
  userY: number;
  finalScale: number;
  viewport: { width: number; height: number };
}

export interface CubismGazeConfig {
  enabled: boolean;
  eyeWeight: number;
  headWeight: number;
  bodyWeight: number;
  bodyFollowStrength?: number;
  bodyLag?: number;
  inertiaStrength?: number;
  idleSwayStrength?: number;
  physicsEnabled?: boolean;
  idleAfterMs?: number;
  deadZone?: number;
  smoothing?: number;
  maxStep?: number;
  rangeX?: number;
  rangeY?: number;
  idleMotionAmplitude?: number;
}

export interface CubismParameterPatch {
  id: string;
  value: number;
  weight?: number;
}

export interface CubismRuntimeMetrics {
  status: 'idle' | 'loading' | 'ready' | 'error' | 'disposed';
  model: string | null;
  fps: number;
  frameCount: number;
  parametersWritten: number;
  activeExpression: string | null;
  activeMotion: string | null;
  lastError: string | null;
  modelLoadStep?: number | null;
  textureCount?: number | null;
  textureExpected?: number | null;
  rendererReady?: boolean;
  renderFrameCount?: number;
  shaderLoaded?: boolean;
  shaderLoading?: boolean;
  shaderSetCount?: number;
  drawableCount?: number;
  drawableVertexCount?: number;
  drawableTextureIndices?: number[];
  contextLost?: boolean;
  glError?: number;
  drawableVisibleCount?: number;
  drawableMaxOpacity?: number;
  modelMatrix?: number[];
  transform?: { baseScale: number; userScale: number; finalScale: number; userX: number; userY: number; viewportW: number; viewportH: number; referenceHeight?: number };
  modelCanvas?: { width: number; height: number };
  gazeTargetX?: number;
  gazeTargetY?: number;
  gazeX?: number;
  gazeY?: number;
  gazeIdle?: boolean;
  updatePhase?: 'pixi-live2d-display' | null;
  physicsEnabled?: boolean;
}

export interface CubismRuntimeOptions {
  modelJsonName: string;
  modelIdentity?: string | null;
  adapter: Live2DAdapterConfig | null;
  expressions: Live2DModelState['expressions'];
  motions: Live2DModelState['motions'];
}

export type CubismRuntimePriority = 'idle' | 'normal' | 'force';

export interface CubismExpressionCapability {
  id: string;
  displayName: string;
  index: number;
  fileName: string;
}

export interface CubismMotionCapability {
  group: string;
  index: number;
  displayName: string;
  fileName: string;
}

export interface CubismRuntimeCapabilities {
  modelIdentity: string | null;
  expressions: CubismExpressionCapability[];
  motions: CubismMotionCapability[];
  idleGroup: string | null;
}

export interface CubismRuntimeActiveMotion {
  group: string;
  index: number;
  priority: CubismRuntimePriority;
}

export interface CubismRuntimeStatus {
  modelIdentity: string | null;
  activeExpression: string | null;
  activeMotion: CubismRuntimeActiveMotion | null;
}

export type CubismRuntimePhase =
  | 'capabilities'
  | 'expression'
  | 'motion'
  | 'stop_expression'
  | 'stop_motion'
  | 'reset';

export type CubismRuntimeFailureCode =
  | 'not_ready'
  | 'unsupported'
  | 'priority_blocked'
  | 'rejected'
  | 'runtime_error';

export interface CubismRuntimeSuccess {
  ok: true;
  phase: CubismRuntimePhase;
  message: string;
  status: CubismRuntimeStatus;
  capabilities: CubismRuntimeCapabilities;
}

export interface CubismRuntimeFailure {
  ok: false;
  phase: CubismRuntimePhase;
  code: CubismRuntimeFailureCode;
  message: string;
  status: CubismRuntimeStatus;
  capabilities: CubismRuntimeCapabilities;
}

export type CubismRuntimeResult = CubismRuntimeSuccess | CubismRuntimeFailure;

export interface CubismRuntimeController {
  load(options: CubismRuntimeOptions): Promise<void>;
  dispose(): void;
  setParameters(patch: readonly CubismParameterPatch[]): void;
  resetParameters(): void;
  getCapabilities(): CubismRuntimeCapabilities;
  getRuntimeStatus(): CubismRuntimeStatus;
  playExpression(name: string | null): Promise<CubismRuntimeResult>;
  playSemanticExpression(name: string | null): Promise<boolean>;
  playMotion(group: string, index: number, priority: CubismRuntimePriority): Promise<CubismRuntimeResult>;
  stopExpression(): CubismRuntimeResult;
  stopMotion(): CubismRuntimeResult;
  reset(): CubismRuntimeResult;
  neutral(): void;
  playAction(name: ActionName, interrupt?: boolean): Promise<void>;
  stopAction(): void;
  interruptAction(name: ActionName): void;
  setTransform(transform: CubismTransform): void;
  setViewport(width: number, height: number, renderScale: number, screenX: number, screenY: number): void;
  configureGaze(config: CubismGazeConfig): void;
  setFocusFromScreenCursor(point: { screenX: number; screenY: number; canvasScreenRect: { left: number; top: number } }, moving?: boolean): void;
  releaseFocus(): void;
  setAutoBlink(enabled: boolean): void;
  tap(x: number, y: number): boolean;
  hitTest(x: number, y: number): boolean;
  setLipSync(value: number, form?: number): void;
  setWatermarkVisible(visible: boolean): void;
  getRenderedBounds(): { x: number; y: number; width: number; height: number } | null;
  getMetrics(): CubismRuntimeMetrics;
}
