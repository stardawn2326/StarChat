import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const MANAGED_PORT = '50000';
const START_TIMEOUT_MS = 90_000;
const READY_POLL_MS = 500;

export interface CosyVoiceInstallPaths {
  projectRoot: string;
  pythonPath: string;
  launcherPath: string;
}

let managedProcess: ChildProcess | null = null;
let startupPromise: Promise<void> | null = null;
let managedMode: 'sft' | 'zero-shot' | null = null;

export function cosyVoiceLauncherArgs(launcherPath: string, mode: 'sft' | 'zero-shot'): string[] {
  return [launcherPath, '--voice-mode', mode];
}

export function cosyVoiceInstallPathsForRoot(projectRoot: string): CosyVoiceInstallPaths {
  return {
    projectRoot,
    pythonPath: resolve(projectRoot, 'tools', 'cosyvoice-python310', 'python.exe'),
    launcherPath: resolve(projectRoot, 'tools', 'start-cosyvoice-server.py')
  };
}

export function isManagedCosyVoiceBaseUrl(baseUrl: string): boolean {
  try {
    const endpoint = new URL(baseUrl);
    return endpoint.protocol === 'http:'
      && (endpoint.hostname === '127.0.0.1' || endpoint.hostname === 'localhost')
      && endpoint.port === MANAGED_PORT;
  } catch {
    return false;
  }
}

function findInstall(projectRoots: readonly string[]): CosyVoiceInstallPaths | null {
  for (const projectRoot of [...new Set(projectRoots.filter(Boolean))]) {
    const install = cosyVoiceInstallPathsForRoot(projectRoot);
    if (existsSync(install.pythonPath) && existsSync(install.launcherPath)) return install;
  }
  return null;
}

async function isReady(baseUrl: string): Promise<boolean> {
  try {
    const endpoint = new URL('/docs', `${baseUrl.replace(/\/+$/, '')}/`);
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(1_500) });
    return response.ok;
  } catch {
    return false;
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

export async function ensureCosyVoiceService(
  baseUrl: string,
  projectRoots: readonly string[],
  mode: 'sft' | 'zero-shot' = 'sft'
): Promise<void> {
  if (!isManagedCosyVoiceBaseUrl(baseUrl)) return;
  if (managedProcess && managedMode !== mode) {
    managedProcess.kill(); managedProcess = null; managedMode = null;
    for (let index = 0; index < 20 && await isReady(baseUrl); index += 1) await delay(100);
  }
  if (await isReady(baseUrl)) return;
  if (startupPromise) return startupPromise;

  startupPromise = (async () => {
    const install = findInstall(projectRoots);
    if (!install) {
      throw new Error('未找到项目内 CosyVoice 安装；请确认 tools/cosyvoice-python310 与 tools/start-cosyvoice-server.py 存在');
    }

    let spawnError: Error | null = null;
    const child = spawn(install.pythonPath, cosyVoiceLauncherArgs(install.launcherPath, mode), {
      cwd: install.projectRoot,
      windowsHide: true,
      stdio: 'ignore'
    });
    managedProcess = child;
    managedMode = mode;
    child.once('error', (error) => { spawnError = error; });

    const deadline = Date.now() + START_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) throw new Error(`CosyVoice 服务提前退出，代码 ${child.exitCode}`);
      if (await isReady(baseUrl)) return;
      await delay(READY_POLL_MS);
    }
    child.kill();
    managedProcess = null;
    throw new Error('CosyVoice 服务启动超时');
  })().finally(() => {
    startupPromise = null;
  });

  return startupPromise;
}

export function stopManagedCosyVoiceService(): void {
  if (managedProcess && managedProcess.exitCode === null) managedProcess.kill();
  managedProcess = null;
  managedMode = null;
}
