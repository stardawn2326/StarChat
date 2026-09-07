import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalDirectory, sameDirectory } from './path-identity';

describe('Windows-compatible directory identity', () => {
  it('normalizes slash and trailing separator differences without collapsing parents', () => {
    const root = mkdtempSync(join(tmpdir(), 'starchat-path-identity-'));
    const child = join(root, 'child');
    mkdirSync(child);
    expect(sameDirectory(root, `${root}\\`)).toBe(true);
    expect(sameDirectory(root, child)).toBe(false);
  });

  it('keeps two different repositories distinct', () => {
    const left = mkdtempSync(join(tmpdir(), 'starchat-path-repo-left-'));
    const right = mkdtempSync(join(tmpdir(), 'starchat-path-repo-right-'));
    execFileSync(process.platform === 'win32' ? 'git.exe' : 'git', ['init'], { cwd: left, stdio: 'ignore' });
    execFileSync(process.platform === 'win32' ? 'git.exe' : 'git', ['init'], { cwd: right, stdio: 'ignore' });
    expect(sameDirectory(left, right)).toBe(false);
  });

  it('resolves a junction or symlink to the same directory when the host permits it', () => {
    const root = mkdtempSync(join(tmpdir(), 'starchat-path-alias-'));
    const alias = join(tmpdir(), `starchat-path-alias-link-${Date.now()}`);
    try {
      symlinkSync(root, alias, process.platform === 'win32' ? 'junction' : 'dir');
    } catch {
      return;
    }
    expect(sameDirectory(root, alias)).toBe(true);
  });

  it('exposes a stable identity record for an existing directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'starchat-path-record-'));
    const identity = canonicalDirectory(root);
    expect(identity.path).toBeTruthy();
    expect(() => canonicalDirectory(join(root, 'missing'))).toThrow();
  });
});
