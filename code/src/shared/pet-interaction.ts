export interface PetInteractionSettingsLike {
  petLocked?: unknown;
  petInteractionMode?: unknown;
}

/**
 * `petLocked` is the canonical persisted policy. `petInteractionMode` remains
 * a compatibility mirror for settings files written before the migration.
 */
export function petInteractionEnabled(settings: PetInteractionSettingsLike | null | undefined): boolean {
  if (typeof settings?.petLocked === 'boolean') {
    return !settings.petLocked;
  }
  if (typeof settings?.petInteractionMode === 'boolean') {
    return settings.petInteractionMode;
  }
  return true;
}

export function normalizePetInteractionSettings(settings: PetInteractionSettingsLike | null | undefined): {
  petLocked: boolean;
  petInteractionMode: boolean;
} {
  const enabled = petInteractionEnabled(settings);
  return { petLocked: !enabled, petInteractionMode: enabled };
}

export function petInteractionSettingsForEnabled(enabled: boolean): {
  petLocked: boolean;
  petInteractionMode: boolean;
} {
  const normalized = enabled === true;
  return { petLocked: !normalized, petInteractionMode: normalized };
}
