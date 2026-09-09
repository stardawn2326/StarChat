import { describe, expect, it, vi } from 'vitest';
import type { AgentModelMessage } from '../shared/agent';
import { AgentRuntime } from './agent-runtime';
import { ChangeSetApplyError } from './change-set';

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

  it('compresses bounded tool facts after the message or output threshold and reports real compactions', async () => {
    let calls = 0;
    let compactions = 0;
    const complete = vi.fn(async (_messages: unknown) => {
      calls += 1;
      if (calls <= 5) return { type: 'tool_calls' as const, calls: [{ id: `read-${calls}`, name: 'read', arguments: JSON.stringify({ path: `src/file-${calls}.ts` }) }] };
      return { type: 'final' as const, content: '已完成' };
    });
    const runtime = new AgentRuntime({
      model: { complete },
      tools: [tool('read', async () => '受控工具输出')],
      onContextCompaction: () => { compactions += 1; }
    });

    await expect(runtime.run({
      taskId: 'task-compress',
      message: '检查项目',
      repositoryContext: '受控仓库上下文\nProject: web\nSource roots:\n- src'
    })).resolves.toMatchObject({ status: 'completed' });

    expect(compactions).toBeGreaterThan(0);
    const compactedMessages = complete.mock.calls.map((call) => call[0] as unknown as Array<{ role: string; content: string }>).find((messages) => messages.some((message) => message.content.includes('[受控任务上下文摘要]')));
    expect(compactedMessages).toBeDefined();
    expect(compactedMessages?.some((message) => message.content.includes('src/file-1.ts'))).toBe(true);
    expect(compactedMessages?.some((message) => message.content.includes('受控仓库上下文'))).toBe(true);
  });

  it('carries user clarification into a later compression after responding to input', async () => {
    let calls = 0;
    let compactedMessages: AgentModelMessage[] | undefined;
    const complete = vi.fn(async (messages: AgentModelMessage[]) => {
      if (messages.some((message) => message.content.includes('[受控任务上下文摘要]'))) compactedMessages = messages;
      const call = calls++;
      if (call === 0) return { type: 'tool_calls' as const, calls: [{ id: 'input-1', name: 'ask', arguments: '{}' }] };
      if (compactedMessages) return { type: 'final' as const, content: '已按澄清完成' };
      return { type: 'tool_calls' as const, calls: [{ id: `read-${call}`, name: 'read', arguments: '{}' }] };
    });
    const runtime = new AgentRuntime({
      model: { complete },
      tools: [
        { ...tool('ask', async () => ({ waiting: true })), requestsInput: true },
        tool('read', async () => '受控工具输出')
      ]
    });

    const waiting = await runtime.run({ taskId: 'task-input-compress', message: '确认修改范围' });
    expect(waiting.status).toBe('waiting_for_input');
    const result = await runtime.respond('只修改 src/a.ts，不要修改 src/b.ts');

    expect(result).toMatchObject({ status: 'completed' });
    expect(compactedMessages?.some((message) => message.content.includes('只修改 src/a.ts'))).toBe(true);
    expect(compactedMessages?.some((message) => message.content.includes('不要修改 src/b.ts'))).toBe(true);
    expect(compactedMessages?.some((message) => message.content.includes('"userInput"'))).toBe(false);
  });

  it('preserves critical facts through three cumulative compactions', async () => {
    const plan = [
      { name: 'read_file', args: { path: 'src/a.ts' } },
      { name: 'run_verification', args: { script: 'typecheck' } },
      { name: 'read_file', args: { path: 'src/a.ts' } },
      { name: 'read_file', args: { path: 'src/b.ts' } },
      { name: 'workspace_search', args: { mode: 'text', query: 'Foo' } },
      { name: 'run_verification', args: { script: 'test' } },
      { name: 'read_file', args: { path: 'src/c.ts' } },
      { name: 'workspace_search', args: { mode: 'symbol-lite', query: 'Bar' } },
      { name: 'read_file', args: { path: 'src/d.ts' } }
    ];
    let calls = 0;
    let compactions = 0;
    const summaries: string[] = [];
    const seenSummaries = new Set<string>();
    const complete = vi.fn(async (messages: AgentModelMessage[]) => {
      const summary = messages.find((message) => message.content.includes('[受控任务上下文摘要]'))?.content;
      if (summary && !seenSummaries.has(summary)) {
        seenSummaries.add(summary);
        summaries.push(summary);
      }
      const step = plan[calls++];
      if (!step) return { type: 'final' as const, content: '多阶段任务已完成' };
      return { type: 'tool_calls' as const, calls: [{ id: `step-${calls}`, name: step.name, arguments: JSON.stringify(step.args) }] };
    });
    const runtime = new AgentRuntime({
      model: { complete },
      maxSteps: 12,
      tools: [
        tool('read_file', async (args) => {
          if ((args as { path?: string }).path === 'src/a.ts') throw new Error('TS1111');
          return `read ${(args as { path?: string }).path ?? 'unknown'}`;
        }),
        tool('run_verification', async (args) => {
          const script = (args as { script?: string }).script ?? 'unknown';
          return { script, ok: script !== 'typecheck', output: script === 'typecheck' ? 'TS1111' : 'all tests passed' };
        }),
        tool('workspace_search', async (args) => ({ query: (args as { query?: string }).query ?? '', matches: 1 }))
      ],
      onContextCompaction: () => { compactions += 1; }
    });

    await expect(runtime.run({ taskId: 'task-three-compactions', message: '追踪多阶段任务' })).resolves.toMatchObject({ status: 'completed' });

    expect(compactions).toBe(3);
    expect(summaries).toHaveLength(3);
    expect(summaries[0]).toContain('TS1111');
    expect(summaries[1]).toContain('TS1111');
    expect(summaries[1]).toContain('typecheck: failed');
    expect(summaries[1]).toContain('src/a.ts');
    expect(summaries[1]).toContain('src/b.ts');
    expect(summaries[1]).toContain('test: passed');
    expect(summaries[2]).toContain('src/a.ts');
    expect(summaries[2]).toContain('src/b.ts');
    expect(summaries[2]).toContain('src/c.ts');
    expect(summaries[2]).toContain('src/d.ts');
    expect(summaries[2]).toContain('typecheck: failed');
  });

  it('stops after a partial ChangeSet failure instead of continuing the model loop', async () => {
    const complete = vi.fn().mockResolvedValueOnce({ type: 'tool_calls' as const, calls: [{ id: 'write-1', name: 'write', arguments: '{}' }] }).mockResolvedValue({ type: 'final' as const, content: '不应继续' });
    const runtime = new AgentRuntime({
      model: { complete },
      tools: [{
        ...tool('write', async () => ({ ok: true })),
        requiresApproval: true,
        approval: () => ({ target: 'src/a.ts', plan: '更新 src/a.ts' }),
        runApproved: async () => {
          throw new ChangeSetApplyError('partial-failure', '变更集应用失败（partial-failure）', ['src/a.ts'], ['恢复备份失败']);
        }
      }]
    });

    const waiting = await runtime.run({ taskId: 'task-partial-failure', message: '修改文件' });
    expect(waiting.status).toBe('waiting_for_approval');
    const result = await runtime.approve(true);

    expect(result).toMatchObject({ status: 'failed', writeFailure: { state: 'partial-failure', affectedPaths: ['src/a.ts'], rollbackFailures: ['恢复备份失败'] } });
    expect(complete).toHaveBeenCalledTimes(1);
  });
});
