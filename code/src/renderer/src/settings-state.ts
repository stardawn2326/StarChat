import type { AppSettings } from '../../shared/settings';
import type { WindowBounds } from '../../shared/window-contract';

/** Keep native window moves/resizes from being overwritten by a stale settings draft. */
export function syncPetBoundsIntoSettings(settings: AppSettings, bounds: WindowBounds): AppSettings {
  return { ...settings, petBounds: { ...bounds } };
}
