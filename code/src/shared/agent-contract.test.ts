import { describe, expect, it } from 'vitest';
import {
  AGENT_MODE_OPTIONS,
  AGENT_TASK_STATUSES,
  isAgentMode,
  isAgentTaskStatus,
  sanitizeAgentStartRequest
} from './agent';

describe('agent shared contract', () => {
  it('exposes the three persisted routing modes and task lifecycle', () => {
    expect(AGENT_MODE_OPTIONS.map((item) => item.value)).toEqual(['auto', 'companion', 'agent']);
    expect(AGENT_TASK_STATUSES).toEqual([
      'queued', 'running', 'waiting_for_approval', 'waiting_for_input',
      'completed', 'failed', 'cancelled', 'timed_out', 'interrupted'
    ]);
    expect(isAgentMode('agent')).toBe(true);
    expect(isAgentMode('shell')).toBe(false);
    expect(isAgentTaskStatus('waiting_for_approval')).toBe(true);
  });

  it('sanitizes a start request without accepting arbitrary fields or oversized input', () => {
    expect(sanitizeAgentStartRequest({ message: '  inspect the project  ', mode: 'agent', extra: 'ignored' })).toEqual({
      message: 'inspect the project',
      mode: 'agent'
    });
    expect(() => sanitizeAgentStartRequest({ message: 'x'.repeat(20_001), mode: 'agent' })).toThrow(/过长/);
    expect(() => sanitizeAgentStartRequest({ message: 'read it', mode: 'shell' })).toThrow(/模式/);
  });
});
