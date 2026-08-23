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
  adapter: Live2DAdapterConfig | null;
  expressions: Live2DModelState['expressions'];
  motions: Live2DModelState['motions'];
}

export interface CubismRuntimeController {
  load(options: CubismRuntimeOptions): Promise<void>;
  dispose(): void;
  setParameters(patch: readonly CubismParameterPatch[]): void;
  resetParameters(): void;
  playExpression(name: CubismExpressionName): void;
  stopExpression(): void;
  neutral(): void;
  playAction(name: ActionName, interrupt?: boolean): Promise<void>;
  stopAction(): void;
  interruptAction(name: ActionName): void;
  setTransform(transform: CubismTransform): void;
  setViewport(width: number, height: number, renderScale: number): void;
  configureGaze(config: CubismGazeConfig): void;
  setFocusFromScreenCursor(point: { screenX: number; screenY: number; canvasScreenRect: { left: number; top: number } }, moving?: boolean): void;
  setAutoBlink(enabled: boolean): void;
  tap(x: number, y: number): boolean;
  setLipSync(value: number): void;
  getMetrics(): CubismRuntimeMetrics;
}
