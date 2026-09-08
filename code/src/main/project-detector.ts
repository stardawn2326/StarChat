import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join } from 'node:path';

export type ProjectType = 'electron' | 'node' | 'web' | 'unknown';
export type PackageManager = 'pnpm' | 'npm' | 'yarn' | 'bun' | 'unknown';

export interface DetectedProject {
  workspaceRoot: string;
  projectRoot: string;
  type: ProjectType;
  packageManager: PackageManager;
  scripts: Readonly<Record<string, string>>;
}

export interface ProjectCommand {
  command: string;
  args: string[];
  cwd: string;
}

const VERIFICATION_SCRIPTS = new Set(['test', 'typecheck', 'build', 'verify:live2d']);

function packageData(root: string): { scripts: Record<string, string>; packageManager?: PackageManager; type: ProjectType } | null {
  const path = join(root, 'package.json');
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as {
      scripts?: Record<string, unknown>;
      packageManager?: unknown;
      dependencies?: Record<string, unknown>;
      devDependencies?: Record<string, unknown>;
    };
    const scripts = Object.fromEntries(Object.entries(parsed.scripts ?? {}).filter(([, value]) => typeof value === 'string')) as Record<string, string>;
    const packageManager = typeof parsed.packageManager === 'string'
      ? parsed.packageManager.split('@', 1)[0] as PackageManager
      : undefined;
    const dependencies = { ...parsed.dependencies, ...parsed.devDependencies };
    const type: ProjectType = dependencies.electron || scripts.dev?.includes('electron') || scripts.build?.includes('electron')
      ? 'electron'
      : dependencies.react || dependencies.vue || dependencies.svelte
        ? 'web'
        : 'node';
    return { scripts, packageManager: ['pnpm', 'npm', 'yarn', 'bun'].includes(packageManager ?? '') ? packageManager : undefined, type };
  } catch {
    return null;
  }
}

function packageManagerFor(root: string, packageManager: PackageManager | undefined): PackageManager {
  if (packageManager) return packageManager;
  if (existsSync(join(root, 'pnpm-workspace.yaml'))) return 'pnpm';
  if (existsSync(join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(root, 'yarn.lock'))) return 'yarn';
  if (existsSync(join(root, 'bun.lockb')) || existsSync(join(root, 'bun.lock'))) return 'bun';
  if (existsSync(join(root, 'package-lock.json'))) return 'npm';
  return 'unknown';
}

function candidateRoots(workspaceRoot: string): string[] {
  const children = readdirSync(workspaceRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && !entry.name.startsWith('.') && entry.name !== 'node_modules')
    .map((entry) => join(workspaceRoot, entry.name));
  return [workspaceRoot, ...children];
}

export function detectProject(workspaceDirectory: string): DetectedProject {
  if (!existsSync(workspaceDirectory) || !statSync(workspaceDirectory).isDirectory()) throw new Error('项目工作区不存在');
  const workspaceRoot = realpathSync(workspaceDirectory);
  const projectRoot = candidateRoots(workspaceRoot).map((root) => {
    try { return realpathSync(root); } catch { return root; }
  }).find((root) => Boolean(packageData(root))) ?? workspaceRoot;
  const data = packageData(projectRoot);
  return {
    workspaceRoot,
    projectRoot,
    type: data?.type ?? 'unknown',
    packageManager: packageManagerFor(projectRoot, data?.packageManager),
    scripts: data?.scripts ?? {}
  };
}

export function verificationCommand(workspaceDirectory: string, script: string): ProjectCommand {
  if (!VERIFICATION_SCRIPTS.has(script)) throw new Error(`不允许运行脚本：${script}`);
  const project = detectProject(workspaceDirectory);
  if (typeof project.scripts[script] !== 'string') throw new Error(`项目未定义验证脚本：${script}`);
  const manager = project.packageManager === 'unknown' ? 'pnpm' : project.packageManager;
  const command = process.platform === 'win32' ? `${manager}.cmd` : manager;
  return { command, args: ['run', script], cwd: project.projectRoot };
}

export function isVerificationScript(script: string): boolean {
  return VERIFICATION_SCRIPTS.has(script);
}
