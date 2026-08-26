import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { formatWorkbenchShare, inspectWorkbench } from './workbench-service';

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
    const inspection = inspectWorkbench(resolve(import.meta.dirname, '../..'), 'source');
    expect(inspection.source).toBeDefined();
    expect(inspection.environment.gitRoot).not.toBeNull();
    expect(['clean', 'changed', 'detached', 'unavailable']).toContain(inspection.environment.gitStatus);
    expect(formatWorkbenchShare(inspection).text).toContain(`工作区：${inspection.environment.workspaceRoot}`);
  });
});
