import { extname } from 'node:path';
import { WorkspaceGuard } from './agent-security';

export type WorkspaceSearchMode = 'filename' | 'text' | 'symbol-lite';
export const WORKSPACE_SEARCH_MODES: readonly WorkspaceSearchMode[] = ['filename', 'text', 'symbol-lite'];

export interface WorkspaceSearchRequest {
  mode: WorkspaceSearchMode;
  query: string;
  path?: string;
  maxResults?: number;
  maxEntries?: number;
  timeoutMs?: number;
  maxDepth?: number;
}
export interface WorkspaceFilenameResult {
  path: string;
  kind: 'file';
  size: number;
}

export interface WorkspaceTextResult {
  path: string;
  line: number;
  text: string;
}

export type WorkspaceSymbolKind = 'function' | 'class' | 'interface' | 'type' | 'const' | 'let' | 'var';

export interface WorkspaceSymbolResult {
  path: string;
  line: number;
  name: string;
  kind: WorkspaceSymbolKind;
  text: string;
}

export type WorkspaceSearchResult = WorkspaceFilenameResult | WorkspaceTextResult | WorkspaceSymbolResult;

export interface WorkspaceSearchResponse {
  mode: WorkspaceSearchMode;
  results: WorkspaceSearchResult[];
  partial: boolean;
  warnings?: string[];
}

const DEFAULT_MAX_RESULTS = 50;
const MAX_MAX_RESULTS = 200;
const DEFAULT_MAX_ENTRIES = 2000;
const MAX_MAX_ENTRIES = 5000;
const DEFAULT_TIMEOUT_MS = 3000;
const MAX_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_DEPTH = 8;
const MAX_MAX_DEPTH = 16;
const SYMBOL_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

const SYMBOL_PATTERNS: ReadonlyArray<readonly [WorkspaceSymbolKind, RegExp]> = [
  ['function', /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/u],
  ['class', /^\s*(?:export\s+)?(?:declare\s+)?class\s+([A-Za-z_$][\w$]*)/u],
  ['interface', /^\s*(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/u],
  ['type', /^\s*(?:export\s+)?type\s+([A-Za-z_$][\w$]*)/u],
  ['const', /^\s*(?:export\s+)?(?:declare\s+)?const\s+([A-Za-z_$][\w$]*)/u],
  ['let', /^\s*(?:export\s+)?(?:declare\s+)?let\s+([A-Za-z_$][\w$]*)/u],
  ['var', /^\s*(?:export\s+)?(?:declare\s+)?var\s+([A-Za-z_$][\w$]*)/u]
];

function boundedNumber(value: number | undefined, fallback: number, maximum: number): number {
  return Math.max(1, Math.min(maximum, Math.floor(value ?? fallback)));
}

function boundedWarnings(warnings: readonly string[]): string[] | undefined {
  const unique = [...new Set(warnings.filter(Boolean))].slice(0, 20);
  return unique.length > 0 ? unique : undefined;
}

export class WorkspaceSearch {
  constructor(private readonly guard: WorkspaceGuard) {}

  search(request: WorkspaceSearchRequest): WorkspaceSearchResponse {
    if (!WORKSPACE_SEARCH_MODES.includes(request.mode)) throw new Error('工作区搜索模式无效');
    if (typeof request.query !== 'string' || !request.query.trim() || request.query.length > 500) throw new Error('搜索词无效或过长');
    const maxResults = boundedNumber(request.maxResults, DEFAULT_MAX_RESULTS, MAX_MAX_RESULTS);
    const maxEntries = boundedNumber(request.maxEntries, DEFAULT_MAX_ENTRIES, MAX_MAX_ENTRIES);
    const timeoutMs = boundedNumber(request.timeoutMs, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
    const maxDepth = Math.max(0, Math.min(MAX_MAX_DEPTH, Math.floor(request.maxDepth ?? DEFAULT_MAX_DEPTH)));
    const scan = this.guard.walkFiles({
      rootPath: request.path?.trim() || '.',
      maxDepth,
      maxEntries,
      timeoutMs
    });
    const results: WorkspaceSearchResult[] = [];
    const query = request.query.trim().toLocaleLowerCase();
    const startedAt = Date.now();
    let partial = scan.partial;
    const warnings = [...scan.warnings];
    const timedOut = (): boolean => {
      if (Date.now() - startedAt < timeoutMs) return false;
      partial = true;
      warnings.push(`搜索达到 ${timeoutMs}ms 时间上限`);
      return true;
    };

    for (const file of [...scan.files].sort((left, right) => left.path.localeCompare(right.path))) {
      if (results.length >= maxResults || timedOut()) break;
      if (request.mode === 'filename') {
        if (file.path.toLocaleLowerCase().includes(query)) results.push({ path: file.path, kind: 'file', size: file.size });
        continue;
      }
      if (request.mode === 'symbol-lite' && !SYMBOL_EXTENSIONS.has(extname(file.path).toLocaleLowerCase())) continue;
      let content: string;
      try {
        content = this.guard.readText(file.path);
      } catch {
        continue;
      }
      const lines = content.split(/\r?\n/u);
      for (let index = 0; index < lines.length && results.length < maxResults; index += 1) {
        if (timedOut()) break;
        const line = lines[index];
        if (request.mode === 'text') {
          if (line.toLocaleLowerCase().includes(query)) results.push({ path: file.path, line: index + 1, text: line.slice(0, 500) });
          continue;
        }
        for (const [kind, pattern] of SYMBOL_PATTERNS) {
          const match = pattern.exec(line);
          if (match?.[1] && match[1].toLocaleLowerCase().includes(query)) {
            results.push({ path: file.path, line: index + 1, name: match[1], kind, text: line.trim().slice(0, 500) });
            break;
          }
        }
      }
    }
    return { mode: request.mode, results, partial, ...(boundedWarnings(warnings) ? { warnings: boundedWarnings(warnings) } : {}) };
  }
}
