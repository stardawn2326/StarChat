import { describe, expect, it } from 'vitest';
import { DEFAULT_ROLE_PACKAGE } from './default-role';
import { cloneRolePackage, createBlankRolePackage, importRolePackage, serializeRolePackage, validateRolePackage } from './role-package';
import { createPersonalityRequestSnapshot } from './personality-contract';

describe('role package protocol', () => {
  it('loads the default Baoyin package with semantic presentation names', () => {
    expect(DEFAULT_ROLE_PACKAGE.id).toBe('baoyin.default');
    expect(DEFAULT_ROLE_PACKAGE.presentation.expressions).toContain('caring_smile');
    expect(DEFAULT_ROLE_PACKAGE.presentation.actions).toContain('shake_head');
    expect(DEFAULT_ROLE_PACKAGE.presentation.expressions).toHaveLength(12);
    expect(DEFAULT_ROLE_PACKAGE.presentation.actions).toHaveLength(8);
    expect(DEFAULT_ROLE_PACKAGE.presentation.expressions).toContain('bright_smile');
    expect(DEFAULT_ROLE_PACKAGE.presentation.actions).toContain('thinking');
    expect(DEFAULT_ROLE_PACKAGE.visual.modelAsset).toBeNull();
  });

  it('rejects semantic names outside the allow-list', () => {
    const invalid = structuredClone(DEFAULT_ROLE_PACKAGE) as unknown as Record<string, unknown>;
    const presentation = invalid.presentation as { expressions: string[] };
    presentation.expressions = ['set_arbitrary_cubism_parameter'];
    expect(() => validateRolePackage(invalid)).toThrow('未允许的语义名称');
  });

  it('creates a blank role with an independent id and all 14 scales', () => {
    const role = createBlankRolePackage('role.blank', '空白角色');
    expect(role.id).toBe('role.blank');
    expect(Object.keys(role.personality.scales)).toHaveLength(14);
    expect(role.visual.modelAsset).toBeNull();
  });

  it('copies and round-trips a role without secrets', () => {
    const copy = cloneRolePackage(DEFAULT_ROLE_PACKAGE, 'role.copy', '白音副本');
    const imported = importRolePackage(serializeRolePackage(copy));
    expect(imported.id).toBe('role.copy');
    expect(imported.personality.scales).toEqual(DEFAULT_ROLE_PACKAGE.personality.scales);
    expect(serializeRolePackage(imported)).not.toContain('apiKey');
  });

  it('captures an immutable request snapshot from the current role only', () => {
    const snapshot = createPersonalityRequestSnapshot(DEFAULT_ROLE_PACKAGE, 42);
    expect(snapshot.capturedAt).toBe(42);
    expect(snapshot.roleId).toBe('baoyin.default');
    expect(snapshot).not.toHaveProperty('apiKey');
    expect(Object.isFrozen(snapshot)).toBe(true);
  });
});
