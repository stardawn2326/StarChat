import { basename, dirname, extname, relative, sep } from 'node:path';
import type { RepoMap, RepoMapEntry, RepoMapEntryKind, RepoMapLimits } from '../shared/repo-map';
import type { TaskRepoSummary } from '../shared/task-context';
import { detectProject, type DetectedProject } from './project-detector';
import { isSensitiveWorkspacePath, WorkspaceGuard } from './agent-security';

const DEFAULT_LIMITS: RepoMapLimits = { maxDepth: 8, maxEntries: 5000, timeoutMs: 3000 };
const IMPORTANT_LIMIT = 200;
const SOURCE_DIRECTORY_NAMES = new Set(['src', 'lib', 'source', 'packages']);
const TEST_DIRECTORY_NAMES = new Set(['test', 'tests', '__tests__', 'spec', 'specs']);
const LANGUAGE_EXTENSIONS = new Set([
  'c', 'cc', 'cpp', 'cs', 'css', 'go', 'h', 'hpp', 'html', 'java', 'js', 'jsx', 'json', 'kt', 'md', 'php',
  'py', 'rs', 'scss', 'sh', 'sql', 'swift', 'toml', 'ts', 'tsx', 'vue', 'xml', 'yaml', 'yml'
]);
const SOURCE_EXTENSIONS = new Set(['c', 'cc', 'cpp', 'cs', 'css', 'go', 'h', 'hpp', 'html', 'java', 'js', 'jsx', 'kt', 'php', 'py', 'rs', 'scss', 'sh', 'sql', 'swift', 'ts', 'tsx', 'vue', 'xml']);
const MANIFEST_NAMES = new Set([
  'package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml', 'yarn.lock', 'package-lock.json', 'bun.lock', 'bun.lockb',
  'cargo.toml', 'cargo.lock', 'pyproject.toml', 'requirements.txt', 'go.mod', 'go.sum', 'pom.xml', 'build.gradle',
  'build.gradle.kts', 'composer.json'
]);
const CONFIG_NAME_PATTERNS = [
  /^tsconfig(?:\..+)?\.json$/u,
  /^(?:vite|vitest|electron\.vite|webpack|rollup|esbuild)\.config\.[cm]?[jt]s$/u,
  /^(?:eslint|prettier|stylelint)\.config\.[cm]?[jt]s$/u,
  /^\.?(?:editorconfig|gitignore|npmrc|nvmrc)$/u,
  /^(?:docker-compose|compose)\.[a-z]+$/u
];
const DOC_NAME_PATTERN = /^(?:readme|contributing|changelog|license)(?:\..+)?$/iu;
const TEST_FILE_PATTERN = /(?:^|[._-])(?:test|spec)(?:\.[^.]+)?$/iu;

export interface RepoMapBuildOptions extends Partial<RepoMapLimits> {
  refresh?: boolean;
  now?: () => number;
  deniedRoots?: string[];
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function limitsFor(options: RepoMapBuildOptions): RepoMapLimits {
  return {
    maxDepth: Math.max(0, Math.floor(options.maxDepth ?? DEFAULT_LIMITS.maxDepth)),
    maxEntries: Math.max(1, Math.floor(options.maxEntries ?? DEFAULT_LIMITS.maxEntries)),
    timeoutMs: Math.max(1, Math.floor(options.timeoutMs ?? DEFAULT_LIMITS.timeoutMs))
  };
}

function isManifest(path: string): boolean {
  return MANIFEST_NAMES.has(basename(path).toLocaleLowerCase());
}

function isConfig(path: string): boolean {
  const name = basename(path).toLocaleLowerCase();
  return isManifest(path) || CONFIG_NAME_PATTERNS.some((pattern) => pattern.test(name));
}

function isDoc(path: string): boolean {
  const name = basename(path);
  return DOC_NAME_PATTERN.test(name) || path.toLocaleLowerCase().split('/').includes('docs');
}

function isTest(path: string): boolean {
  const parts = path.toLocaleLowerCase().split('/');
  return parts.some((part) => TEST_DIRECTORY_NAMES.has(part)) || TEST_FILE_PATTERN.test(basename(path));
}

function kindFor(path: string): RepoMapEntryKind {
  if (isManifest(path)) return 'manifest';
  if (isConfig(path)) return 'config';
  if (isDoc(path)) return 'doc';
  if (isTest(path)) return 'test';
  return 'source';
}

function languageFor(path: string): string | null {
  const extension = extname(path).slice(1).toLocaleLowerCase();
  return LANGUAGE_EXTENSIONS.has(extension) ? extension : null;
}

function sourceRootFor(path: string, kind: RepoMapEntryKind): string | null {
  if (kind !== 'source') return null;
  if (!SOURCE_EXTENSIONS.has(extname(path).slice(1).toLocaleLowerCase())) return null;
  const parts = path.split('/');
  const sourceIndex = parts.findIndex((part) => SOURCE_DIRECTORY_NAMES.has(part.toLocaleLowerCase()) && part.toLocaleLowerCase() !== 'packages');
  if (sourceIndex >= 0) return parts.slice(0, sourceIndex + 1).join('/');
  const packageIndex = parts.findIndex((part) => part.toLocaleLowerCase() === 'packages');
  if (packageIndex >= 0) return parts.slice(0, packageIndex + 1).join('/');
  return parts.length > 1 ? parts[0] : '.';
}

function testRootFor(path: string): string | null {
  const parts = path.split('/');
  const directoryIndex = parts.findIndex((part) => TEST_DIRECTORY_NAMES.has(part.toLocaleLowerCase()));
  if (directoryIndex >= 0) return parts.slice(0, directoryIndex + 1).join('/');
  return isTest(path) ? (dirname(path).replaceAll(sep, '/') || '.') : null;
}

function safeRelativePath(value: string): string | null {
  const candidate = value.trim().replaceAll('\\', '/');
  if (!candidate || candidate.startsWith('/') || candidate.startsWith('//') || /^[A-Za-z]:/u.test(candidate)) return null;
  if (candidate.split('/').some((part) => part === '..') || isSensitiveWorkspacePath(candidate)) return null;
  return candidate;
}

function uniquePaths(values: readonly string[], maximum: number): string[] {
  return [...new Set(values.map(safeRelativePath).filter((item): item is string => Boolean(item)))].slice(0, maximum);
}

function boundedLines(lines: readonly string[], maximum: number): string {
  const output: string[] = [];
  let length = 0;
  for (const line of lines) {
    const nextLength = length === 0 ? line.length : length + 1 + line.length;
    if (nextLength > maximum) break;
    output.push(line);
    length = nextLength;
  }
  return output.join('\n');
}

const REPO_CONTEXT_MAX_CHARS = 16_000;
const REPO_CONTEXT_MAX_ITEMS = 24;

/**
 * Builds the small metadata-only repository context that is safe to send to a model.
 * Absolute roots, sensitive paths, and file contents are intentionally excluded.
 */
export function buildRepoContextSummary(repoMap: RepoMap): string | undefined {
  if (repoMap.unavailable) return undefined;
  const lines = [
    '受控仓库上下文（仅元数据，无文件正文）：',
    `Project: ${repoMap.projectType || 'unknown'}`,
    ...(repoMap.packageManager ? [`Package manager: ${repoMap.packageManager}`] : []),
    ...(repoMap.partial ? ['Status: partial scan'] : [])
  ];
  const appendPaths = (label: string, values: readonly string[]): void => {
    const paths = uniquePaths(values, REPO_CONTEXT_MAX_ITEMS);
    if (paths.length === 0) return;
    lines.push(`${label}:`);
    lines.push(...paths.map((path) => `- ${path}`));
  };
  appendPaths('Source roots', repoMap.sourceRoots);
  appendPaths('Test roots', repoMap.testRoots);
  appendPaths('Config files', repoMap.configFiles);
  const importantFiles = repoMap.importantFiles
    .map((file) => {
      const path = safeRelativePath(file.path);
      return path ? `- ${path} (${file.kind}, ${Math.max(0, Math.trunc(file.size))} bytes)` : null;
    })
    .filter((item): item is string => Boolean(item))
    .slice(0, REPO_CONTEXT_MAX_ITEMS);
  if (importantFiles.length > 0) lines.push('Important files:', ...importantFiles);
  const languages = Object.entries(repoMap.languageStats)
    .filter(([language, count]) => /^[a-z0-9+#-]{1,20}$/iu.test(language) && Number.isFinite(count))
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 12)
    .map(([language, count]) => `${language}=${Math.max(0, Math.trunc(count))}`);
  if (languages.length > 0) lines.push(`Languages: ${languages.join(', ')}`);
  return boundedLines(lines, REPO_CONTEXT_MAX_CHARS) || undefined;
}

export function toTaskRepoSummary(repoMap: RepoMap): TaskRepoSummary {
  const projectRootRelative = safeRelativePath(relative(repoMap.workspaceRoot, repoMap.projectRoot).replaceAll(sep, '/'));
  const importantFiles = repoMap.importantFiles.flatMap((file) => {
    const path = safeRelativePath(file.path);
    return path ? [{ path, kind: file.kind, size: Math.max(0, Math.trunc(file.size)) }] : [];
  }).slice(0, REPO_CONTEXT_MAX_ITEMS);
  const languageStats: Record<string, number> = {};
  for (const [language, count] of Object.entries(repoMap.languageStats)) {
    if (/^[a-z0-9+#-]{1,20}$/iu.test(language) && Number.isFinite(count)) languageStats[language] = Math.max(0, Math.trunc(count));
  }
  return {
    projectType: repoMap.projectType || 'unknown',
    ...(repoMap.packageManager ? { packageManager: repoMap.packageManager } : {}),
    ...(projectRootRelative && projectRootRelative !== '.' ? { projectRootRelative } : {}),
    sourceRoots: uniquePaths(repoMap.sourceRoots, REPO_CONTEXT_MAX_ITEMS),
    testRoots: uniquePaths(repoMap.testRoots, REPO_CONTEXT_MAX_ITEMS),
    configFiles: uniquePaths(repoMap.configFiles, REPO_CONTEXT_MAX_ITEMS),
    importantFiles,
    languageStats,
    ...(repoMap.partial ? { partial: true } : {}),
    ...(repoMap.unavailable ? { unavailable: true } : {}),
    ...(repoMap.warnings?.length ? { warnings: repoMap.warnings.slice(0, 20) } : {})
  };
}

function unavailableMap(workspaceId: string, workspaceRoot: string, limits: RepoMapLimits, warning: string, now: () => number): RepoMap {
  return {
    workspaceId,
    workspaceRoot,
    projectRoot: workspaceRoot,
    projectType: 'unknown',
    sourceRoots: [],
    testRoots: [],
    configFiles: [],
    importantFiles: [],
    languageStats: {},
    generatedAt: now(),
    partial: true,
    unavailable: true,
    warnings: [warning],
    limits
  };
}

function projectOrUnknown(guard: WorkspaceGuard): { project: DetectedProject; warning?: string } {
  try {
    return { project: detectProject(guard.root) };
  } catch (error) {
    return {
      project: {
        workspaceRoot: guard.root,
        projectRoot: guard.root,
        type: 'unknown',
        packageManager: 'unknown',
        scripts: {}
      },
      warning: error instanceof Error ? `项目识别不可用：${error.message}` : '项目识别不可用'
    };
  }
}

function mapFromScan(workspaceId: string, guard: WorkspaceGuard, project: DetectedProject, scan: ReturnType<WorkspaceGuard['walkFiles']>, limits: RepoMapLimits, now: () => number, extraWarnings: string[] = []): RepoMap {
  const sourceRoots = new Set<string>();
  const testRoots = new Set<string>();
  const configFiles: string[] = [];
  const importantFiles: RepoMapEntry[] = [];
  const languageStats: Record<string, number> = {};
  const entries = [...scan.files].sort((left, right) => left.path.localeCompare(right.path));

  for (const file of entries) {
    const kind = kindFor(file.path);
    const sourceRoot = sourceRootFor(file.path, kind);
    const testRoot = testRootFor(file.path);
    if (sourceRoot) sourceRoots.add(sourceRoot);
    if (testRoot) testRoots.add(testRoot);
    if (kind === 'config' || kind === 'manifest') configFiles.push(file.path);
    if (kind !== 'source' && importantFiles.length < IMPORTANT_LIMIT) {
      importantFiles.push({ path: file.path, kind, size: file.size });
    }
    const language = languageFor(file.path);
    if (language) languageStats[language] = (languageStats[language] ?? 0) + 1;
  }

  const warnings = [...extraWarnings, ...scan.warnings];
  return {
    workspaceId,
    workspaceRoot: guard.root,
    projectRoot: project.projectRoot,
    projectType: project.type,
    ...(project.packageManager !== 'unknown' ? { packageManager: project.packageManager } : {}),
    sourceRoots: [...sourceRoots].sort(),
    testRoots: [...testRoots].sort(),
    configFiles: configFiles.sort(),
    importantFiles,
    languageStats,
    generatedAt: now(),
    ...(scan.partial ? { partial: true } : {}),
    ...(warnings.length > 0 ? { warnings: [...new Set(warnings)].slice(0, 20) } : {}),
    limits
  };
}

export class RepoMapBuilder {
  private readonly cache = new Map<string, RepoMap>();

  build(workspaceId: string, workspaceRoot: string, options: RepoMapBuildOptions = {}): RepoMap {
    const now = options.now ?? (() => Date.now());
    const limits = limitsFor(options);
    let guard: WorkspaceGuard;
    try {
      guard = new WorkspaceGuard(workspaceRoot, { deniedRoots: options.deniedRoots });
    } catch (error) {
      return unavailableMap(workspaceId, workspaceRoot, limits, error instanceof Error ? error.message : '授权工作区不可用', now);
    }

    const { project, warning } = projectOrUnknown(guard);
    const deniedRootsKey = (options.deniedRoots ?? []).map((root) => root.replaceAll('\\', '/').toLocaleLowerCase()).sort().join('|');
    const key = `${workspaceId}\u0000${guard.root}\u0000${project.projectRoot}\u0000${deniedRootsKey}`;
    if (!options.refresh) {
      const cached = this.cache.get(key);
      if (cached) return clone(cached);
    }
    const scan = guard.walkFiles({ ...limits, now });
    const result = mapFromScan(workspaceId, guard, project, scan, limits, now, warning ? [warning] : []);
    this.cache.set(key, clone(result));
    return clone(result);
  }

  clear(workspaceId?: string): void {
    if (!workspaceId) {
      this.cache.clear();
      return;
    }
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${workspaceId}\u0000`)) this.cache.delete(key);
    }
  }
}

export function buildRepoMap(workspaceId: string, workspaceRoot: string, options: RepoMapBuildOptions = {}): RepoMap {
  return new RepoMapBuilder().build(workspaceId, workspaceRoot, options);
}
