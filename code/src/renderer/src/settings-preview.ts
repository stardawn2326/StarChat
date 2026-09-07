import type { AppSettings } from '../../shared/settings';
import type { SettingsPreviewDetail } from '../../shared/ipc';

export const SETTINGS_PREVIEW_EVENT = 'starchat:settings-preview';

export function emitSettingsPreview(detail: SettingsPreviewDetail): void {
  window.dispatchEvent(new CustomEvent<SettingsPreviewDetail>(SETTINGS_PREVIEW_EVENT, { detail }));
  window.starchat.settings.preview(detail);
}

export function isWindowIntent(patch: Partial<AppSettings>): boolean {
  return ['petBounds', 'petWindowOpacity', 'petHoverBorderOpacity', 'petHoverShowDelayMs', 'petHoverFadeMs']
    .some((key) => key in patch);
}
