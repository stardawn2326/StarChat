import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { isAbsolute } from 'node:path';

function normalized(value: string): string {
  return value.replaceAll('\\', '/').replace(/\/+/gu, '/').replace(/\/$/u, '').toLocaleLowerCase();
}

export function gitRootForWorkspace(workspaceDirectory: string): string | null {
  if (!isAbsolute(workspaceDirectory) || !existsSync(workspaceDirectory)) throw new Error('授权工作区不存在');
  try {
    const workspaceRoot = realpathSync(workspaceDirectory);
    const gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: workspaceRoot,
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024
    }).trim();
    return gitRoot ? realpathSync(gitRoot) : null;
  } catch {
    return null;
  }
}

export function assertGitRootMatchesWorkspace(workspaceDirectory: string, gitRoot: string | null = gitRootForWorkspace(workspaceDirectory)): string | null {
  if (!gitRoot) return null;
  const workspaceRoot = realpathSync(workspaceDirectory);
  const canonicalGitRoot = realpathSync(gitRoot);
  if (normalized(workspaceRoot) !== normalized(canonicalGitRoot)) {
    throw new Error('Git 根目录必须与已授权工作区一致，请选择仓库根目录后再使用源代码管理');
  }
  return canonicalGitRoot;
}
