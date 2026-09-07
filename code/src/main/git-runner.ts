import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { runControlledProcess, type ProcessRunResult } from './process-runner';
import { canonicalDirectory, sameDirectory } from './path-identity';

const MAX_OUTPUT_BYTES = 128 * 1024;
const READ_ONLY_TIMEOUT_MS = 30_000;
const COMMIT_TIMEOUT_MS = 120_000;
const UNSAFE_ARGUMENT = /[\0\r\n|&;<>()[\]{}]/u;

let cachedGitExecutable: string | null = null;

function validateRoot(root: string): string {
  return canonicalDirectory(root).path;
}

function safeArgument(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 16 * 1024 && !UNSAFE_ARGUMENT.test(value);
}

function safeRelativePath(value: string): boolean {
  return !isAbsolute(value) && !value.split(/[\\/]/u).some((part) => part === '..');
}

function isAllowedReadOnlyArgs(args: readonly string[]): boolean {
  if (!Array.isArray(args) || args.length === 0 || args.some((arg) => !safeArgument(arg))) return false;
  const exact = [
    ['rev-parse', '--show-toplevel'],
    ['rev-parse', '--short', 'HEAD'],
    ['status', '--short'],
    ['status', '--short', '--untracked-files=all'],
    ['symbolic-ref', '--quiet', '--short', 'HEAD'],
    ['diff', '--stat'],
    ['diff', '--name-only'],
    ['diff', '--stat', '--name-only'],
    ['diff', '--cached', '--name-only']
  ];
  if (exact.some((candidate) => candidate.length === args.length && candidate.every((value, index) => value === args[index]))) return true;
  return args.length === 4
    && args[0] === 'diff'
    && args[1] === '--no-ext-diff'
    && args[2] === '--'
    && safeRelativePath(args[3]);
}

export function resolveGitExecutable(): string {
  if (cachedGitExecutable) return cachedGitExecutable;
  const configured = process.env.STARCHAT_GIT_EXECUTABLE?.trim();
  if (configured) {
    if (!isAbsolute(configured) || !existsSync(configured) || !statSync(configured).isFile()) throw new Error('STARCHAT_GIT_EXECUTABLE 必须是存在的 Git 文件');
    cachedGitExecutable = realpathSync.native(configured);
    return cachedGitExecutable;
  }
  const locator = process.platform === 'win32' ? 'where.exe' : 'which';
  let located = '';
  try {
    located = execFileSync(locator, ['git'], {
      encoding: 'utf8',
      windowsHide: true,
      shell: false,
      stdio: ['ignore', 'pipe', 'ignore']
    }).split(/\r?\n/u).map((line) => line.trim()).find(Boolean) ?? '';
  } catch {
    located = '';
  }
  if (!located || !isAbsolute(located) || !existsSync(located) || !statSync(located).isFile()) throw new Error('未找到可用的 Git 可执行文件');
  cachedGitExecutable = realpathSync.native(located);
  return cachedGitExecutable;
}

export function resetGitExecutableCacheForTests(): void {
  cachedGitExecutable = null;
}

export interface GitRunResult extends Pick<ProcessRunResult, 'code' | 'output' | 'timedOut' | 'truncated'> {}

export class GitRunner {
  readOnlySync(workspaceRoot: string, args: readonly string[]): string | null {
    const root = validateRoot(workspaceRoot);
    if (!isAllowedReadOnlyArgs(args)) throw new Error('Git 工具参数不在只读白名单');
    try {
      return execFileSync(resolveGitExecutable(), [...args], {
        cwd: root,
        encoding: 'utf8',
        windowsHide: true,
        shell: false,
        timeout: READ_ONLY_TIMEOUT_MS,
        stdio: ['ignore', 'pipe', 'ignore'],
        maxBuffer: MAX_OUTPUT_BYTES
      }).trim();
    } catch {
      return null;
    }
  }

  readOnly(workspaceRoot: string, args: readonly string[], signal: AbortSignal): Promise<GitRunResult> {
    const root = validateRoot(workspaceRoot);
    if (!isAllowedReadOnlyArgs(args)) throw new Error('Git 工具参数不在只读白名单');
    return runControlledProcess({
      command: resolveGitExecutable(),
      args,
      cwd: root,
      signal,
      timeoutMs: READ_ONLY_TIMEOUT_MS,
      maxOutputBytes: MAX_OUTPUT_BYTES,
      allowedCommands: [resolveGitExecutable()]
    });
  }

  commit(workspaceRoot: string, message: string, signal: AbortSignal): Promise<GitRunResult> {
    const root = validateRoot(workspaceRoot);
    if (typeof message !== 'string' || !message.trim() || message.length > 120 || /[\r\n]/u.test(message)) {
      throw new Error('提交说明必须为 1–120 个字符的单行文本');
    }
    const gitRoot = this.readOnlySync(root, ['rev-parse', '--show-toplevel']);
    if (!gitRoot || !sameDirectory(gitRoot, root)) throw new Error('Git 根目录必须与已授权工作区一致');
    return runControlledProcess({
      command: resolveGitExecutable(),
      args: ['commit', '-m', message.trim()],
      cwd: root,
      signal,
      timeoutMs: COMMIT_TIMEOUT_MS,
      maxOutputBytes: MAX_OUTPUT_BYTES,
      allowedCommands: [resolveGitExecutable()]
    });
  }
}

export const gitRunner = new GitRunner();

export function runGitReadOnlySync(workspaceRoot: string, args: readonly string[]): string | null {
  return gitRunner.readOnlySync(workspaceRoot, args);
}

export function runGitReadOnly(workspaceRoot: string, args: readonly string[], signal: AbortSignal): Promise<GitRunResult> {
  return gitRunner.readOnly(workspaceRoot, args, signal);
}

export function runGitCommit(workspaceRoot: string, message: string, signal: AbortSignal): Promise<GitRunResult> {
  return gitRunner.commit(workspaceRoot, message, signal);
}
