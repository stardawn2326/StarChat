import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import type { WorkbenchEnvironment, WorkbenchInspection, WorkbenchInspectionKind, WorkbenchResourceEntry, WorkbenchShareResult, WorkbenchSourceSnapshot } from '../shared/workbench';
import { WorkspaceGuard } from './agent-security';

const SENSITIVE_PATH = /(^|[\\/])(?:\.env(?:\.|$)|[^\\/]*(?:secret|api[-_]?key|credential|\.pem$|\.key$)|id_rsa|\.ssh(?:[\\/]|$)|\.aws(?:[\\/]|$))/iu;

function runGit(root: string, args: string[]): string | null {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch {
    return null;
  }
}

function safeChangedFiles(status: string | null): string[] {
  if (!status) return [];
  return status.split(/\r?\n/u)
    .map((line) => line.slice(3).trim())
    .filter((path) => path && !SENSITIVE_PATH.test(path))
    .map((path) => path.includes(' -> ') ? path.split(' -> ').at(-1)! : path)
    .slice(0, 100);
}

function environmentFor(rootDirectory: string): { environment: WorkbenchEnvironment; source: WorkbenchSourceSnapshot } {
  if (!isAbsolute(rootDirectory) || !existsSync(rootDirectory)) throw new Error('授权工作区不存在');
  const workspaceRoot = realpathSync(rootDirectory);
  const gitRoot = runGit(workspaceRoot, ['rev-parse', '--show-toplevel']);
  const statusText = gitRoot ? runGit(workspaceRoot, ['status', '--short', '--untracked-files=all']) : null;
  const branch = gitRoot ? runGit(workspaceRoot, ['symbolic-ref', '--quiet', '--short', 'HEAD']) : null;
  const head = gitRoot ? runGit(workspaceRoot, ['rev-parse', '--short', 'HEAD']) : null;
  const changedFiles = safeChangedFiles(statusText);
  const gitStatus: WorkbenchEnvironment['gitStatus'] = !gitRoot
    ? 'unavailable'
    : branch ? (changedFiles.length > 0 ? 'changed' : 'clean') : 'detached';
  const environment: WorkbenchEnvironment = { workspaceRoot, gitRoot, branch, head, gitStatus, changedFiles: changedFiles.length };
  const source: WorkbenchSourceSnapshot = {
    status: gitStatus,
    branch,
    head,
    changedFiles,
    diffStat: gitRoot ? (runGit(workspaceRoot, ['diff', '--stat']) ?? '') : ''
  };
  return { environment, source };
}

function listResources(root: string): WorkbenchResourceEntry[] {
  const guard = new WorkspaceGuard(root);
  return guard.listDirectory('.').map((entry) => ({ path: entry.path, kind: entry.kind }));
}

export function inspectWorkbench(rootDirectory: string, kind: WorkbenchInspectionKind): WorkbenchInspection {
  const { environment, source } = environmentFor(rootDirectory);
  if (kind === 'resources') return { kind, environment, resources: listResources(environment.workspaceRoot) };
  return { kind, environment, source };
}

export function formatWorkbenchShare(inspection: WorkbenchInspection): WorkbenchShareResult {
  const { environment } = inspection;
  const lines = [
    'StarChat 工作台环境',
    `工作区：${environment.workspaceRoot}`,
    `Git：${environment.gitRoot ?? '不可用'}`,
    `分支：${environment.branch ?? (environment.head ? `分离 HEAD @ ${environment.head}` : '未识别')}`,
    `状态：${environment.gitStatus}`,
    `变更文件：${environment.changedFiles}`
  ];
  return { ok: true, text: lines.join('\n') };
}
