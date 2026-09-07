import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_APP_SETTINGS,
  DEFAULT_CURSOR_BODY_WEIGHT,
  INTERMEDIATE_CURSOR_BODY_WEIGHT,
  LEGACY_DEFAULT_CURSOR_BODY_WEIGHT,
  sanitizeAppSettings,
  type AppSettings,
  type SensitiveSettings
} from '../shared/settings';
import type { Live2DAdapterConfig } from '../shared/live2d';
import { BUILTIN_ROLE_PACKAGES, DEFAULT_ROLE_PACKAGE, isBuiltinRoleId } from '../shared/default-role';
import { validateRolePackage, type RolePackage } from '../shared/role-package';
import { createPersonalityRequestSnapshot, type PersonalityRequestSnapshot } from '../shared/personality-contract';
import { createCompanionState, sanitizeCompanionState, type CompanionState } from '../shared/companion';
import {
  DEFAULT_WORKBENCH_WINDOW_STATE,
  sanitizePersistedWorkbenchWindowState,
  type PersistedWorkbenchWindowState
} from './window-state';

interface StoredSecrets {
  apiKey: string;
}

function readJson<T>(filePath: string, fallback: T): T {
  if (!existsSync(filePath)) {
    return fallback;
  }
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

export class SettingsStore {
  private readonly settingsPath: string;
  private readonly secretsPath: string;
  private readonly live2dAdapterPath: string;
  private readonly rolesPath: string;
  private readonly companionStatePath: string;
  private readonly workbenchWindowStatePath: string;

  constructor(private readonly baseDir: string) {
    this.settingsPath = join(baseDir, 'settings.json');
    this.secretsPath = join(baseDir, 'secrets.json');
    this.live2dAdapterPath = join(baseDir, 'live2d-adapter.json');
    this.rolesPath = join(baseDir, 'roles.json');
    this.companionStatePath = join(baseDir, 'companion-state.json');
    this.workbenchWindowStatePath = join(baseDir, 'workbench-window-state.json');
  }

  readWorkbenchWindowState(): PersistedWorkbenchWindowState {
    return sanitizePersistedWorkbenchWindowState(
      readJson<unknown>(this.workbenchWindowStatePath, DEFAULT_WORKBENCH_WINDOW_STATE)
    );
  }

  saveWorkbenchWindowState(value: PersistedWorkbenchWindowState): PersistedWorkbenchWindowState {
    const sanitized = sanitizePersistedWorkbenchWindowState(value);
    mkdirSync(this.baseDir, { recursive: true });
    writeFileSync(this.workbenchWindowStatePath, JSON.stringify(sanitized, null, 2), 'utf8');
    return sanitized;
  }

  readSettings(): AppSettings {
    const stored = readJson<Partial<AppSettings>>(this.settingsPath, {});
    const legacyBodyDefault = existsSync(this.settingsPath)
      && [LEGACY_DEFAULT_CURSOR_BODY_WEIGHT, INTERMEDIATE_CURSOR_BODY_WEIGHT].includes(Number(stored.cursorBodyWeight));
    const storedPresentation = stored.presentation;
    const legacyPresentationDefault = existsSync(this.settingsPath)
      && Number(storedPresentation?.bodyFollowStrength) === 0.45
      && Number(storedPresentation?.bodyLag) === 0.22
      && Number(storedPresentation?.inertiaStrength) === 0.18
      && Number(storedPresentation?.idleSwayStrength) === 0.035;
    const sanitized = sanitizeAppSettings({
      ...stored,
      ...(legacyBodyDefault ? { cursorBodyWeight: DEFAULT_CURSOR_BODY_WEIGHT } : {}),
      ...(legacyPresentationDefault ? { presentation: DEFAULT_APP_SETTINGS.presentation } : {})
    });
    const interactionMigrated = stored.petLocked !== sanitized.petLocked || stored.petInteractionMode !== sanitized.petInteractionMode;
    const themeMigrated = existsSync(this.settingsPath) && stored.themePreference !== sanitized.themePreference;
    if (legacyBodyDefault || legacyPresentationDefault || interactionMigrated || themeMigrated) {
      mkdirSync(this.baseDir, { recursive: true });
      writeFileSync(this.settingsPath, JSON.stringify(sanitized, null, 2), 'utf8');
    }
    return sanitized;
  }

  readSecrets(): SensitiveSettings {
    const stored = readJson<StoredSecrets>(this.secretsPath, { apiKey: '' });
    return { apiKey: typeof stored.apiKey === 'string' ? stored.apiKey : '' };
  }

  hasApiKey(): boolean {
    return this.readSecrets().apiKey.length > 0;
  }

  readLive2DAdapter(): Live2DAdapterConfig | null {
    return readJson<Live2DAdapterConfig | null>(this.live2dAdapterPath, null);
  }

  readRolePackages(): RolePackage[] {
    const stored = readJson<unknown[]>(this.rolesPath, []);
    const result: RolePackage[] = [...BUILTIN_ROLE_PACKAGES];
    if (!Array.isArray(stored)) return result;
    for (const candidate of stored) {
      try {
        const role = validateRolePackage(candidate);
        if (!isBuiltinRoleId(role.id) && !result.some((item) => item.id === role.id)) {
          result.push(role);
        }
      } catch {
        // A malformed imported role must not prevent the app from starting.
      }
    }
    return result;
  }

  saveRolePackage(input: unknown): RolePackage {
    const role = validateRolePackage(input);
    const custom = this.readRolePackages().filter((item) => !isBuiltinRoleId(item.id) && item.id !== role.id);
    if (!isBuiltinRoleId(role.id)) custom.push(role);
    mkdirSync(this.baseDir, { recursive: true });
    writeFileSync(this.rolesPath, JSON.stringify(custom, null, 2), 'utf8');
    return role;
  }

  activateRolePackage(id: string): RolePackage {
    const role = this.readRolePackages().find((item) => item.id === id);
    if (!role) throw new Error('角色包不存在');
    this.save({ activeRoleId: role.id });
    return role;
  }

  readActiveRolePackage(): RolePackage {
    const settings = this.readSettings();
    return this.readRolePackages().find((item) => item.id === settings.activeRoleId) ?? DEFAULT_ROLE_PACKAGE;
  }

  createPersonalityRequestSnapshot(capturedAt = Date.now()): PersonalityRequestSnapshot {
    return createPersonalityRequestSnapshot(this.readActiveRolePackage(), capturedAt);
  }

  readCompanionState(roleId = this.readActiveRolePackage().id): CompanionState {
    const role = this.readRolePackages().find((item) => item.id === roleId) ?? this.readActiveRolePackage();
    const all = readJson<Record<string, unknown>>(this.companionStatePath, {});
    return sanitizeCompanionState(all[role.id] ?? createCompanionState(role.id), role.id, role.personality.relationshipStages.length);
  }

  saveCompanionState(state: CompanionState): CompanionState {
    const role = this.readRolePackages().find((item) => item.id === state.roleId) ?? this.readActiveRolePackage();
    const sanitized = sanitizeCompanionState(state, role.id, role.personality.relationshipStages.length);
    const all = readJson<Record<string, unknown>>(this.companionStatePath, {});
    mkdirSync(this.baseDir, { recursive: true });
    writeFileSync(this.companionStatePath, JSON.stringify({ ...all, [role.id]: sanitized }, null, 2), 'utf8');
    return sanitized;
  }

  deleteRolePackage(id: string): void {
    if (!id || isBuiltinRoleId(id)) return;
    const custom = this.readRolePackages().filter((item) => !isBuiltinRoleId(item.id) && item.id !== id);
    mkdirSync(this.baseDir, { recursive: true });
    writeFileSync(this.rolesPath, JSON.stringify(custom, null, 2), 'utf8');
  }

  save(
    settings: Partial<AppSettings>,
    apiKey?: string,
    clearApiKey = false,
    live2dAdapter?: Live2DAdapterConfig | null
  ): AppSettings {
    mkdirSync(this.baseDir, { recursive: true });
    const nextSettings = sanitizeAppSettings({ ...this.readSettings(), ...settings });
    writeFileSync(this.settingsPath, JSON.stringify(nextSettings, null, 2), 'utf8');

    if (live2dAdapter !== undefined) {
      writeFileSync(this.live2dAdapterPath, JSON.stringify(live2dAdapter, null, 2), 'utf8');
    }

    if (clearApiKey) {
      writeFileSync(this.secretsPath, JSON.stringify({ apiKey: '' }, null, 2), 'utf8');
    } else if (typeof apiKey === 'string' && apiKey.trim()) {
      writeFileSync(this.secretsPath, JSON.stringify({ apiKey: apiKey.trim() }, null, 2), 'utf8');
    }
    return nextSettings;
  }
}
