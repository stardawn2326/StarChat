import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { BUILTIN_ROLE_PACKAGES, DEFAULT_ROLE_PACKAGE } from '../shared/default-role';
import { cloneRolePackage, createBlankRolePackage } from '../shared/role-package';
import { DEFAULT_APP_SETTINGS } from '../shared/settings';
import { createCompanionState } from '../shared/companion';
import { createMemorySecretStorage, SettingsStore } from './settings-store';

const testRoot = join(process.cwd(), '.settings-store-test-data');

beforeEach(() => {
  if (existsSync(testRoot)) rmSync(testRoot, { recursive: true, force: true });
  mkdirSync(testRoot, { recursive: true });
});

afterAll(() => {
  if (existsSync(testRoot)) rmSync(testRoot, { recursive: true, force: true });
});

describe('SettingsStore role persistence', () => {
  it('starts with StarChat and keeps Baoyin as a selectable built-in role', () => {
    const store = new SettingsStore(testRoot);
    expect(DEFAULT_ROLE_PACKAGE.id).toBe('starchat.default');
    expect(DEFAULT_APP_SETTINGS.activeRoleId).toBe('starchat.default');
    expect(BUILTIN_ROLE_PACKAGES.map((role) => role.id)).toEqual(['starchat.default', 'baoyin.default']);
    expect(store.readRolePackages().map((role) => role.id)).toEqual(['starchat.default', 'baoyin.default']);
  });

  it('preserves an existing Baoyin selection during the StarChat migration', () => {
    writeFileSync(join(testRoot, 'settings.json'), JSON.stringify({
      ...DEFAULT_APP_SETTINGS,
      activeRoleId: 'baoyin.default'
    }), 'utf8');
    const store = new SettingsStore(testRoot);
    expect(store.readSettings().activeRoleId).toBe('baoyin.default');
    expect(store.readActiveRolePackage().displayName).toBe('白音');
  });

  it('persists workbench normal bounds and native maximized state separately', () => {
    const store = new SettingsStore(testRoot);
    expect(store.readWorkbenchWindowState()).toEqual({ version: 1, bounds: null, maximized: false });

    store.saveWorkbenchWindowState({
      version: 1,
      bounds: { x: 120, y: 80, width: 1280, height: 900 },
      maximized: true
    });

    expect(new SettingsStore(testRoot).readWorkbenchWindowState()).toEqual({
      version: 1,
      bounds: { x: 120, y: 80, width: 1280, height: 900 },
      maximized: true
    });
    expect(existsSync(join(testRoot, 'workbench-window-state.json'))).toBe(true);
  });

  it('persists, activates and restores a custom role after reconstruction', () => {
    const store = new SettingsStore(testRoot);
    const custom = createBlankRolePackage('role.blank', '空白角色');
    store.saveRolePackage(custom);
    store.activateRolePackage(custom.id);
    const restored = new SettingsStore(testRoot);
    expect(restored.readActiveRolePackage().id).toBe(custom.id);
    expect(restored.createPersonalityRequestSnapshot(7).displayName).toBe('空白角色');
  });

  it('switches roles and protects the default role from deletion', () => {
    const store = new SettingsStore(testRoot);
    const copy = cloneRolePackage(DEFAULT_ROLE_PACKAGE, 'role.copy', '副本');
    store.saveRolePackage(copy);
    expect(store.activateRolePackage(copy.id).id).toBe('role.copy');
    store.deleteRolePackage(DEFAULT_ROLE_PACKAGE.id);
    expect(store.readRolePackages().some((role) => role.id === DEFAULT_ROLE_PACKAGE.id)).toBe(true);
    store.deleteRolePackage(copy.id);
    expect(store.readRolePackages().some((role) => role.id === copy.id)).toBe(false);
  });

  it('migrates only the legacy body default and preserves an intentional value', () => {
    writeFileSync(join(testRoot, 'settings.json'), JSON.stringify({ ...DEFAULT_APP_SETTINGS, cursorBodyWeight: 0.08 }), 'utf8');
    const migrated = new SettingsStore(testRoot).readSettings();
    expect(migrated.cursorBodyWeight).toBeGreaterThan(0.08);

    writeFileSync(join(testRoot, 'settings.json'), JSON.stringify({
      ...DEFAULT_APP_SETTINGS,
      cursorBodyWeight: 0.32,
      presentation: { bodyFollowStrength: 0.45, bodyLag: 0.22, inertiaStrength: 0.18, idleSwayStrength: 0.035, physicsEnabled: true }
    }), 'utf8');
    const upgraded = new SettingsStore(testRoot).readSettings();
    expect(upgraded.cursorBodyWeight).toBe(DEFAULT_APP_SETTINGS.cursorBodyWeight);
    expect(upgraded.presentation.bodyFollowStrength).toBe(DEFAULT_APP_SETTINGS.presentation.bodyFollowStrength);

    writeFileSync(join(testRoot, 'settings.json'), JSON.stringify({ ...DEFAULT_APP_SETTINGS, cursorBodyWeight: 0.17 }), 'utf8');
    const preserved = new SettingsStore(testRoot).readSettings();
    expect(preserved.cursorBodyWeight).toBe(0.17);
  });

  it('migrates legacy interaction flags to one canonical persisted policy', () => {
    writeFileSync(join(testRoot, 'settings.json'), JSON.stringify({
      ...DEFAULT_APP_SETTINGS,
      petLocked: false,
      petInteractionMode: false
    }), 'utf8');

    const restored = new SettingsStore(testRoot).readSettings();
    expect(restored).toMatchObject({ petLocked: false, petInteractionMode: true });
    const persisted = JSON.parse(readFileSync(join(testRoot, 'settings.json'), 'utf8')) as typeof restored;
    expect(persisted).toMatchObject({ petLocked: false, petInteractionMode: true });
  });

  it('persists the theme preference and migrates missing or invalid values to follow-system', () => {
    const store = new SettingsStore(testRoot);
    expect(store.readSettings().themePreference).toBe('system');
    expect(store.save({ themePreference: 'light' }).themePreference).toBe('light');
    expect(new SettingsStore(testRoot).readSettings().themePreference).toBe('light');

    writeFileSync(join(testRoot, 'settings.json'), JSON.stringify({ ...DEFAULT_APP_SETTINGS, themePreference: 'invalid' }), 'utf8');
    expect(new SettingsStore(testRoot).readSettings().themePreference).toBe('system');
  });

  it('persists relationship and memory state separately for each role', () => {
    const store = new SettingsStore(testRoot);
    const state = createCompanionState(DEFAULT_ROLE_PACKAGE.id, 1);
    state.interactionCount = 3;
    state.affinity = 8;
    state.memories = [{ id: 'm1', content: '用户喜欢紫色', createdAt: 2 }];
    store.saveCompanionState(state);
    const restored = new SettingsStore(testRoot).readCompanionState(DEFAULT_ROLE_PACKAGE.id);
    expect(restored.interactionCount).toBe(3);
    expect(restored.memories[0]?.content).toBe('用户喜欢紫色');
  });

  it('stores API keys through the system-secret adapter without plaintext persistence', () => {
    const secretStorage = createMemorySecretStorage();
    const store = new SettingsStore(testRoot, secretStorage);
    store.save({}, 'secret-value');

    const persisted = JSON.parse(readFileSync(join(testRoot, 'secrets.json'), 'utf8')) as Record<string, unknown>;
    expect(persisted.apiKey).toBeUndefined();
    expect(typeof persisted.apiKeyCiphertext).toBe('string');
    expect(new SettingsStore(testRoot, secretStorage).readSecrets()).toEqual({ apiKey: 'secret-value' });
  });

  it('migrates a legacy plaintext API key when encrypted storage is available', () => {
    writeFileSync(join(testRoot, 'secrets.json'), JSON.stringify({ version: 1, apiKey: 'legacy-value' }), 'utf8');
    const secretStorage = createMemorySecretStorage();

    expect(new SettingsStore(testRoot, secretStorage).readSecrets()).toEqual({ apiKey: 'legacy-value' });
    const persisted = JSON.parse(readFileSync(join(testRoot, 'secrets.json'), 'utf8')) as Record<string, unknown>;
    expect(persisted.apiKey).toBeUndefined();
    expect(typeof persisted.apiKeyCiphertext).toBe('string');
  });
});
