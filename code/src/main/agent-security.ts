import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

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
}

export interface WorkspaceGuardOptions {
  maxReadBytes?: number;
  maxSearchResults?: number;
  deniedRoots?: string[];
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

  previewPatch(patch: string): PatchPreview {
    const files = parsePatch(patch).map((file) => {
      const target = this.resolve(file.path);
      if (!existsSync(target) || !statSync(target).isFile()) throw new Error('补丁目标必须是已有文件');
      applyPatchText(this.readText(file.path), file.hunks);
      return file.path.replaceAll('\\', '/');
    });
    return { files, summary: `将更新 ${files.length} 个文件：${files.join('、')}`, plan: patch };
  }

  applyApprovedPatch(expectedPlan: string, approvedPlan: string): PatchPreview {
    if (expectedPlan !== approvedPlan) throw new Error('批准计划与待执行计划不一致，必须重新审批');
    const preview = this.previewPatch(expectedPlan);
    for (const file of parsePatch(expectedPlan)) {
      const target = this.resolve(file.path);
      const next = applyPatchText(this.readText(file.path), file.hunks);
      const temporary = `${target}.baoyin-agent-${process.pid}-${Date.now()}.tmp`;
      writeFileSync(temporary, next, 'utf8');
      renameSync(temporary, target);
    }
    return preview;
  }

  ensureDirectory(): void {
    mkdirSync(this.root, { recursive: true });
  }
}
