import type { Live2DAdapterConfig, Live2DModelRecord } from '../shared/live2d';
import type { Live2DAdapterStore } from './live2d-adapter-store';

/**
 * Persists the renderer's explicit Live2D adapter intent without collapsing
 * the undefined/null/empty-configuration states into the same operation.
 */
export function persistLive2DAdapterIntent(
  store: Pick<Live2DAdapterStore, 'save' | 'remove'>,
  targetModel: Live2DModelRecord | null,
  adapter: Live2DAdapterConfig | null | undefined
): void {
  if (!targetModel || adapter === undefined || adapter === null) return;
  if (adapter.overrides) {
    store.save(targetModel.id, adapter.overrides);
    return;
  }
  store.remove(targetModel.id);
}
