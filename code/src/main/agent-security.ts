import {
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
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { AgentFileChange } from '../shared/agent';

const DEFAULT_MAX_READ_BYTES = 128 * 1024;
const DEFAULT_MAX_RESULTS = 50;
const TEXT_ENCODER = new TextEncoder();

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
  if (!normalized || normalized.includes('\0')) throw new Error('补丁路径无效');
  return normalized;
}

interface PatchFile {
  path: string;
  hunks: string[][];
}

function parsePatch(patch: string): PatchFile[] {
  if (typeof patch !== 'string' || patch.length === 0 || patch.length > 512 * 1024) throw new Error('补丁为空或过大');
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

function patchCounts(patch: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const line of patch.split(/\r?\n/u)) {
    if (line.startsWith('+') && !line.startsWith('+++')) additions += 1;
    if (line.startsWith('-') && !line.startsWith('---')) deletions += 1;
  }
  return { additions, deletions };
}

export interface WorkspaceGuardOptions {
  maxReadBytes?: number;
  maxSearchResults?: number;
  deniedRoots?: string[];
}

export interface WorkspaceWalkOptions {
  maxDepth?: number;
  maxEntries?: number;
  timeoutMs?: number;
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

  constructor(rootDirectory: string, options: WorkspaceGuardOptions = {}) {
    if (!isAbsolute(rootDirectory) || !existsSync(rootDirectory)) throw new Error('授权工作区不存在');
    this.root = realpathSync(rootDirectory);
    this.maxReadBytes = options.maxReadBytes ?? DEFAULT_MAX_READ_BYTES;
    this.maxSearchResults = options.maxSearchResults ?? DEFAULT_MAX_RESULTS;
    this.deniedRoots = (options.deniedRoots ?? []).filter((item) => existsSync(item)).map((item) => realpathSync(item));
  }

  resolve(requestedPath: string): string {
    if (typeof requestedPath !== 'string' || !requestedPath.trim() || requestedPath.length > 1024) throw new Error('路径不能为空或过长');
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
    const startedAt = Date.now();
    const files: WorkspaceWalkFile[] = [];
    const warnings: string[] = [];
    const ignoredDirectories = new Set(['.git', 'node_modules', 'out', 'dist', 'build', 'coverage', '.cache', 'tmp', 'temp']);
    let entryCount = 0;
    let partial = false;

    const warn = (message: string): void => {
      if (!warnings.includes(message) && warnings.length < 20) warnings.push(message);
    };
    const stopIfLimited = (): boolean => {
      if (Date.now() - startedAt >= timeoutMs) {
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
          warn(`已跳过不受授权范围的路径：${relativePath}`);
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

    visit(this.root, 0);
    return { files, partial, warnings };
  }

  previewPatch(patch: string): PatchPreview {
    const files = parsePatch(patch).map((file) => {
      const target = this.resolve(file.path);
      if (!existsSync(target) || !statSync(target).isFile()) throw new Error('补丁目标必须是已有文件');
      applyPatchText(this.readText(file.path), file.hunks);
      return file.path.replaceAll('\\', '/');
    });
    return { files, summary: `将更新 ${files.length} 个文件：${files.join('、')}`, plan: patch, patch, ...patchCounts(patch) };
  }

  previewFileChanges(input: unknown): PatchPreview {
    const changes = sanitizeFileChanges(input);
    let additions = 0;
    let deletions = 0;
    const sections: string[] = ['*** Begin File Changes'];
    for (const change of changes) {
      const target = this.resolve(change.path);
      const exists = existsSync(target);
      if (change.type === 'create' && exists) throw new Error(`待创建文件已存在：${change.path}`);
      if (change.type !== 'create' && (!exists || !statSync(target).isFile())) throw new Error(`待修改文件不存在或不是文件：${change.path}`);
      const previous = change.type === 'create' ? null : this.readText(change.path);
      const patch = changePatch(change, previous);
      additions += patch.additions;
      deletions += patch.deletions;
      sections.push(`*** ${change.type === 'create' ? 'Create' : change.type === 'update' ? 'Update' : 'Delete'} File: ${change.path}`, ...patch.lines);
    }
    sections.push('*** End File Changes');
    return {
      files: changes.map((change) => change.path.replaceAll('\\', '/')),
      summary: `将${changes.map((change) => change.type === 'create' ? '创建' : change.type === 'update' ? '更新' : '删除').join('、')} ${changes.length} 个文件：${changes.map((change) => change.path).join('、')}`,
      plan: JSON.stringify(changes),
      patch: sections.join('\n'),
      additions,
      deletions
    };
  }

  applyApprovedFileChanges(expectedPlan: string, approvedPlan: string): PatchPreview {
    if (expectedPlan !== approvedPlan) throw new Error('批准计划与待执行计划不一致，必须重新审批');
    let changes: AgentFileChange[];
    try {
      changes = sanitizeFileChanges(JSON.parse(expectedPlan));
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : '文件变更计划无效');
    }
    const preview = this.previewFileChanges(changes);
    for (const change of changes) {
      const target = this.resolve(change.path);
      if (change.type === 'delete') {
        unlinkSync(target);
        continue;
      }
      mkdirSync(dirname(target), { recursive: true });
      const temporary = `${target}.starchat-agent-${process.pid}-${Date.now()}.tmp`;
      writeFileSync(temporary, change.content, 'utf8');
      renameSync(temporary, target);
    }
    return preview;
  }

  applyApprovedPatch(expectedPlan: string, approvedPlan: string): PatchPreview {
    if (expectedPlan !== approvedPlan) throw new Error('批准计划与待执行计划不一致，必须重新审批');
    const preview = this.previewPatch(expectedPlan);
    for (const file of parsePatch(expectedPlan)) {
      const target = this.resolve(file.path);
      const next = applyPatchText(this.readText(file.path), file.hunks);
      const temporary = `${target}.starchat-agent-${process.pid}-${Date.now()}.tmp`;
      writeFileSync(temporary, next, 'utf8');
      renameSync(temporary, target);
    }
    return preview;
  }

  ensureDirectory(): void {
    mkdirSync(this.root, { recursive: true });
  }
}
