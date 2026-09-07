import rawStarChatRolePackage from '../roles/starchat.role.json';
import rawBaoyinRolePackage from '../roles/baoyin.role.json';
import { validateRolePackage } from './role-package';

export const DEFAULT_ROLE_PACKAGE = validateRolePackage(rawStarChatRolePackage);
export const BUILTIN_ROLE_PACKAGES = Object.freeze([
  DEFAULT_ROLE_PACKAGE,
  validateRolePackage(rawBaoyinRolePackage)
]);
export const BUILTIN_ROLE_IDS = Object.freeze(BUILTIN_ROLE_PACKAGES.map((role) => role.id));

export function isBuiltinRoleId(id: string): boolean {
  return BUILTIN_ROLE_IDS.includes(id);
}
