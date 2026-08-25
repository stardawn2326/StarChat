import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceGuard } from './agent-security';
import { createAgentTools, runVerification } from './agent-tools';

describe('agent explicit tool allowlist', () => {
  it('registers only the first-party structured tools and no shell/executable tool', () => {
    const root = mkdtempSync(join(tmpdir(), 'baoyin-agent-tools-'));
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src', 'a.txt'), 'a', 'utf8');
    const tools = createAgentTools(new WorkspaceGuard(root));
    expect(tools.map((tool) => tool.name)).toEqual([
      'list_directory', 'read_file', 'search_text', 'apply_patch', 'run_verification',
      'git_status', 'git_diff', 'request_user_approval', 'request_user_input'
    ]);
    expect(tools.some((tool) => /shell|exec|command|network|delete|move/i.test(tool.name))).toBe(false);
    expect(tools.find((tool) => tool.name === 'apply_patch')?.requiresApproval).toBe(true);
  });

  it('runs only whitelisted project scripts without a shell and rejects arbitrary commands', async () => {
    const executor = vi.fn(async (_command: string, _args: string[], _cwd: string, _signal: AbortSignal) => ({ code: 0, output: 'ok' }));
    await expect(runVerification('C:/workspace', 'typecheck', new AbortController().signal, executor)).resolves.toMatchObject({ script: 'typecheck', ok: true });
    expect(executor).toHaveBeenCalledWith(expect.stringMatching(/pnpm(\.cmd)?/), ['run', 'typecheck'], 'C:/workspace', expect.any(AbortSignal));
    expect(() => runVerification('C:/workspace', 'install', new AbortController().signal, executor)).toThrow(/不允许运行脚本/);
  });
});
