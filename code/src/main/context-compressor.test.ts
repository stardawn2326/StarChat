import { describe, expect, it } from 'vitest';
import { buildCompressedTaskContext, compressMessages, formatCompressedTaskContext } from './context-compressor';

describe('bounded task context compression', () => {
  it('keeps auditable paths, operations, errors, verification and constraints without file contents', () => {
    const messages = [
      { role: 'system' as const, content: '系统规则' },
      { role: 'user' as const, content: '修复 src/main.ts 并保留错误编号' },
      {
        role: 'assistant' as const,
        content: '这是模型内部推理，不应进入摘要',
        toolCalls: [{
          id: 'changes', name: 'apply_file_changes', arguments: JSON.stringify({ changes: [
            { type: 'create', path: 'src/new.ts', content: 'private file content' },
            { type: 'delete', path: 'src/old.ts' }
          ] })
        }]
      },
      { role: 'tool' as const, toolCallId: 'changes', content: '工具执行错误：TS2345 at src/main.ts' },
      { role: 'assistant' as const, content: '', toolCalls: [{ id: 'verify', name: 'run_verification', arguments: '{"script":"typecheck"}' }] },
      { role: 'tool' as const, toolCallId: 'verify', content: JSON.stringify({ script: 'typecheck', ok: false, output: 'TS2345: type mismatch' }) }
    ];

    const context = buildCompressedTaskContext({
      messages,
      repositoryContext: '受控仓库上下文\nProject: electron\nSource roots:\n- src',
      constraints: ['不要修改 API', '写入前必须审批']
    });
    const summary = formatCompressedTaskContext(context);

    expect(summary).toContain('src/new.ts');
    expect(summary).toContain('create: src/new.ts');
    expect(summary).toContain('delete: src/old.ts');
    expect(summary).toContain('TS2345');
    expect(summary).toContain('typecheck: failed');
    expect(summary).toContain('不要修改 API');
    expect(summary).not.toContain('模型内部推理');
    expect(summary).not.toContain('private file content');
  });

  it('compacts only when a configured threshold is reached and keeps the original context otherwise', () => {
    const messages = [
      { role: 'system' as const, content: '系统规则' },
      { role: 'user' as const, content: '检查项目' },
      { role: 'assistant' as const, content: '步骤', toolCalls: [] }
    ];
    expect(compressMessages({ messages }, { messageThreshold: 10 }).compacted).toBe(false);
    const result = compressMessages({ messages }, { messageThreshold: 3 });
    expect(result.compacted).toBe(true);
    expect(result.messages.some((message) => message.content.includes('[受控任务上下文摘要]'))).toBe(true);
  });

  it('classifies completed, failed, rejected and still-waiting writes by tool lifecycle', () => {
    const messages = [
      { role: 'user' as const, content: '处理文件变更' },
      {
        role: 'assistant' as const,
        content: '',
        toolCalls: [
          { id: 'completed-write', name: 'apply_file_changes', arguments: JSON.stringify({ changes: [{ type: 'update', path: 'src/done.ts', content: 'done' }] }) },
          { id: 'failed-write', name: 'apply_file_changes', arguments: JSON.stringify({ changes: [{ type: 'update', path: 'src/failed.ts', content: 'failed' }] }) },
          { id: 'rejected-write', name: 'apply_patch', arguments: JSON.stringify({ patch: '*** Begin Patch\n*** Update File: src/rejected.ts\n@@\n-old\n+new\n*** End Patch' }) },
          { id: 'waiting-write', name: 'apply_file_changes', arguments: JSON.stringify({ changes: [{ type: 'delete', path: 'src/waiting.ts' }] }) }
        ]
      },
      { role: 'tool' as const, toolCallId: 'completed-write', content: JSON.stringify({ files: ['src/done.ts'] }) },
      { role: 'tool' as const, toolCallId: 'failed-write', content: '工具执行错误：写入失败' },
      { role: 'tool' as const, toolCallId: 'rejected-write', content: '用户拒绝了这次精确计划，禁止执行写入。' }
    ];

    const result = compressMessages({ messages }, { messageThreshold: 1 });

    expect(result.compacted).toBe(true);
    expect(result.context.pendingChanges).toEqual(['delete: src/waiting.ts']);
    expect(result.context.decisions).toEqual(expect.arrayContaining([
      'applied update: src/done.ts',
      'user rejected update: src/rejected.ts'
    ]));
    expect(result.context.findings).toEqual(expect.arrayContaining([
      expect.stringContaining('failed update: src/failed.ts')
    ]));
    expect(result.context.toolLifecycle).toEqual(expect.arrayContaining([
      expect.objectContaining({ toolCallId: 'completed-write', state: 'completed' }),
      expect.objectContaining({ toolCallId: 'failed-write', state: 'failed' }),
      expect.objectContaining({ toolCallId: 'rejected-write', state: 'rejected' }),
      expect.objectContaining({ toolCallId: 'waiting-write', state: 'requested' })
    ]));
  });

  it('keeps multiple user clarifications bounded, readable and redacted', () => {
    const messages = [
      { role: 'user' as const, content: '等待用户补充' },
      ...Array.from({ length: 22 }, (_, index) => [
        {
          role: 'assistant' as const,
          content: '',
          toolCalls: [{ id: `input-${index}`, name: 'request_user_input', arguments: JSON.stringify({ prompt: '请补充范围' }) }]
        },
        {
          role: 'tool' as const,
          toolCallId: `input-${index}`,
          content: JSON.stringify({ userInput: index === 0 ? 'API Key: sk-sensitive-key-1234567890' : `补充约束 ${index}` })
        }
      ]).flat()
    ];

    const context = buildCompressedTaskContext({ messages });
    const summary = formatCompressedTaskContext(context);

    expect(context.constraints).toHaveLength(20);
    expect(context.constraints[0]).toContain('[REDACTED_API_KEY]');
    expect(context.constraints).toContain('User clarification: 补充约束 1');
    expect(summary).not.toContain('"userInput"');
    expect(summary).not.toContain('sk-sensitive-key-1234567890');
  });
});
