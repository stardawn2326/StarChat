import { describe, expect, it } from 'vitest';
import { runControlledProcess } from './process-runner';

describe('controlled process runner', () => {
  it('caps output and requires an explicit command allowlist', async () => {
    const command = process.execPath;
    const output = await runControlledProcess({
      command,
      args: ['-p', `"${'x'.repeat(2048)}"`],
      cwd: process.cwd(),
      allowedCommands: [command],
      maxOutputBytes: 1024
    });

    expect(output.code).toBe(0);
    expect(output.output.length).toBe(1024);
    expect(output.truncated).toBe(true);
    expect(() => runControlledProcess({ command, args: [], cwd: process.cwd(), allowedCommands: ['git'] })).toThrow(/白名单/);
  });

  it('rejects shell metacharacters in arguments before spawning', async () => {
    expect(() => runControlledProcess({
      command: process.execPath,
      args: ['-p', '"safe"&"blocked"'],
      cwd: process.cwd(),
      allowedCommands: [process.execPath]
    })).toThrow(/不允许/);
  });
});
