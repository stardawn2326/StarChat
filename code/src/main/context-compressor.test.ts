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
});
