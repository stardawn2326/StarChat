import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { formatWorkbenchShare, inspectWorkbench, previewWorkbenchFile, readWorkbenchDiff } from './workbench-service';

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('workbench service', () => {
  it('reads safe resources and omits sensitive entries', () => {
    const root = mkdtempSync(join(tmpdir(), 'starchat-workbench-'));
    temporaryRoots.push(root);
    writeFileSync(join(root, 'README.md'), 'safe', 'utf8');
    writeFileSync(join(root, '.env'), 'TOKEN=secret', 'utf8');
    writeFileSync(join(root, 'api-key.txt'), 'secret', 'utf8');

    const inspection = inspectWorkbench(root, 'resources');
    expect(inspection.environment.gitStatus).toBe('unavailable');
    expect(inspection.resources?.map((entry) => entry.path)).toEqual(['README.md']);
    expect(formatWorkbenchShare(inspection).text).toContain('Git：不可用');
  });

  it('reports the actual repository state without inventing a branch', () => {
    const inspection = inspectWorkbench(resolve(import.meta.dirname, '../../..'), 'source');
    expect(inspection.source).toBeDefined();
    expect(inspection.environment.gitRoot).not.toBeNull();
    expect(['clean', 'changed', 'detached', 'unavailable']).toContain(inspection.environment.gitStatus);
    expect(formatWorkbenchShare(inspection).text).toContain(`工作区：${inspection.environment.workspaceRoot}`);
  });

  it('navigates nested workspace directories while keeping paths relative', () => {
    const root = mkdtempSync(join(tmpdir(), 'starchat-workbench-tree-'));
    temporaryRoots.push(root);
    mkdirSync(join(root, 'src', 'nested'), { recursive: true });
    writeFileSync(join(root, 'src', 'nested', 'index.ts'), 'export const value = 1;\n', 'utf8');

    const inspection = inspectWorkbench(root, 'resources', 'src/nested');
    expect(inspection.resourcePath).toBe('src/nested');
    expect(inspection.resourceParentPath).toBe('src');
    expect(inspection.resources).toEqual([{ path: 'src/nested/index.ts', kind: 'file' }]);
  });

  it('rejects a nested directory when its Git root is outside the authorized workspace', () => {
    const root = mkdtempSync(join(tmpdir(), 'starchat-workbench-boundary-'));
    temporaryRoots.push(root);
    mkdirSync(join(root, 'nested'), { recursive: true });
    execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });

    expect(() => inspectWorkbench(join(root, 'nested'), 'source')).toThrow(/Git 根目录必须与已授权工作区一致/);
  });

  it('previews safe text files with bounded metadata and rejects path escape', () => {
    const root = mkdtempSync(join(tmpdir(), 'starchat-workbench-preview-'));
    temporaryRoots.push(root);
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src', 'view.tsx'), 'export function View() { return <main />; }\n', 'utf8');

    expect(previewWorkbenchFile(root, 'src/view.tsx')).toMatchObject({
      path: 'src/view.tsx', language: 'tsx', lineCount: 2, truncated: false
    });
    expect(previewWorkbenchFile(root, 'src/view.tsx').content).toContain('function View');
    expect(() => previewWorkbenchFile(root, '../outside.txt')).toThrow(/授权工作区/);
  });

  it('returns a bounded read-only diff for one changed file', () => {
    const root = mkdtempSync(join(tmpdir(), 'starchat-workbench-diff-'));
    temporaryRoots.push(root);
    execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'starchat@example.invalid'], { cwd: root });
    execFileSync('git', ['config', 'user.name', 'StarChat Test'], { cwd: root });
    writeFileSync(join(root, 'README.md'), 'before\n', 'utf8');
    execFileSync('git', ['add', 'README.md'], { cwd: root });
    execFileSync('git', ['commit', '-m', 'baseline'], { cwd: root, stdio: 'ignore' });
    writeFileSync(join(root, 'README.md'), 'after\n', 'utf8');

    const result = readWorkbenchDiff(root, 'README.md');
    expect(result.path).toBe('README.md');
    expect(result.patch).toContain('-before');
    expect(result.patch).toContain('+after');
    expect(result.truncated).toBe(false);
    expect(() => readWorkbenchDiff(root, '../outside.txt')).toThrow(/授权工作区/);
  });
});
