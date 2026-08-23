import type { CubismRuntimeController } from '../../../shared/cubism';

export const controller: CubismRuntimeController;
export function startExternalLive2D(
  modelJsonName: string,
  options?: { adapter: import('../../../shared/live2d').Live2DAdapterConfig | null; expressions: import('../../../shared/live2d').Live2DExpressionAsset[]; motions: import('../../../shared/live2d').Live2DMotionAsset[] }
): Promise<void>;
export function stopExternalLive2D(): void;
export function getCubismMetrics(): import('../../../shared/cubism').CubismRuntimeMetrics;
