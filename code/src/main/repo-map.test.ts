import { existsSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RepoMapBuilder } from './repo-map';

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'starchat-repo-map-'));
  mkdirSync(join(root, 'src'), { recursive: true });
  mkdirSync(join(root, 'tests'), { recursive: true });
  mkdirSync(join(root, 'node_modules', 'ignored'), { recursive: true });
  mkdirSync(join(root, 'dist'), { recursive: true });
  writeFileSync(join(root, 'package.json'), JSON.stringify({ dependencies: { react: '^18.0.0' } }), 'utf8');
  writeFileSync(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n', 'utf8');
  writeFileSync(join(root, 'README.md'), '# StarChat\n', 'utf8');
  writeFileSync(join(root, 'vite.config.ts'), 'export default {}\n', 'utf8');
  writeFileSync(join(root, 'src', 'main.ts'), 'export const answer = 42\n', 'utf8');
  writeFileSync(join(root, 'tests', 'main.test.ts'), 'test("ok", () => {})\n', 'utf8');
  writeFileSync(join(root, 'node_modules', 'ignored', 'dependency.js'), 'ignored\n', 'utf8');
  writeFileSync(join(root, 'dist', 'generated.js'), 'ignored\n', 'utf8');
  writeFileSync(join(root, '.env'), 'API_KEY=hidden\n', 'utf8');
  return root;
}

describe('repo map builder', () => {
  it('detects a project, conventional roots and important files while omitting ignored and sensitive paths', () => {
    const map = new RepoMapBuilder().build('workspace-a', fixture());
    expect(map.projectType).toBe('web');
    expect(map.packageManager).toBe('pnpm');
    expect(map.sourceRoots).toContain('src');
    expect(map.testRoots).toContain('tests');
    expect(map.configFiles).toEqual(expect.arrayContaining(['package.json', 'pnpm-lock.yaml', 'vite.config.ts']));
    expect(map.importantFiles.map((file) => file.path)).toEqual(expect.arrayContaining(['README.md', 'package.json']));
    expect(map.languageStats.ts).toBe(3);
    expect(JSON.stringify(map)).not.toContain('node_modules');
    expect(JSON.stringify(map)).not.toContain('.env');
  });

  it('returns a partial map when depth or entry limits are reached', () => {
    const map = new RepoMapBuilder().build('workspace-limited', fixture(), { maxDepth: 1, maxEntries: 2 });
    expect(map.partial).toBe(true);
    expect(map.warnings?.length).toBeGreaterThan(0);
    expect(map.limits).toMatchObject({ maxDepth: 1, maxEntries: 2 });
  });

  it('recognizes monorepo-style source and test roots without following generated dependencies', () => {
    const root = mkdtempSync(join(tmpdir(), 'starchat-repo-map-mono-'));
    mkdirSync(join(root, 'packages', 'app', 'src'), { recursive: true });
    mkdirSync(join(root, 'packages', 'app', 'tests'), { recursive: true });
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n', 'utf8');
    writeFileSync(join(root, 'packages', 'app', 'package.json'), JSON.stringify({ dependencies: { react: '^18.0.0' } }), 'utf8');
    writeFileSync(join(root, 'packages', 'app', 'src', 'index.ts'), 'export {}\n', 'utf8');
    writeFileSync(join(root, 'packages', 'app', 'tests', 'index.test.ts'), 'test("ok", () => {})\n', 'utf8');
    const map = new RepoMapBuilder().build('workspace-mono', root);
    expect(map.packageManager).toBe('pnpm');
    expect(map.sourceRoots).toContain('packages/app/src');
    expect(map.testRoots).toContain('packages/app/tests');
    expect(map.importantFiles.map((file) => file.path)).toContain('packages/app/package.json');
  });

  it('represents an existing project with no recognized manifest as unknown but available', () => {
    const root = mkdtempSync(join(tmpdir(), 'starchat-repo-map-unknown-'));
    writeFileSync(join(root, 'notes.txt'), 'plain notes\n', 'utf8');
    const map = new RepoMapBuilder().build('workspace-unknown', root);
    expect(map.projectType).toBe('unknown');
    expect(map.unavailable).toBeUndefined();
    expect(map.partial).toBeUndefined();
  });

  it('returns a partial result when the time budget expires before traversal', () => {
    const root = fixture();
    let tick = 0;
    const map = new RepoMapBuilder().build('workspace-timeout', root, { timeoutMs: 1, now: () => (tick++ === 0 ? 0 : 2) });
    expect(map.partial).toBe(true);
    expect(map.warnings).toEqual(expect.arrayContaining([expect.stringContaining('时间上限')]));
  });

  it('caches by workspace and canonical project root, with explicit refresh and clear support', () => {
    const root = fixture();
    let timestamp = 10;
    const builder = new RepoMapBuilder();
    const first = builder.build('workspace-cache', root, { now: () => timestamp });
    timestamp = 20;
    expect(builder.build('workspace-cache', root, { now: () => timestamp }).generatedAt).toBe(10);
    expect(builder.build('workspace-cache', root, { now: () => timestamp, refresh: true }).generatedAt).toBe(20);
    timestamp = 30;
    builder.clear('workspace-cache');
    expect(builder.build('workspace-cache', root, { now: () => timestamp }).generatedAt).toBe(30);
    expect(first.workspaceRoot).toBe(root);
  });

  it('does not follow a symlink outside the authorized workspace', () => {
    const root = fixture();
    const outside = mkdtempSync(join(tmpdir(), 'starchat-repo-map-outside-'));
    writeFileSync(join(outside, 'outside.ts'), 'export const outside = true\n', 'utf8');
    try {
      symlinkSync(outside, join(root, 'linked-outside'), 'junction');
    } catch {
      // Windows may deny symlink creation; the guard's traversal tests still cover containment.
    }
    const map = new RepoMapBuilder().build('workspace-symlink', root);
    expect(map.importantFiles.some((file) => file.path.includes('linked-outside'))).toBe(false);
    expect(existsSync(join(outside, 'outside.ts'))).toBe(true);
  });

  it('returns an unavailable map instead of throwing for a missing workspace', () => {
    const map = new RepoMapBuilder().build('workspace-missing', join(tmpdir(), 'starchat-does-not-exist'));
    expect(map.unavailable).toBe(true);
    expect(map.partial).toBe(true);
    expect(map.warnings).toHaveLength(1);
  });
});
