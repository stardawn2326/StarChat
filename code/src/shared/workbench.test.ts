import { describe, expect, it } from 'vitest';
import { workbenchGitStatusLabel, workbenchSessionMeta } from './workbench';

describe('workbench shared contracts', () => {
  it('keeps Git labels and honest single-session metadata deterministic', () => {
    expect(workbenchGitStatusLabel('clean')).toBe('工作树干净');
    expect(workbenchGitStatusLabel('changed')).toBe('有未提交变更');
    expect(workbenchGitStatusLabel('detached')).toBe('分离 HEAD');
    expect(workbenchGitStatusLabel('unavailable')).toBe('Git 不可用');
    expect(workbenchSessionMeta(0, false)).toBe('空会话');
    expect(workbenchSessionMeta(3, false)).toBe('3 条消息');
    expect(workbenchSessionMeta(3, true)).toBe('进行中');
  });
});
