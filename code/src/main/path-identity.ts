import { existsSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute } from 'node:path';

export interface PathIdentity {
  path: string;
  dev?: number;
  ino?: number;
}

function normalizedPath(value: string): string {
  const normalized = value
    .replaceAll('\\', '/')
    .replace(/\/+/gu, '/')
    .replace(/\/$/u, '');
  return process.platform === 'win32' ? normalized.toLocaleLowerCase() : normalized;
}

export function canonicalDirectory(input: string): PathIdentity {
  if (!isAbsolute(input) || !existsSync(input)) throw new Error('目录路径无效');
  const stats = statSync(input);
  if (!stats.isDirectory()) throw new Error('路径不是目录');
  const resolved = typeof realpathSync.native === 'function' ? realpathSync.native(input) : realpathSync(input);
  return {
    path: normalizedPath(resolved),
    ...(Number.isFinite(stats.dev) ? { dev: stats.dev } : {}),
    ...(Number.isFinite(stats.ino) ? { ino: stats.ino } : {})
  };
}

export function sameDirectory(left: string, right: string): boolean {
  const a = canonicalDirectory(left);
  const b = canonicalDirectory(right);
  if (a.path === b.path) return true;
  return a.dev !== undefined && a.ino !== undefined && a.dev === b.dev && a.ino === b.ino;
}
