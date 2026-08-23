import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_ROLE_PACKAGE } from '../shared/default-role';
import { cloneRolePackage, createBlankRolePackage } from '../shared/role-package';
import { DEFAULT_APP_SETTINGS } from '../shared/settings';
import { createCompanionState } from '../shared/companion';
import { SettingsStore } from './settings-store';

const testRoot = join(process.cwd(), '.settings-store-test-data');

beforeEach(() => {
  if (existsSync(testRoot)) rmSync(testRoot, { recursive: true, force: true });
  mkdirSync(testRoot, { recursive: true });
});

afterAll(() => {
  if (existsSync(testRoot)) rmSync(testRoot, { recursive: true, force: true });
});

describe('SettingsStore role persistence', () => {
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

    writeFileSync(join(testRoot, 'settings.json'), JSON.stringify({ ...DEFAULT_APP_SETTINGS, cursorBodyWeight: 0.17 }), 'utf8');
    const preserved = new SettingsStore(testRoot).readSettings();
    expect(preserved.cursorBodyWeight).toBe(0.17);
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
});
