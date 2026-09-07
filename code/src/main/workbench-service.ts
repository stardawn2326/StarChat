import { existsSync, realpathSync, statSync } from 'node:fs';
import { extname, isAbsolute, posix, relative, sep } from 'node:path';
import type { WorkbenchCommandResult, WorkbenchDiffPreview, WorkbenchEnvironment, WorkbenchFilePreview, WorkbenchGitCommitResult, WorkbenchInspection, WorkbenchInspectionKind, WorkbenchResourceEntry, WorkbenchShareResult, WorkbenchSourceSnapshot } from '../shared/workbench';
import { WorkspaceGuard } from './agent-security';
import { assertGitRootMatchesWorkspace } from './git-boundary';
import { runGitCommit, runGitReadOnly, runGitReadOnlySync, resolveGitExecutable } from './git-runner';
import { verificationCommand } from './project-detector';
import { runControlledProcess } from './process-runner';

const SENSITIVE_PATH = /(^|[\\/])(?:\.env(?:\.|$)|[^\\/]*(?:secret|api[-_]?key|credential|\.pem$|\.key$)|id_rsa|\.ssh(?:[\\/]|$)|\.aws(?:[\\/]|$))/iu;
const MAX_PROCESS_OUTPUT = 64 * 1024;

type WorkbenchExecutor = (command: string, args: string[], cwd: string, signal: AbortSignal) => Promise<{ code: number; output: string }>;

function spawnWorkbenchProcess(command: string, args: string[], cwd: string, signal: AbortSignal): Promise<{ code: number; output: string }> {
  return runControlledProcess({ command, args, cwd, signal, timeoutMs: command.toLocaleLowerCase().includes('pnpm') ? 5 * 60_000 : 30_000, maxOutputBytes: MAX_PROCESS_OUTPUT, allowedCommands: [command] }).then((result) => ({ code: result.code, output: result.output }));
}

const WORKBENCH_COMMANDS: Readonly<Record<string, { command: string; args: string[] }>> = {
  'git status --short': { command: 'git', args: ['status', '--short'] },
  'git diff --stat': { command: 'git', args: ['diff', '--stat'] },
  'git diff --name-only': { command: 'git', args: ['diff', '--name-only'] },
  'pnpm run test': { command: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', args: ['run', 'test'] },
  'pnpm run typecheck': { command: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', args: ['run', 'typecheck'] },
  'pnpm run build': { command: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', args: ['run', 'build'] },
  'pnpm run verify:live2d': { command: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', args: ['run', 'verify:live2d'] }
};

export async function runWorkbenchCommand(rootDirectory: string, input: string, signal: AbortSignal, executor: WorkbenchExecutor = spawnWorkbenchProcess): Promise<WorkbenchCommandResult> {
  const commandText = input.trim().replace(/\s+/gu, ' ');
  const staticDefinition = WORKBENCH_COMMANDS[commandText];
  if (!staticDefinition) throw new Error('命令不在受控白名单；可运行 Git 只读命令或项目验证脚本');
  const workspaceRoot = realpathSync(rootDirectory);
  const isGit = commandText.startsWith('git ');
  if (isGit) assertGitRootMatchesWorkspace(workspaceRoot);
  const definition = commandText.startsWith('pnpm run ')
    ? verificationCommand(workspaceRoot, commandText.slice('pnpm run '.length))
    : { command: staticDefinition.command, args: staticDefinition.args, cwd: workspaceRoot };
  const result = isGit && executor === spawnWorkbenchProcess
    ? await runGitReadOnly(definition.cwd, definition.args, signal)
    : await executor(definition.command, definition.args, definition.cwd, signal);
  if (isGit && result.code !== 0) {
    return { command: commandText, ok: false, code: result.code, output: result.output.slice(0, MAX_PROCESS_OUTPUT) };
  }
  return { command: commandText, ok: result.code === 0, code: result.code, output: result.output.slice(0, MAX_PROCESS_OUTPUT) };
}

export function normalizeWorkbenchUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('请输入网页地址');
  const candidate = /^[a-z][a-z\d+.-]*:/iu.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(candidate);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('浏览器仅允许 http 或 https 地址');
  return url.toString();
}

export async function commitWorkbenchStaged(rootDirectory: string, messageInput: string, signal: AbortSignal, executor: WorkbenchExecutor = spawnWorkbenchProcess): Promise<WorkbenchGitCommitResult> {
  const message = messageInput.trim();
  if (!message || message.length > 120 || /[\r\n]/u.test(message)) throw new Error('提交说明必须为 1–120 个字符的单行文本');
  const { environment } = environmentFor(rootDirectory);
  if (!environment.gitRoot) throw new Error('当前工作区不是 Git 仓库');
  const staged = runGitReadOnlySync(environment.gitRoot, ['diff', '--cached', '--name-only']);
  if (!staged) throw new Error('没有已暂存的变更；StarChat 不会自动暂存文件');
  const result = executor === spawnWorkbenchProcess
    ? await runGitCommit(environment.gitRoot, message, signal)
    : await executor(resolveGitExecutable(), ['commit', '-m', message], environment.gitRoot, signal);
  return { ok: result.code === 0, message, output: result.output.slice(0, MAX_PROCESS_OUTPUT) };
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
  const gitRoot = assertGitRootMatchesWorkspace(workspaceRoot, runGitReadOnlySync(workspaceRoot, ['rev-parse', '--show-toplevel']));
  const statusText = gitRoot ? runGitReadOnlySync(workspaceRoot, ['status', '--short', '--untracked-files=all']) : null;
  const branch = gitRoot ? runGitReadOnlySync(workspaceRoot, ['symbolic-ref', '--quiet', '--short', 'HEAD']) : null;
  const head = gitRoot ? runGitReadOnlySync(workspaceRoot, ['rev-parse', '--short', 'HEAD']) : null;
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
    diffStat: gitRoot ? (runGitReadOnlySync(workspaceRoot, ['diff', '--stat']) ?? '') : ''
  };
  return { environment, source };
}

function normalizedRelativePath(value: string): string {
  return value.trim().replaceAll('\\', '/').replace(/^\.\//u, '').replace(/\/$/u, '');
}

function listResources(root: string, path = ''): WorkbenchResourceEntry[] {
  const guard = new WorkspaceGuard(root);
  return guard.listDirectory(path || '.').map((entry) => ({ path: entry.path, kind: entry.kind }));
}

export function inspectWorkbench(rootDirectory: string, kind: WorkbenchInspectionKind, requestedPath = ''): WorkbenchInspection {
  const { environment, source } = environmentFor(rootDirectory);
  if (kind === 'resources') {
    const resourcePath = normalizedRelativePath(requestedPath);
    return {
      kind,
      environment,
      resourcePath,
      resourceParentPath: resourcePath ? (posix.dirname(resourcePath) === '.' ? '' : posix.dirname(resourcePath)) : null,
      resources: listResources(environment.workspaceRoot, resourcePath)
    };
  }
  return { kind, environment, source };
}

function languageFor(path: string): string {
  const extension = extname(path).slice(1).toLocaleLowerCase();
  return extension || 'text';
}

export function previewWorkbenchFile(rootDirectory: string, requestedPath: string): WorkbenchFilePreview {
  const guard = new WorkspaceGuard(rootDirectory);
  const path = normalizedRelativePath(requestedPath);
  const target = guard.resolve(path);
  const content = guard.readText(path);
  return {
    path,
    content,
    language: languageFor(path),
    lineCount: content.split('\n').length,
    sizeBytes: statSync(target).size,
    truncated: false
  };
}

export function readWorkbenchDiff(rootDirectory: string, requestedPath: string): WorkbenchDiffPreview {
  const guard = new WorkspaceGuard(rootDirectory);
  const path = normalizedRelativePath(requestedPath);
  const target = guard.resolve(path);
  const { environment } = environmentFor(rootDirectory);
  if (!environment.gitRoot) throw new Error('当前工作区不是 Git 仓库');
  // The guard root and target share the same realpath basis. Git can report a
  // different Windows spelling (drive casing, slash style, or runner alias),
  // so deriving the relative path from environment.gitRoot is not stable.
  const gitPath = relative(guard.root, target).replaceAll(sep, '/');
  if (!gitPath || gitPath === '..' || gitPath.startsWith('../') || isAbsolute(gitPath)) throw new Error('文件不在当前 Git 工作树内');
  const raw = runGitReadOnlySync(environment.gitRoot, ['diff', '--no-ext-diff', '--', gitPath]);
  if (raw === null) throw new Error('读取 Git 差异失败');
  const maximum = 128 * 1024;
  return { path, patch: raw.slice(0, maximum), truncated: raw.length > maximum };
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
