import {
  DEFAULT_PRESENTATION_SETTINGS,
  sanitizePresentationSettings,
  type PresentationSettings
} from '../../shared/presentation-contract';

const STORAGE_KEY = 'starchat.presentation-settings.v1';
const LEGACY_STORAGE_KEY = 'baoyin.presentation-settings.v1';

export function loadPresentationSettings(): PresentationSettings {
  try {
    const current = window.localStorage.getItem(STORAGE_KEY);
    const legacy = current === null ? window.localStorage.getItem(LEGACY_STORAGE_KEY) : null;
    const raw = current ?? legacy;
    if (legacy !== null) {
      window.localStorage.setItem(STORAGE_KEY, legacy);
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    }
    return raw ? sanitizePresentationSettings(JSON.parse(raw) as Partial<PresentationSettings>) : DEFAULT_PRESENTATION_SETTINGS;
  } catch {
    return DEFAULT_PRESENTATION_SETTINGS;
  }
}

export function persistPresentationSettings(settings: PresentationSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizePresentationSettings(settings)));
  } catch {
    // Renderer storage may be unavailable in a restricted profile; preview remains usable.
  }
}
