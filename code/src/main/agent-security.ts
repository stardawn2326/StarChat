import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  statSync,
  type Dirent,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { AgentChangePreview, AgentFileChange } from '../shared/agent';

const DEFAULT_MAX_READ_BYTES = 128 * 1024;
const DEFAULT_MAX_RESULTS = 50;
const TEXT_ENCODER = new TextEncoder();
const MAX_PATH_CHARS = 2_000;
const MAX_PATCH_BYTES = 512 * 1024;

export interface WorkspaceFileSystemAdapter {
  copyFileSync: (source: string, destination: string) => void;
  mkdirSync: (path: string, options: { recursive?: boolean }) => void;
  renameSync: (source: string, destination: string) => void;
  unlinkSync: (path: string) => void;
  writeFileSync: (path: string, data: string) => void;
}

const DEFAULT_WORKSPACE_FILE_SYSTEM: WorkspaceFileSystemAdapter = {
  copyFileSync: (source, destination) => { copyFileSync(source, destination); },
  mkdirSync: (path, options) => { mkdirSync(path, options); },
  renameSync: (source, destination) => { renameSync(source, destination); },
  unlinkSync: (path) => { unlinkSync(path); },
  writeFileSync: (path, data) => { writeFileSync(path, data, 'utf8'); }
};

export function createWorkspaceFileSystemAdapter(overrides: Partial<WorkspaceFileSystemAdapter> = {}): WorkspaceFileSystemAdapter {
  return { ...DEFAULT_WORKSPACE_FILE_SYSTEM, ...overrides };
}

export class WorkspacePreconditionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkspacePreconditionError';
  }
}

export type WorkspaceApplyFailureState = 'apply-failed' | 'partial-failure';

export class WorkspaceApplyError extends Error {
  readonly state: WorkspaceApplyFailureState;
  readonly affectedPaths: string[];
  readonly rollbackFailures: string[];

  constructor(state: WorkspaceApplyFailureState, message: string, affectedPaths: string[] = [], rollbackFailures: string[] = []) {
    super(message);
    this.name = 'WorkspaceApplyError';
    this.state = state;
    this.affectedPaths = [...new Set(affectedPaths)].slice(0, 50);
    this.rollbackFailures = rollbackFailures.slice(0, 20);
  }
}

function lowerPath(value: string): string {
  return value.replaceAll('\\', '/').replace(/\/+/g, '/').replace(/\/$/, '').toLocaleLowerCase();
}

function isWithin(root: string, candidate: string): boolean {
  const normalizedRoot = lowerPath(root);
  const normalizedCandidate = lowerPath(candidate);
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}/`);
}

function isSensitive(relativePath: string): boolean {
  const normalized = lowerPath(relativePath);
  return normalized.split('/').some((part) =>
    part === '.env' || part.startsWith('.env.') || part.endsWith('.pem') || part.endsWith('.key') ||
    part.includes('secret') || part.includes('api-key') || part.includes('apikey') || part === 'id_rsa' ||
    part === '.ssh' || part === '.aws' || part === '.config' || part === 'appdata' || part === 'credentials'
  );
}

function patchPath(path: string): string {
  const normalized = path.trim();
  if (!normalized || normalized.length > MAX_PATH_CHARS || normalized.includes('\0')) throw new Error('补丁路径无效');
  return normalized;
}

interface PatchFile {
  path: string;
  hunks: string[][];
}

function parsePatch(patch: string): PatchFile[] {
  if (typeof patch !== 'string' || patch.length === 0 || TEXT_ENCODER.encode(patch).byteLength > MAX_PATCH_BYTES) throw new Error('补丁为空或过大');
  const lines = patch.replaceAll('\r\n', '\n').split('\n');
  if (lines[0] !== '*** Begin Patch' || lines.at(-1) !== '*** End Patch') throw new Error('只接受受控补丁格式');
  const files: PatchFile[] = [];
  let current: PatchFile | null = null;
  let hunk: string[] | null = null;
  for (const line of lines.slice(1, -1)) {
    if (line.startsWith('*** Update File: ')) {
      current = { path: patchPath(line.slice('*** Update File: '.length)), hunks: [] };
      files.push(current);
      hunk = null;
      continue;
    }
    if (line.startsWith('*** Add File: ') || line.startsWith('*** Delete File: ')) {
      throw new Error('补丁只允许更新已有文件，不允许新增或删除文件');
    }
    if (line.startsWith('@@')) {
      if (!current) throw new Error('补丁缺少目标文件');
      hunk = [];
      current.hunks.push(hunk);
      continue;
    }
    if (line === '') continue;
    if (!current || !hunk || !/^[ +\-]/u.test(line)) throw new Error('补丁行格式无效');
    hunk.push(line);
  }
  if (files.length === 0 || files.some((file) => file.hunks.length === 0)) throw new Error('补丁缺少变更块');
  return files;
}

function applyPatchText(original: string, hunks: string[][]): string {
  const originalLines = original.split('\n');
  let cursor = 0;
  for (const hunk of hunks) {
    const oldLines = hunk.filter((line) => line.startsWith(' ') || line.startsWith('-')).map((line) => line.slice(1));
    const newLines = hunk.filter((line) => line.startsWith(' ') || line.startsWith('+')).map((line) => line.slice(1));
    let at = -1;
    for (let index = cursor; index <= originalLines.length - oldLines.length; index += 1) {
      if (oldLines.every((line, offset) => originalLines[index + offset] === line)) {
        at = index;
        break;
      }
    }
    if (at < 0) throw new Error('补丁上下文与当前文件不匹配');
    originalLines.splice(at, oldLines.length, ...newLines);
    cursor = at + newLines.length;
  }
  return originalLines.join('\n');
}

export interface PatchPreview {
  files: string[];
  summary: string;
  plan: string;
  patch: string;
  additions: number;
  deletions: number;
  changes: NonNullable<AgentChangePreview['changes']>;
  changeSetId?: string;
}

export interface PreparedWorkspaceChange {
  path: string;
  operation: AgentFileChange['type'];
  beforeContent: string | null;
  afterContent: string | null;
  additions: number;
  deletions: number;
}

export interface PreparedPatchPreview {
  preview: PatchPreview;
  changes: PreparedWorkspaceChange[];
}

export interface StagedWorkspaceChange {
  path: string;
  operation: PreparedWorkspaceChange['operation'];
  beforeContent: string | null;
  afterContent: string | null;
  targetPath: string;
  temporaryPath?: string;
  snapshotPath?: string;
  backupPath?: string;
  temporaryCreated: boolean;
  snapshotCreated: boolean;
  targetMayBeChanged: boolean;
  targetMovedToBackup: boolean;
  targetCreated: boolean;
  backupRemoved: boolean;
}

export interface WorkspaceRollbackResult {
  complete: boolean;
  affectedPaths: string[];
  errors: string[];
}

export function isSensitiveWorkspacePath(relativePath: string): boolean {
  return isSensitive(relativePath);
}

const MAX_FILE_CHANGE_BYTES = 512 * 1024;
const MAX_FILE_CHANGE_COUNT = 50;

function sanitizeFileChanges(input: unknown): AgentFileChange[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_FILE_CHANGE_COUNT) throw new Error('文件变更计划数量无效');
  let totalBytes = 0;
  const changes: AgentFileChange[] = [];
  const paths = new Set<string>();
  for (const value of input) {
    if (!value || typeof value !== 'object') throw new Error('文件变更计划格式无效');
    const candidate = value as { type?: unknown; path?: unknown; content?: unknown };
    const path = patchPath(typeof candidate.path === 'string' ? candidate.path : '');
    if (paths.has(path)) throw new Error(`文件变更计划包含重复路径：${path}`);
    paths.add(path);
    if (candidate.type === 'delete') {
      changes.push({ type: 'delete', path });
      continue;
    }
    if ((candidate.type !== 'create' && candidate.type !== 'update') || typeof candidate.content !== 'string' || candidate.content.length > 256 * 1024) {
      throw new Error('文件变更内容无效或过大');
    }
    totalBytes += TEXT_ENCODER.encode(candidate.content).byteLength;
    if (totalBytes > MAX_FILE_CHANGE_BYTES) throw new Error('文件变更计划过大');
    changes.push({ type: candidate.type, path, content: candidate.content });
  }
  return changes;
}

function changePatch(change: AgentFileChange, previous: string | null): { lines: string[]; additions: number; deletions: number } {
  if (change.type === 'create') {
    const lines = change.content.replaceAll('\r\n', '\n').split('\n').map((line) => `+${line}`);
    return { lines, additions: lines.length, deletions: 0 };
  }
  const beforeLines = (previous ?? '').replaceAll('\r\n', '\n').split('\n');
  const afterLines = change.type === 'delete' ? [] : change.content.replaceAll('\r\n', '\n').split('\n');
  return {
    lines: [...beforeLines.map((line) => `-${line}`), ...afterLines.map((line) => `+${line}`)],
    additions: afterLines.length,
    deletions: beforeLines.length
  };
}

function hunkCounts(hunks: string[][]): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const hunk of hunks) {
    for (const line of hunk) {
      if (line.startsWith('+')) additions += 1;
      if (line.startsWith('-')) deletions += 1;
    }
  }
  return { additions, deletions };
}

export interface WorkspaceGuardOptions {
  maxReadBytes?: number;
  maxSearchResults?: number;
  deniedRoots?: string[];
  fileSystem?: WorkspaceFileSystemAdapter;
}

export interface WorkspaceWalkOptions {
  rootPath?: string;
  maxDepth?: number;
  maxEntries?: number;
  timeoutMs?: number;
  now?: () => number;
}

export interface WorkspaceWalkFile {
  path: string;
  size: number;
  depth: number;
}

export interface WorkspaceWalkResult {
  files: WorkspaceWalkFile[];
  partial: boolean;
  warnings: string[];
}

export class WorkspaceGuard {
  readonly root: string;
  readonly maxReadBytes: number;
  readonly maxSearchResults: number;
  private readonly deniedRoots: string[];
  private readonly fileSystem: WorkspaceFileSystemAdapter;

  constructor(rootDirectory: string, options: WorkspaceGuardOptions = {}) {
    if (!isAbsolute(rootDirectory) || !existsSync(rootDirectory)) throw new Error('授权工作区不存在');
    this.root = realpathSync(rootDirectory);
    this.maxReadBytes = options.maxReadBytes ?? DEFAULT_MAX_READ_BYTES;
    this.maxSearchResults = options.maxSearchResults ?? DEFAULT_MAX_RESULTS;
    this.deniedRoots = (options.deniedRoots ?? []).filter((item) => existsSync(item)).map((item) => realpathSync(item));
    this.fileSystem = options.fileSystem ?? createWorkspaceFileSystemAdapter();
  }

  resolve(requestedPath: string): string {
    if (typeof requestedPath !== 'string' || !requestedPath.trim() || requestedPath.length > MAX_PATH_CHARS) throw new Error('路径不能为空或过长');
    const normalized = requestedPath.trim().replaceAll('\\', '/');
    if (normalized.startsWith('/') || normalized.startsWith('//') || /^[A-Za-z]:/u.test(normalized) || normalized.split('/').some((part) => part === '..')) {
      throw new Error('路径必须位于授权工作区内');
    }
    const candidate = resolve(this.root, ...normalized.split('/'));
    let existing = candidate;
    while (!existsSync(existing)) {
      const parent = dirname(existing);
      if (parent === existing) break;
      existing = parent;
    }
    const realExisting = realpathSync(existing);
    if (!isWithin(this.root, realExisting) || this.deniedRoots.some((root) => isWithin(root, realExisting))) {
      throw new Error('路径逃逸授权工作区');
    }
    if (existsSync(candidate)) {
      const stat = lstatSync(candidate);
      if (stat.isSymbolicLink()) throw new Error('不允许通过符号链接访问文件');
      const realCandidate = realpathSync(candidate);
      if (!isWithin(this.root, realCandidate) || this.deniedRoots.some((root) => isWithin(root, realCandidate))) {
        throw new Error('路径逃逸授权工作区');
      }
    }
    const relativePath = relative(this.root, candidate).replaceAll(sep, '/');
    if (isSensitive(relativePath)) throw new Error('敏感文件不可进入 Agent 上下文');
    return candidate;
  }

  readText(requestedPath: string): string {
    const filePath = this.resolve(requestedPath);
    if (!existsSync(filePath) || !statSync(filePath).isFile()) throw new Error('目标不是文件');
    if (statSync(filePath).size > this.maxReadBytes) throw new Error('文件大小超过 Agent 限制');
    const bytes = readFileSync(filePath);
    if (bytes.subarray(0, Math.min(bytes.length, 4096)).includes(0)) throw new Error('二进制文件不可作为文本读取');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (TEXT_ENCODER.encode(text).byteLength > this.maxReadBytes) throw new Error('文本输出超过 Agent 限制');
    return text;
  }

  listDirectory(requestedPath = ''): Array<{ path: string; kind: 'file' | 'directory' }> {
    const directory = this.resolve(requestedPath || '.');
    if (!existsSync(directory) || !statSync(directory).isDirectory()) throw new Error('目标不是目录');
    return readdirSync(directory, { withFileTypes: true }).slice(0, this.maxSearchResults).flatMap((entry) => {
      if (entry.isSymbolicLink()) return [];
      const child = join(directory, entry.name);
      const relativePath = relative(this.root, child).replaceAll(sep, '/');
      if (isSensitive(relativePath)) return [];
      return [{ path: relativePath, kind: entry.isDirectory() ? 'directory' as const : 'file' as const }];
    });
  }

  searchText(query: string, requestedPath = ''): Array<{ path: string; line: number; text: string }> {
    if (!query.trim() || query.length > 500) throw new Error('搜索词无效或过长');
    const root = this.resolve(requestedPath || '.');
    const results: Array<{ path: string; line: number; text: string }> = [];
    const visit = (directory: string): void => {
      if (results.length >= this.maxSearchResults) return;
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (results.length >= this.maxSearchResults || entry.isSymbolicLink()) continue;
        const child = join(directory, entry.name);
        const rel = relative(this.root, child).replaceAll(sep, '/');
        if (isSensitive(rel) || entry.name === 'node_modules' || entry.name === '.git') continue;
        if (entry.isDirectory()) {
          visit(child);
          continue;
        }
        try {
          const text = this.readText(rel);
          text.split('\n').forEach((line, index) => {
            if (results.length < this.maxSearchResults && line.toLocaleLowerCase().includes(query.toLocaleLowerCase())) {
              results.push({ path: rel, line: index + 1, text: line.slice(0, 500) });
            }
          });
        } catch {
          // Binary, sensitive, and oversized files are intentionally invisible.
        }
      }
    };
    if (statSync(root).isDirectory()) visit(root);
    return results;
  }

  walkFiles(options: WorkspaceWalkOptions = {}): WorkspaceWalkResult {
    const maxDepth = Math.max(0, Math.floor(options.maxDepth ?? 8));
    const maxEntries = Math.max(1, Math.floor(options.maxEntries ?? 5000));
    const timeoutMs = Math.max(1, Math.floor(options.timeoutMs ?? 3000));
    const clock = options.now ?? (() => Date.now());
    const startedAt = clock();
    const walkRoot = this.resolve(options.rootPath ?? '.');
    if (!existsSync(walkRoot) || !statSync(walkRoot).isDirectory()) throw new Error('扫描目标不是目录');
    const files: WorkspaceWalkFile[] = [];
    const warnings: string[] = [];
    const ignoredDirectories = new Set(['.git', 'node_modules', 'out', 'dist', 'build', 'coverage', '.cache', 'tmp', 'temp']);
    let entryCount = 0;
    let partial = false;

    const warn = (message: string): void => {
      if (!warnings.includes(message) && warnings.length < 20) warnings.push(message);
    };
    const stopIfLimited = (): boolean => {
      if (clock() - startedAt >= timeoutMs) {
        partial = true;
        warn(`扫描达到 ${timeoutMs}ms 时间上限`);
        return true;
      }
      if (entryCount >= maxEntries) {
        partial = true;
        warn(`扫描达到 ${maxEntries} 项数量上限`);
        return true;
      }
      return false;
    };
    const visit = (directory: string, depth: number): void => {
      if (stopIfLimited()) return;
      let entries: Dirent[];
      try {
        entries = readdirSync(directory, { withFileTypes: true });
      } catch {
        partial = true;
        warn(`无法读取目录：${relative(this.root, directory).replaceAll(sep, '/') || '.'}`);
        return;
      }
      for (const entry of entries) {
        if (stopIfLimited()) return;
        if (entry.isSymbolicLink() || ignoredDirectories.has(entry.name)) continue;
        const child = join(directory, entry.name);
        const relativePath = relative(this.root, child).replaceAll(sep, '/');
        if (isSensitive(relativePath)) continue;
        entryCount += 1;
        let safeChild: string;
        try {
          safeChild = this.resolve(relativePath);
        } catch {
          partial = true;
          warn('已跳过不受授权范围的路径');
          continue;
        }
        let stat;
        try {
          stat = statSync(safeChild);
        } catch {
          partial = true;
          warn(`无法读取条目：${relativePath}`);
          continue;
        }
        if (stat.isDirectory()) {
          if (depth >= maxDepth) {
            partial = true;
            warn(`扫描达到 ${maxDepth} 层深度上限`);
            continue;
          }
          visit(safeChild, depth + 1);
          continue;
        }
        if (stat.isFile()) files.push({ path: relativePath, size: stat.size, depth });
      }
    };

    visit(walkRoot, 0);
    return { files, partial, warnings };
  }

  private preparedPreview(changes: PreparedWorkspaceChange[], plan: string, patch: string, summary: string): PatchPreview {
    const files = changes.map((change) => change.path);
    return {
      files,
      summary,
      plan,
      patch,
      additions: changes.reduce((total, change) => total + change.additions, 0),
      deletions: changes.reduce((total, change) => total + change.deletions, 0),
      changes: changes.map((change) => ({ path: change.path, operation: change.operation }))
    };
  }

  private preparePatchChanges(patch: string): PreparedWorkspaceChange[] {
    const seen = new Set<string>();
    return parsePatch(patch).map((file) => {
      const path = file.path.replaceAll('\\', '/');
      if (seen.has(path)) throw new Error(`补丁包含重复路径：${path}`);
      seen.add(path);
      const target = this.resolve(path);
      if (!existsSync(target) || !statSync(target).isFile()) throw new Error('补丁目标必须是已有文件');
      const beforeContent = this.readText(path);
      const afterContent = applyPatchText(beforeContent, file.hunks);
      const counts = hunkCounts(file.hunks);
      return { path, operation: 'update' as const, beforeContent, afterContent, ...counts };
    });
  }

  private prepareFileChanges(input: unknown): PreparedWorkspaceChange[] {
    return sanitizeFileChanges(input).map((change) => {
      const path = change.path.replaceAll('\\', '/');
      const target = this.resolve(path);
      const exists = existsSync(target);
      if (change.type === 'create' && exists) throw new Error(`待创建文件已存在：${path}`);
      if (change.type !== 'create' && (!exists || !statSync(target).isFile())) throw new Error(`待修改文件不存在或不是文件：${path}`);
      const beforeContent = change.type === 'create' ? null : this.readText(path);
      const afterContent = change.type === 'delete' ? null : change.content;
      const patch = changePatch(change, beforeContent);
      return { path, operation: change.type, beforeContent, afterContent, additions: patch.additions, deletions: patch.deletions };
    });
  }

  private fileChangesPatch(changes: PreparedWorkspaceChange[]): string {
    const sections: string[] = ['*** Begin File Changes'];
    for (const change of changes) {
      const patch = changePatch({ type: change.operation, path: change.path, ...(change.afterContent === null ? {} : { content: change.afterContent }) } as AgentFileChange, change.beforeContent);
      sections.push(`*** ${change.operation === 'create' ? 'Create' : change.operation === 'update' ? 'Update' : 'Delete'} File: ${change.path}`, ...patch.lines);
    }
    sections.push('*** End File Changes');
    return sections.join('\n');
  }

  preparePatchPreview(patch: string): PreparedPatchPreview {
    const changes = this.preparePatchChanges(patch);
    const files = changes.map((change) => change.path);
    return { changes, preview: this.preparedPreview(changes, patch, patch, `将更新 ${files.length} 个文件：${files.join('、')}`) };
  }

  prepareFileChangesPreview(input: unknown): PreparedPatchPreview {
    const changesInput = sanitizeFileChanges(input);
    const changes = this.prepareFileChanges(changesInput);
    const patch = this.fileChangesPatch(changes);
    const operations = changes.map((change) => change.operation === 'create' ? '创建' : change.operation === 'update' ? '更新' : '删除').join('、');
    const paths = changes.map((change) => change.path).join('、');
    return { changes, preview: this.preparedPreview(changes, JSON.stringify(changesInput), patch, `将${operations} ${changes.length} 个文件：${paths}`) };
  }

  previewPatch(patch: string): PatchPreview {
    return this.preparePatchPreview(patch).preview;
  }

  previewFileChanges(input: unknown): PatchPreview {
    return this.prepareFileChangesPreview(input).preview;
  }

  private artifactPath(targetPath: string, kind: 'temporary' | 'snapshot' | 'backup' | 'restore'): string {
    return join(dirname(targetPath), `.${basename(targetPath)}.starchat-agent-${process.pid}-${Date.now()}-${randomUUID()}.${kind}`);
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : '文件变更操作失败';
  }

  private prepareStagedChanges(changes: readonly PreparedWorkspaceChange[]): StagedWorkspaceChange[] {
    if (changes.length === 0 || changes.length > MAX_FILE_CHANGE_COUNT) throw new WorkspacePreconditionError('变更集没有有效文件');
    const seen = new Set<string>();
    return changes.map((change) => {
      const path = change.path.replaceAll('\\', '/');
      if (!path || seen.has(path)) throw new WorkspacePreconditionError(`变更集包含重复路径：${path}`);
      seen.add(path);
      let targetPath: string;
      try {
        targetPath = this.resolve(path);
      } catch {
        throw new WorkspacePreconditionError(`变更集路径无法复核：${path}`);
      }
      const exists = existsSync(targetPath);
      if (change.operation === 'create') {
        if (exists || change.beforeContent !== null || change.afterContent === null) throw new WorkspacePreconditionError(`创建前置条件已变化：${path}`);
      } else {
        if (!exists || !statSync(targetPath).isFile() || change.beforeContent === null || (change.operation === 'update' && change.afterContent === null) || (change.operation === 'delete' && change.afterContent !== null)) {
          throw new WorkspacePreconditionError(`修改前置条件已变化：${path}`);
        }
        try {
          if (this.readText(path) !== change.beforeContent) throw new WorkspacePreconditionError(`文件在批准前发生变化：${path}`);
        } catch (error) {
          if (error instanceof WorkspacePreconditionError) throw error;
          throw new WorkspacePreconditionError(`文件在批准前无法复核：${path}`);
        }
      }
      const staged: StagedWorkspaceChange = {
        path,
        operation: change.operation,
        beforeContent: change.beforeContent,
        afterContent: change.afterContent,
        targetPath,
        ...(change.operation === 'create' || change.operation === 'update' ? { temporaryPath: this.artifactPath(targetPath, 'temporary') } : {}),
        ...(change.operation !== 'create' ? {
          snapshotPath: this.artifactPath(targetPath, 'snapshot'),
          backupPath: this.artifactPath(targetPath, 'backup')
        } : {}),
        temporaryCreated: false,
        snapshotCreated: false,
        targetMayBeChanged: false,
        targetMovedToBackup: false,
        targetCreated: false,
        backupRemoved: false
      };
      if (staged.temporaryPath && existsSync(staged.temporaryPath) || staged.snapshotPath && existsSync(staged.snapshotPath) || staged.backupPath && existsSync(staged.backupPath)) {
        throw new WorkspacePreconditionError(`变更集临时路径已存在：${path}`);
      }
      return staged;
    });
  }

  private cleanupStagedArtifacts(staged: readonly StagedWorkspaceChange[]): string[] {
    const errors: string[] = [];
    for (const item of [...staged].reverse()) {
      for (const artifact of [item.temporaryPath, item.snapshotPath]) {
        if (!artifact || !existsSync(artifact)) continue;
        try {
          this.fileSystem.unlinkSync(artifact);
        } catch (error) {
          errors.push(`${item.path}: ${this.errorMessage(error)}`);
        }
      }
    }
    return errors;
  }

  stagePreparedFileChanges(changes: readonly PreparedWorkspaceChange[]): StagedWorkspaceChange[] {
    const staged = this.prepareStagedChanges(changes);
    try {
      for (const item of staged) {
        if (item.snapshotPath) {
          this.fileSystem.copyFileSync(item.targetPath, item.snapshotPath);
          item.snapshotCreated = true;
        }
        if (item.temporaryPath) {
          this.fileSystem.mkdirSync(dirname(item.targetPath), { recursive: true });
          this.fileSystem.writeFileSync(item.temporaryPath, item.afterContent ?? '');
          item.temporaryCreated = true;
        }
      }
      return staged;
    } catch (error) {
      const cleanupErrors = this.cleanupStagedArtifacts(staged);
      if (error instanceof WorkspacePreconditionError && cleanupErrors.length === 0) throw error;
      const details = cleanupErrors.length > 0 ? `；暂存清理失败：${cleanupErrors.join('；')}` : '';
      throw new WorkspaceApplyError('apply-failed', `变更集阶段准备失败：${this.errorMessage(error)}${details}`, staged.map((item) => item.path), cleanupErrors);
    }
  }

  private assertCommitPrecondition(item: StagedWorkspaceChange): void {
    let resolved: string;
    try {
      resolved = this.resolve(item.path);
    } catch {
      throw new WorkspacePreconditionError(`变更集路径无法复核：${item.path}`);
    }
    if (resolved !== item.targetPath) throw new WorkspacePreconditionError(`变更集路径身份已变化：${item.path}`);
    const exists = existsSync(item.targetPath);
    if (item.operation === 'create') {
      if (exists || !item.temporaryPath || !existsSync(item.temporaryPath)) throw new WorkspacePreconditionError(`创建前置条件已变化：${item.path}`);
      return;
    }
    if (!exists || !statSync(item.targetPath).isFile() || !item.backupPath || existsSync(item.backupPath) || !item.snapshotPath || !existsSync(item.snapshotPath) || (item.operation === 'update' && (!item.temporaryPath || !existsSync(item.temporaryPath)))) {
      throw new WorkspacePreconditionError(`修改前置条件已变化：${item.path}`);
    }
    try {
      if (this.readText(item.path) !== item.beforeContent) throw new WorkspacePreconditionError(`文件在批准前发生变化：${item.path}`);
    } catch (error) {
      if (error instanceof WorkspacePreconditionError) throw error;
      throw new WorkspacePreconditionError(`文件在批准前无法复核：${item.path}`);
    }
  }

  private targetNeedsRestore(item: StagedWorkspaceChange): boolean {
    if (!item.targetMayBeChanged && !item.targetMovedToBackup && !item.targetCreated) return false;
    if (item.targetMovedToBackup || item.targetCreated || !existsSync(item.targetPath)) return true;
    try {
      return this.readText(item.path) !== item.beforeContent;
    } catch {
      return true;
    }
  }

  private restoreFromSnapshot(item: StagedWorkspaceChange): void {
    if (!item.snapshotPath || !existsSync(item.snapshotPath)) throw new Error('原文件备份不存在');
    const restorePath = this.artifactPath(item.targetPath, 'restore');
    try {
      this.fileSystem.copyFileSync(item.snapshotPath, restorePath);
      this.fileSystem.renameSync(restorePath, item.targetPath);
    } finally {
      if (existsSync(restorePath)) this.fileSystem.unlinkSync(restorePath);
    }
  }

  rollbackPreparedFileChanges(staged: readonly StagedWorkspaceChange[]): WorkspaceRollbackResult {
    const affectedPaths: string[] = [];
    const errors: string[] = [];
    for (const item of [...staged].reverse()) {
      const needsRestore = item.operation === 'create' ? item.targetMayBeChanged || item.targetCreated : this.targetNeedsRestore(item);
      if (needsRestore) affectedPaths.push(item.path);
      try {
        if (item.operation === 'create') {
          if (existsSync(item.targetPath)) this.fileSystem.unlinkSync(item.targetPath);
        } else if (needsRestore) {
          if (existsSync(item.targetPath)) this.fileSystem.unlinkSync(item.targetPath);
          if (item.backupPath && existsSync(item.backupPath)) {
            this.fileSystem.renameSync(item.backupPath, item.targetPath);
            item.targetMovedToBackup = false;
          } else {
            this.restoreFromSnapshot(item);
          }
          item.targetCreated = false;
        }
      } catch (error) {
        errors.push(`${item.path}: ${this.errorMessage(error)}`);
      }
      for (const artifact of [item.temporaryPath, item.snapshotPath]) {
        if (!artifact || !existsSync(artifact)) continue;
        try {
          this.fileSystem.unlinkSync(artifact);
        } catch (error) {
          errors.push(`${item.path}: ${this.errorMessage(error)}`);
        }
      }
    }
    return { complete: errors.length === 0, affectedPaths: [...new Set(affectedPaths)], errors };
  }

  commitPreparedFileChanges(staged: readonly StagedWorkspaceChange[]): void {
    try {
      for (const item of staged) {
        this.assertCommitPrecondition(item);
        if (item.operation === 'create') {
          item.targetMayBeChanged = true;
          this.fileSystem.renameSync(item.temporaryPath!, item.targetPath);
          item.temporaryCreated = false;
          item.targetCreated = true;
          continue;
        }
        item.targetMayBeChanged = true;
        this.fileSystem.renameSync(item.targetPath, item.backupPath!);
        item.targetMovedToBackup = true;
        if (item.operation === 'update') {
          this.fileSystem.renameSync(item.temporaryPath!, item.targetPath);
          item.temporaryCreated = false;
          item.targetCreated = true;
        }
      }
      for (const item of staged) {
        if (item.operation === 'create') continue;
        if (!item.backupPath || !existsSync(item.backupPath)) throw new Error(`变更集备份不存在：${item.path}`);
        this.fileSystem.unlinkSync(item.backupPath);
        item.backupRemoved = true;
      }
      for (const item of staged) {
        if (item.snapshotPath && existsSync(item.snapshotPath)) this.fileSystem.unlinkSync(item.snapshotPath);
      }
    } catch (error) {
      const rollback = this.rollbackPreparedFileChanges(staged);
      const touched = staged.some((item) => item.targetMayBeChanged || item.targetMovedToBackup || item.targetCreated);
      if (error instanceof WorkspacePreconditionError && !touched && rollback.complete) throw error;
      const state: WorkspaceApplyFailureState = rollback.complete ? 'apply-failed' : 'partial-failure';
      const affectedPaths = [...new Set([...staged.map((item) => item.path), ...rollback.affectedPaths])];
      const rollbackDetails = rollback.errors.length > 0 ? `；回滚失败：${rollback.errors.join('；')}` : '；已完成回滚';
      throw new WorkspaceApplyError(state, `变更集应用失败（${state}）：${this.errorMessage(error)}${rollbackDetails}`, affectedPaths, rollback.errors);
    }
  }

  applyPreparedFileChanges(changes: readonly PreparedWorkspaceChange[]): void {
    this.commitPreparedFileChanges(this.stagePreparedFileChanges(changes));
  }

  applyApprovedFileChanges(expectedPlan: string, approvedPlan: string): PatchPreview {
    if (expectedPlan !== approvedPlan) throw new Error('批准计划与待执行计划不一致，必须重新审批');
    const prepared = this.prepareFileChangesPreview(JSON.parse(expectedPlan));
    this.applyPreparedFileChanges(prepared.changes);
    return prepared.preview;
  }

  applyApprovedPatch(expectedPlan: string, approvedPlan: string): PatchPreview {
    if (expectedPlan !== approvedPlan) throw new Error('批准计划与待执行计划不一致，必须重新审批');
    const prepared = this.preparePatchPreview(expectedPlan);
    this.applyPreparedFileChanges(prepared.changes);
    return prepared.preview;
  }

  ensureDirectory(): void {
    mkdirSync(this.root, { recursive: true });
  }
}
