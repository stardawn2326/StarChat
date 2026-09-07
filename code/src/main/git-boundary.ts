import { runGitReadOnlySync } from './git-runner';
import { canonicalDirectory, sameDirectory } from './path-identity';

export function gitRootForWorkspace(workspaceDirectory: string): string | null {
  const workspaceRoot = canonicalDirectory(workspaceDirectory).path;
  try {
    const gitRoot = runGitReadOnlySync(workspaceRoot, ['rev-parse', '--show-toplevel']);
    return gitRoot ? canonicalDirectory(gitRoot).path : null;
  } catch {
    return null;
  }
}

export function assertGitRootMatchesWorkspace(workspaceDirectory: string, gitRoot: string | null = gitRootForWorkspace(workspaceDirectory)): string | null {
  if (!gitRoot) return null;
  const canonicalGitRoot = canonicalDirectory(gitRoot);
  if (!sameDirectory(workspaceDirectory, gitRoot)) {
    throw new Error('Git 根目录必须与已授权工作区一致，请选择仓库根目录后再使用源代码管理');
  }
  return canonicalGitRoot.path;
}
