import rawRolePackage from '../roles/baoyin.role.json';
import { validateRolePackage } from './role-package';

export const DEFAULT_ROLE_PACKAGE = validateRolePackage(rawRolePackage);
