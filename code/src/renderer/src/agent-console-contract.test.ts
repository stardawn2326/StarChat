import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AgentTask } from '../../shared/agent';
import { AGENT_TASK_STATUS_LABELS, estimateContextUsage } from './agent-ui-model';
import { AgentTaskPanel } from './AgentTaskPanel';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const task: AgentTask = {
  id: 'task-1',
  sessionId: 'session-1',
  roleId: 'baoyin.default',
  message: '检查项目并汇总结果',
  mode: 'agent',
  route: { route: 'agent', method: 'forced', explain: '用户明确选择 Agent' },
  status: 'waiting_for_approval',
  createdAt: 1,
  updatedAt: 2,
  currentStep: 2,
  steps: [
    { id: 'step-1', taskId: 'task-1', index: 0, kind: 'route', status: 'completed', summary: '已路由到 Agent', createdAt: 1, finishedAt: 1 },
    { id: 'step-2', taskId: 'task-1', index: 1, kind: 'tool', status: 'waiting', summary: '读取项目清单', createdAt: 2, invocationId: 'invoke-1' }
  ],
  invocations: [{ id: 'invoke-1', taskId: 'task-1', name: 'apply_patch', arguments: '不得出现在界面', status: 'waiting_for_approval', createdAt: 2, summary: '等待许可后修改文件' }],
  approval: { id: 'approval-1', taskId: 'task-1', invocationId: 'invoke-1', toolName: 'apply_patch', target: 'src/a.ts', plan: '将更新 1 个文件。', preview: { files: ['src/a.ts'], patch: '*** Begin Patch\n-old\n+new\n*** End Patch', additions: 1, deletions: 1 }, createdAt: 2 }
};

const rendererDirectory = resolve(import.meta.dirname);

describe('StarChat Agent console contracts', () => {
  it('has an explicit Chinese label for every runtime task state', () => {
    expect(Object.keys(AGENT_TASK_STATUS_LABELS)).toHaveLength(9);
    expect(AGENT_TASK_STATUS_LABELS.queued.label).toBe('排队中');
    expect(AGENT_TASK_STATUS_LABELS.running.label).toBe('执行中');
    expect(AGENT_TASK_STATUS_LABELS.waiting_for_approval.label).toBe('等待许可');
    expect(AGENT_TASK_STATUS_LABELS.waiting_for_input.label).toBe('等待补充信息');
    expect(AGENT_TASK_STATUS_LABELS.completed.label).toBe('已完成');
    expect(AGENT_TASK_STATUS_LABELS.failed.label).toBe('执行失败');
    expect(AGENT_TASK_STATUS_LABELS.cancelled.label).toBe('已取消');
    expect(AGENT_TASK_STATUS_LABELS.timed_out.label).toBe('已超时');
    expect(AGENT_TASK_STATUS_LABELS.interrupted.label).toBe('已中断');
  });

  it('renders every runtime task state in the task panel', () => {
    for (const status of Object.keys(AGENT_TASK_STATUS_LABELS) as Array<AgentTask['status']>) {
      const markup = renderToStaticMarkup(createElement(AgentTaskPanel, { task: { ...task, status }, onCancel: () => undefined }));
      expect(markup, status).toContain(AGENT_TASK_STATUS_LABELS[status].label);
    }
  });

  it('marks context usage as a local estimate instead of claiming token telemetry', () => {
    expect(estimateContextUsage([{ content: 'a'.repeat(120) }], 'b'.repeat(80))).toEqual({ characters: 200, percent: 2 });
  });

  it('renders a read-only timeline and tool summary without exposing tool arguments', () => {
    const markup = renderToStaticMarkup(createElement(AgentTaskPanel, { task, onApprove: () => undefined, onCancel: () => undefined }));
    expect(markup).toContain('data-agent-ui="task-panel"');
    expect(markup).toContain('当前步骤');
    expect(markup).toContain('步骤时间线');
    expect(markup).toContain('工具调用');
    expect(markup).toContain('apply_patch');
    expect(markup).toContain('等待许可后修改文件');
    expect(markup).not.toContain('不得出现在界面');
    expect(markup).toContain('批准并写入');
    expect(markup).toContain('*** Begin Patch');
    expect(markup).toContain('src/a.ts');
  });

  it('renders a keyboard-friendly supplementary input request', () => {
    const waitingTask: AgentTask = {
      ...task,
      status: 'waiting_for_input',
      approval: undefined,
      input: { id: 'input-1', taskId: 'task-1', invocationId: 'invoke-1', prompt: '请告诉我需要检查的目录。', createdAt: 2 }
    };
    const markup = renderToStaticMarkup(createElement(AgentTaskPanel, { task: waitingTask, onRespond: () => undefined }));
    expect(markup).toContain('aria-label="补充 Agent 信息"');
    expect(markup).toContain('继续');
    expect(markup).toContain('请告诉我需要检查的目录。');
  });

  it('keeps the central console on real Agent UI and preserves themed surfaces', () => {
    const appSource = readFileSync(resolve(rendererDirectory, 'App.tsx'), 'utf8');
    const chatSource = readFileSync(resolve(rendererDirectory, 'CompanionChat.tsx'), 'utf8');
    const stylesheet = readFileSync(resolve(rendererDirectory, 'settings-center.css'), 'utf8');
    expect(appSource).toContain('AgentConsole');
    for (const token of ['data-agent-ui="messages"', 'data-agent-ui="attachments"', '上下文占用', '发送消息']) expect(chatSource).toContain(token);
    expect(stylesheet).toContain('.agent-console');
    expect(stylesheet).toContain('var(--theme-window-gradient)');
    expect(stylesheet).toContain('var(--theme-surface)');
    expect(stylesheet).not.toMatch(/\.agent-console[^}]*#[0-9a-f]{3,8}/iu);
  });
});
