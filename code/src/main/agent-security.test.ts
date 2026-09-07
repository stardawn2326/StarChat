import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WorkspaceGuard } from './agent-security';

function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), 'starchat-agent-'));
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src', 'note.txt'), 'hello\nworld\n', 'utf8');
  return root;
}

describe('agent workspace security', () => {
  it('canonicalizes only relative paths inside the authorized root', () => {
    const root = workspace();
    const guard = new WorkspaceGuard(root);
    expect(guard.resolve('src/note.txt')).toBe(join(root, 'src', 'note.txt'));
    expect(() => guard.resolve('../outside.txt')).toThrow(/授权工作区/);
    expect(() => guard.resolve('..\\outside.txt')).toThrow(/授权工作区/);
    expect(() => guard.resolve('C:\\outside.txt')).toThrow(/授权工作区/);
    expect(() => guard.resolve('\\\\server\\share\\outside.txt')).toThrow(/授权工作区/);
  });

  it('rejects symlink escape, sensitive files, binary files and oversized text', () => {
    const root = workspace();
    const outside = mkdtempSync(join(tmpdir(), 'starchat-agent-outside-'));
    writeFileSync(join(outside, 'secret.txt'), 'do not read', 'utf8');
    let symlinkCreated = false;
    try {
      symlinkSync(join(outside, 'secret.txt'), join(root, 'src', 'link.txt'), 'file');
      symlinkCreated = true;
    } catch {
      // Windows without symlink privilege still exercises the other path gates below.
    }
    writeFileSync(join(root, '.env'), 'API_KEY=hidden', 'utf8');
    writeFileSync(join(root, 'src', 'binary.bin'), Buffer.from([0, 1, 2]));
    writeFileSync(join(root, 'src', 'large.txt'), 'x'.repeat(100));
    const guard = new WorkspaceGuard(root, { maxReadBytes: 32 });
    if (symlinkCreated) expect(() => guard.readText('src/link.txt')).toThrow(/授权工作区/);
    expect(() => guard.readText('.env')).toThrow(/敏感/);
    expect(() => guard.readText('src/binary.bin')).toThrow(/文本/);
    expect(() => guard.readText('src/large.txt')).toThrow(/大小/);
  });

  it('previews a patch without writing before approval and applies only the exact approved plan', () => {
    const root = workspace();
    const guard = new WorkspaceGuard(root);
    const patch = '*** Begin Patch\n*** Update File: src/note.txt\n@@\n hello\n-world\n+agent\n*** End Patch';
    const preview = guard.previewPatch(patch);
    expect(preview.files).toEqual(['src/note.txt']);
    expect(readFileSync(join(root, 'src', 'note.txt'), 'utf8')).toBe('hello\nworld\n');
    expect(() => guard.applyApprovedPatch(patch, patch.replace('agent', 'other'))).toThrow(/计划/);
    guard.applyApprovedPatch(patch, patch);
    expect(readFileSync(join(root, 'src', 'note.txt'), 'utf8')).toBe('hello\nagent\n');
  });

  it('previews and applies create, update and delete only after exact approval', () => {
    const root = workspace();
    writeFileSync(join(root, 'src', 'remove.txt'), 'remove me\n', 'utf8');
    const guard = new WorkspaceGuard(root);
    const changes = [
      { type: 'create' as const, path: 'src/new.txt', content: 'new file\n' },
      { type: 'update' as const, path: 'src/note.txt', content: 'updated file\n' },
      { type: 'delete' as const, path: 'src/remove.txt' }
    ];
    const preview = guard.previewFileChanges(changes);

    expect(preview.files).toEqual(['src/new.txt', 'src/note.txt', 'src/remove.txt']);
    expect(preview.patch).toContain('*** Create File: src/new.txt');
    expect(existsSync(join(root, 'src', 'new.txt'))).toBe(false);
    expect(() => guard.applyApprovedFileChanges(preview.plan, preview.plan.replace('updated file', 'tampered file'))).toThrow(/计划/);
    expect(readFileSync(join(root, 'src', 'note.txt'), 'utf8')).toBe('hello\nworld\n');

    guard.applyApprovedFileChanges(preview.plan, preview.plan);
    expect(readFileSync(join(root, 'src', 'new.txt'), 'utf8')).toBe('new file\n');
    expect(readFileSync(join(root, 'src', 'note.txt'), 'utf8')).toBe('updated file\n');
    expect(existsSync(join(root, 'src', 'remove.txt'))).toBe(false);
  });
});
