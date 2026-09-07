import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceGuard } from './agent-security';
import { createAgentTools, runVerification } from './agent-tools';

describe('agent explicit tool allowlist', () => {
  it('registers only the first-party structured tools and no shell/executable tool', () => {
    const root = mkdtempSync(join(tmpdir(), 'starchat-agent-tools-'));
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src', 'a.txt'), 'a', 'utf8');
    const tools = createAgentTools(new WorkspaceGuard(root));
    expect(tools.map((tool) => tool.name)).toEqual([
      'list_directory', 'read_file', 'search_text', 'git_status', 'git_diff',
      'request_user_approval', 'request_user_input', 'apply_patch', 'apply_file_changes', 'run_verification'
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

  it('exposes the exact bounded patch and line counts before approval', () => {
    const root = mkdtempSync(join(tmpdir(), 'starchat-agent-preview-'));
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src', 'a.txt'), 'before\n', 'utf8');
    const patch = '*** Begin Patch\n*** Update File: src/a.txt\n@@\n-before\n+after\n*** End Patch';
    const applyPatch = createAgentTools(new WorkspaceGuard(root)).find((tool) => tool.name === 'apply_patch');

    expect(applyPatch?.approval?.({ patch })).toMatchObject({
      target: 'src/a.txt',
      preview: { files: ['src/a.txt'], patch, additions: 1, deletions: 1 }
    });
  });

  it('registers tools from the trust matrix instead of inferring write intent from prose', () => {
    const root = mkdtempSync(join(tmpdir(), 'starchat-agent-tools-matrix-'));
    const names = (options: Parameters<typeof createAgentTools>[2]) => createAgentTools(new WorkspaceGuard(root), runVerification, options).map((tool) => tool.name);
    expect(names({ allowWrite: false, allowExecution: false })).toEqual([
      'list_directory', 'read_file', 'search_text', 'git_status', 'git_diff', 'request_user_approval', 'request_user_input'
    ]);
    expect(names({ allowWrite: true, allowExecution: false })).toContain('apply_patch');
    expect(names({ allowWrite: true, allowExecution: true })).toContain('run_verification');
    expect(names({ allowWrite: false, allowExecution: false })).not.toContain('run_verification');
  });

  it('reserves a write only after a valid preview reaches the approval boundary', () => {
    const root = mkdtempSync(join(tmpdir(), 'starchat-agent-tools-reservation-'));
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src', 'a.txt'), 'before\n', 'utf8');
    const beforeWrite = vi.fn();
    const applyPatch = createAgentTools(new WorkspaceGuard(root), runVerification, { beforeWrite })
      .find((tool) => tool.name === 'apply_patch');
    expect(() => applyPatch?.approval?.({ patch: 'not a patch' })).toThrow();
    expect(beforeWrite).not.toHaveBeenCalled();
    const patch = '*** Begin Patch\n*** Update File: src/a.txt\n@@\n-before\n+after\n*** End Patch';
    applyPatch?.approval?.({ patch }, { taskId: 'task', invocationId: 'call', signal: new AbortController().signal });
    expect(beforeWrite).toHaveBeenCalledWith('apply_patch', expect.objectContaining({ taskId: 'task', invocationId: 'call' }));
  });
});
