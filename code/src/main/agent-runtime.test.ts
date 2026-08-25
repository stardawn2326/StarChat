import { describe, expect, it, vi } from 'vitest';
import { AgentRuntime } from './agent-runtime';

function tool(name: string, run: (args: unknown) => Promise<unknown>) {
  return { name, description: name, schema: { type: 'object' }, run };
}

describe('agent model-tool runtime', () => {
  it('supports a no-tool final answer and preserves tool-call/result pairing across multiple steps', async () => {
    const complete = vi.fn()
      .mockResolvedValueOnce({ type: 'tool_calls', calls: [{ id: 'call-1', name: 'read', arguments: '{"path":"a"}' }] })
      .mockResolvedValueOnce({ type: 'tool_calls', calls: [{ id: 'call-2', name: 'read', arguments: '{"path":"b"}' }] })
      .mockResolvedValueOnce({ type: 'final', content: '已完成' });
    const runtime = new AgentRuntime({ model: { complete }, tools: [tool('read', async (args) => ({ ok: true, args }))] });
    const result = await runtime.run({ taskId: 'task-1', message: '处理两个文件' });
    expect(result.status).toBe('completed');
    if (result.status === 'completed') expect(result.result.summary).toBe('已完成');
    expect(complete).toHaveBeenCalledTimes(3);
    const secondMessages = complete.mock.calls[1][0] as Array<{ role: string; toolCallId?: string }>;
    expect(secondMessages.at(-1)).toMatchObject({ role: 'tool', toolCallId: 'call-1' });
  });

  it('returns tool errors to the model, rejects malformed calls, and enforces max steps', async () => {
    const complete = vi.fn()
      .mockResolvedValueOnce({ type: 'tool_calls', calls: [{ id: 'bad', name: 'missing', arguments: '{}' }] })
      .mockResolvedValue({ type: 'tool_calls', calls: [{ id: 'loop', name: 'read', arguments: '{}' }] });
    const runtime = new AgentRuntime({ model: { complete }, tools: [tool('read', async () => { throw new Error('denied'); })], maxSteps: 2 });
    const result = await runtime.run({ taskId: 'task-2', message: 'loop' });
    expect(result.status).toBe('failed');
    if (result.status === 'failed') expect(result.error).toMatch(/maxSteps|步数|工具/);
    const messages = complete.mock.calls[1][0] as Array<{ role: string; content?: string }>;
    expect(messages.some((item) => item.role === 'tool' && item.content?.includes('不存在'))).toBe(true);
  });

  it('pauses for approval/input, resumes, and cleans timers after cancel or timeout', async () => {
    let release: (() => void) | undefined;
    const complete = vi.fn().mockResolvedValueOnce({ type: 'tool_calls', calls: [{ id: 'approve-1', name: 'write', arguments: '{}' }] });
    const runtime = new AgentRuntime({ model: { complete }, tools: [{ ...tool('write', async () => ({ ok: true })), requiresApproval: true }], overallTimeoutMs: 1000 });
    const waiting = await runtime.run({ taskId: 'task-3', message: 'write' });
    expect(waiting.status).toBe('waiting_for_approval');
    if (waiting.status === 'waiting_for_approval') expect(waiting.approval.invocationId).toBe('approve-1');

    const inputRuntime = new AgentRuntime({
      model: { complete: vi.fn().mockResolvedValueOnce({ type: 'tool_calls', calls: [{ id: 'input-1', name: 'ask', arguments: '{}' }] }) },
      tools: [{ ...tool('ask', async () => ({ waiting: true })), requestsInput: true }]
    });
    const input = await inputRuntime.run({ taskId: 'task-4', message: 'ask' });
    expect(input.status).toBe('waiting_for_input');
    if (input.status === 'waiting_for_input') expect(input.input.invocationId).toBe('input-1');

    const abort = new AbortController();
    const slow = new AgentRuntime({
      model: { complete: () => new Promise<never>((_resolve, reject) => { release = () => reject(new DOMException('aborted', 'AbortError')); }) },
      tools: [], overallTimeoutMs: 20
    });
    const pending = slow.run({ taskId: 'task-5', message: 'cancel', signal: abort.signal });
    abort.abort();
    release?.();
    await expect(pending).resolves.toMatchObject({ status: 'cancelled' });
  });
});
