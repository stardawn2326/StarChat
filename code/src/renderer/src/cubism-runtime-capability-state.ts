import type { CubismRuntimeCapabilities, CubismRuntimeResult } from '../../shared/cubism';

export type RuntimeAssetState = 'waiting' | 'available' | 'runtime_failed' | 'not_provided';

export interface RuntimeCapabilitySnapshot {
  ready: boolean;
  capabilities: CubismRuntimeCapabilities | null;
  result: CubismRuntimeResult | null;
}

function basename(value: string): string {
  return value.replaceAll('\\', '/').split('/').at(-1)?.toLocaleLowerCase() ?? '';
}

export function classifyRuntimeAsset(
  staticFile: string,
  snapshot: RuntimeCapabilitySnapshot,
  expectedModelIdentity?: string | null
): RuntimeAssetState {
  const staticName = basename(staticFile);
  if (!staticName) return 'not_provided';
  if (!snapshot.ready || !snapshot.capabilities) return 'waiting';
  if (expectedModelIdentity && snapshot.capabilities.modelIdentity !== expectedModelIdentity) return 'waiting';
  const available = [...snapshot.capabilities.expressions, ...snapshot.capabilities.motions]
    .some((item) => basename(item.fileName) === staticName);
  if (available) return 'available';
  return snapshot.result?.ok === false || snapshot.capabilities ? 'runtime_failed' : 'not_provided';
}
