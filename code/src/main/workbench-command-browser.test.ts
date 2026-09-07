import { describe, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';
import { normalizeWorkbenchUrl, runWorkbenchCommand } from './workbench-service';

describe('bounded terminal and browser workbench services', () => {
  it('normalizes only http and https browser targets', () => {
    expect(normalizeWorkbenchUrl('example.com')).toBe('https://example.com/');
    expect(normalizeWorkbenchUrl('https://openai.com/docs')).toBe('https://openai.com/docs');
    expect(() => normalizeWorkbenchUrl('file:///C:/secret.txt')).toThrow(/http/i);
    expect(() => normalizeWorkbenchUrl('javascript:alert(1)')).toThrow(/http/i);
  });

  it('runs only bounded real commands in the authorized workspace', async () => {
    const executor = vi.fn(async () => ({ code: 0, output: 'ok' }));
    const workspaceRoot = resolve(import.meta.dirname, '../../..');
    await expect(runWorkbenchCommand(workspaceRoot, 'git status --short', new AbortController().signal, executor)).resolves.toMatchObject({ ok: true, command: 'git status --short', output: 'ok' });
    expect(executor).toHaveBeenCalledWith('git', ['status', '--short'], workspaceRoot, expect.any(AbortSignal));
    await expect(runWorkbenchCommand(import.meta.dirname, 'Remove-Item anything', new AbortController().signal, executor)).rejects.toThrow(/不在受控白名单/);
  });
});
