import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { basename, isAbsolute } from 'node:path';

export interface ProcessRunRequest {
  command: string;
  args: readonly string[];
  cwd: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxOutputBytes?: number;
  allowedCommands?: readonly string[];
}

export interface ProcessRunResult {
  code: number;
  output: string;
  timedOut: boolean;
  truncated: boolean;
}

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024;
const MAX_ARGUMENTS = 32;
const MAX_ARGUMENT_BYTES = 16 * 1024;

function abortError(): Error {
  const error = new Error('受控进程已取消');
  error.name = 'AbortError';
  return error;
}

function normalizeCommand(command: string): string {
  return basename(command).toLocaleLowerCase();
}

function validateRequest(request: ProcessRunRequest): void {
  if (!request || typeof request.command !== 'string' || !request.command.trim()) throw new Error('受控命令不能为空');
  if (!isAbsolute(request.cwd) || !existsSync(request.cwd) || !statSync(request.cwd).isDirectory()) throw new Error('受控进程工作目录无效');
  if (!Array.isArray(request.args) || request.args.length > MAX_ARGUMENTS) throw new Error('受控命令参数数量超出限制');
  const command = normalizeCommand(request.command);
  if (request.allowedCommands && !request.allowedCommands.map(normalizeCommand).includes(command)) throw new Error(`命令不在白名单：${command}`);
  for (const arg of request.args) {
    if (typeof arg !== 'string' || !arg || arg.length > MAX_ARGUMENT_BYTES || /[\0\r\n|&;<>()[\]{}]/u.test(arg)) throw new Error('命令参数包含不允许的内容');
  }
}

function stopProcess(child: ChildProcess): void {
  if (!child.pid) {
    child.kill();
    return;
  }
  if (process.platform === 'win32') {
    const killer = spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { shell: false, windowsHide: true, stdio: 'ignore' });
    killer.unref();
  }
  child.kill();
}

export function runControlledProcess(request: ProcessRunRequest): Promise<ProcessRunResult> {
  validateRequest(request);
  const timeoutMs = Math.max(1_000, Math.min(10 * 60_000, request.timeoutMs ?? DEFAULT_TIMEOUT_MS));
  const maxOutputBytes = Math.max(1_024, Math.min(512 * 1024, request.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES));
  if (request.signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const child = spawn(request.command, [...request.args], { cwd: request.cwd, shell: false, windowsHide: true });
    let output = '';
    let outputBytes = 0;
    let truncated = false;
    let timedOut = false;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const append = (chunk: Buffer): void => {
      if (outputBytes >= maxOutputBytes) {
        truncated = true;
        return;
      }
      const remaining = maxOutputBytes - outputBytes;
      const accepted = chunk.byteLength > remaining ? chunk.subarray(0, remaining) : chunk;
      output += accepted.toString('utf8');
      outputBytes += accepted.byteLength;
      if (accepted.byteLength < chunk.byteLength) truncated = true;
    };
    const cleanup = (): void => {
      if (timer) clearTimeout(timer);
      request.signal?.removeEventListener('abort', onAbort);
    };
    const finish = (result: ProcessRunResult): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };
    const onAbort = (): void => {
      if (settled) return;
      stopProcess(child);
      settled = true;
      cleanup();
      reject(abortError());
    };
    request.signal?.addEventListener('abort', onAbort, { once: true });
    child.stdout?.on('data', append);
    child.stderr?.on('data', append);
    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    });
    child.once('close', (code) => finish({ code: code ?? 1, output, timedOut, truncated }));
    timer = setTimeout(() => {
      if (settled) return;
      timedOut = true;
      stopProcess(child);
    }, timeoutMs);
  });
}
