import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WorkspaceGuard } from './agent-security';
import { WorkspaceSearch } from './workspace-search';

function fixture(): { root: string; denied: string } {
  const root = mkdtempSync(join(tmpdir(), 'starchat-workspace-search-'));
  mkdirSync(join(root, 'src'), { recursive: true });
  mkdirSync(join(root, 'node_modules', 'dependency'), { recursive: true });
  const denied = join(root, 'private');
  mkdirSync(denied, { recursive: true });
  writeFileSync(join(root, 'src', 'app.ts'), 'export interface AppConfig {}\nexport const appName = "StarChat";\nfunction startApp() {}\n', 'utf8');
  writeFileSync(join(root, 'src', 'notes.txt'), 'welcome StarChat\nsecond line\n', 'utf8');
  writeFileSync(join(root, 'private', 'secret.ts'), 'export const secret = "hidden";\n', 'utf8');
  writeFileSync(join(root, 'node_modules', 'dependency', 'index.ts'), 'export const hiddenDependency = true;\n', 'utf8');
  writeFileSync(join(root, '.env'), 'API_KEY=hidden\n', 'utf8');
  return { root, denied };
}

describe('controlled workspace search', () => {
  it('supports filename search with bounded metadata and the same guard boundary', () => {
    const { root, denied } = fixture();
    const search = new WorkspaceSearch(new WorkspaceGuard(root, { deniedRoots: [denied] }));
    const result = search.search({ mode: 'filename', query: 'app' });

    expect(result.results).toEqual([{ path: 'src/app.ts', kind: 'file', size: expect.any(Number) }]);
    expect(JSON.stringify(result)).not.toContain('private');
    expect(JSON.stringify(result)).not.toContain('node_modules');
  });

  it('searches text without shell access and does not expose sensitive or denied files', () => {
    const { root, denied } = fixture();
    const search = new WorkspaceSearch(new WorkspaceGuard(root, { deniedRoots: [denied] }));
    const result = search.search({ mode: 'text', query: 'StarChat' });

    expect(result.results).toEqual(expect.arrayContaining([
      { path: 'src/app.ts', line: 2, text: 'export const appName = "StarChat";' },
      { path: 'src/notes.txt', line: 1, text: 'welcome StarChat' }
    ]));
    expect(JSON.stringify(result)).not.toContain('hidden');
    expect(JSON.stringify(result)).not.toContain('private');
  });

  it('finds lightweight TypeScript and JavaScript declarations with result limits', () => {
    const { root, denied } = fixture();
    const search = new WorkspaceSearch(new WorkspaceGuard(root, { deniedRoots: [denied] }));
    const result = search.search({ mode: 'symbol-lite', query: 'app', maxResults: 2 });

    expect(result.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'src/app.ts', name: 'AppConfig', kind: 'interface' }),
      expect.objectContaining({ path: 'src/app.ts', name: 'appName', kind: 'const' })
    ]));
    expect(result.results).toHaveLength(2);
  });

  it('returns a partial result when scan limits are reached', () => {
    const { root } = fixture();
    const search = new WorkspaceSearch(new WorkspaceGuard(root));
    const result = search.search({ mode: 'filename', query: '.ts', maxEntries: 1 });

    expect(result.partial).toBe(true);
    expect(result.warnings?.length).toBeGreaterThan(0);
  });
});
