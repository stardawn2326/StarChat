import type {
  CubismRuntimeController,
  CubismRuntimeMetrics,
  CubismRuntimeOptions
} from '../../shared/cubism';

export const controller: CubismRuntimeController;
export function startExternalLive2D(
  modelJsonName: string,
  options?: Omit<CubismRuntimeOptions, 'modelJsonName'>
): Promise<void>;
export function stopExternalLive2D(): void;
export function getCubismMetrics(): CubismRuntimeMetrics;
