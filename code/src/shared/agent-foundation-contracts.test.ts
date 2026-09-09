import { describe, expect, it } from 'vitest';
import { cloneAgentTaskMetrics, EMPTY_AGENT_TASK_METRICS, incrementAgentTaskMetrics } from './agent-metrics';
import { taskContextStatusFromAgentStatus } from './task-context';

describe('agent foundation contracts', () => {
  it('starts metrics at zero and increments a copy without mutating the source', () => {
    const next = incrementAgentTaskMetrics({ ...EMPTY_AGENT_TASK_METRICS }, 'readFileCalls');
    expect(next.readFileCalls).toBe(1);
    expect(EMPTY_AGENT_TASK_METRICS.readFileCalls).toBe(0);
    expect(cloneAgentTaskMetrics({ ...next, writeCalls: Number.NaN })).toMatchObject({ readFileCalls: 1, writeCalls: 0 });
  });

  it('maps runtime waiting and terminal states to persisted context states', () => {
    expect(taskContextStatusFromAgentStatus('waiting_for_approval')).toBe('waiting-approval');
    expect(taskContextStatusFromAgentStatus('waiting_for_input')).toBe('waiting-input');
    expect(taskContextStatusFromAgentStatus('completed')).toBe('completed');
    expect(taskContextStatusFromAgentStatus('failed')).toBe('failed');
    expect(taskContextStatusFromAgentStatus('queued')).toBe('running');
  });
});
