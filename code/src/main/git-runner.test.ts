import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { GitRunner, resetGitExecutableCacheForTests, resolveGitExecutable } from './git-runner';

function git(root: string, args: string[]): void {
  execFileSync(process.platform === 'win32' ? 'git.exe' : 'git', args, { cwd: root, stdio: 'ignore', windowsHide: true });
}

describe('controlled Git runner', () => {
  it('resolves Git to an absolute file and validates an explicit override', () => {
    const original = process.env.STARCHAT_GIT_EXECUTABLE;
    try {
      delete process.env.STARCHAT_GIT_EXECUTABLE;
      resetGitExecutableCacheForTests();
      expect(resolveGitExecutable()).toMatch(/(?:^|[\\/])git(?:\.exe)?$/iu);
      expect(isAbsolute(resolveGitExecutable())).toBe(true);
      process.env.STARCHAT_GIT_EXECUTABLE = resolveGitExecutable();
      resetGitExecutableCacheForTests();
      expect(resolveGitExecutable()).toBeTruthy();
      process.env.STARCHAT_GIT_EXECUTABLE = join(tmpdir(), 'missing-git.exe');
      resetGitExecutableCacheForTests();
      expect(() => resolveGitExecutable()).toThrow(/必须是存在的 Git/);
    } finally {
      if (original === undefined) delete process.env.STARCHAT_GIT_EXECUTABLE;
      else process.env.STARCHAT_GIT_EXECUTABLE = original;
      resetGitExecutableCacheForTests();
    }
  });

  it('allows bounded read-only inspection and rejects mutating arguments', () => {
    const root = mkdtempSync(join(tmpdir(), 'starchat-git-runner-read-'));
    git(root, ['init']);
    const runner = new GitRunner();
    expect(runner.readOnlySync(root, ['rev-parse', '--show-toplevel'])).toBeTruthy();
    expect(() => runner.readOnlySync(root, ['commit', '-m', 'no'])).toThrow(/只读白名单/);
  });

  it('commits only already-staged content inside the exact workspace root', async () => {
    const root = mkdtempSync(join(tmpdir(), 'starchat-git-runner-commit-'));
    git(root, ['init']);
    git(root, ['config', 'user.email', 'starchat@example.invalid']);
    git(root, ['config', 'user.name', 'StarChat Test']);
    writeFileSync(join(root, 'note.txt'), 'hello\n', 'utf8');
    git(root, ['add', 'note.txt']);
    const result = await new GitRunner().commit(root, 'baseline', new AbortController().signal);
    expect(result.code).toBe(0);
    expect(new GitRunner().readOnlySync(root, ['rev-parse', '--short', 'HEAD'])).toBeTruthy();
  });
});
