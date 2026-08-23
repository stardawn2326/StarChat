import {
  DEFAULT_PRESENTATION_SETTINGS,
  sanitizePresentationSettings,
  type PresentationSettings
} from '../../shared/presentation-contract';

const STORAGE_KEY = 'baoyin.presentation-settings.v1';

export function loadPresentationSettings(): PresentationSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
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
