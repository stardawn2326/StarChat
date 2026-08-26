import type { AgentTask, AgentTaskStatus } from '../../shared/agent';

export type AgentStatusTone = 'neutral' | 'active' | 'waiting' | 'success' | 'danger';

export interface AgentTaskStatusLabel {
  label: string;
  description: string;
  tone: AgentStatusTone;
}

export const AGENT_TASK_STATUS_LABELS: Readonly<Record<AgentTaskStatus, AgentTaskStatusLabel>> = {
  queued: { label: '排队中', description: '任务已进入安全 Agent 队列。', tone: 'neutral' },
  running: { label: '执行中', description: 'Agent 正在按步骤处理当前任务。', tone: 'active' },
  waiting_for_approval: { label: '等待许可', description: '执行下一步前需要你确认计划。', tone: 'waiting' },
  waiting_for_input: { label: '等待补充信息', description: 'Agent 需要你补充一项信息才能继续。', tone: 'waiting' },
  completed: { label: '已完成', description: '任务已完成并生成结果摘要。', tone: 'success' },
  failed: { label: '执行失败', description: '任务未能完成，请查看失败原因。', tone: 'danger' },
  cancelled: { label: '已取消', description: '任务已按你的要求停止。', tone: 'neutral' },
  timed_out: { label: '已超时', description: '任务超过安全执行时限，已停止。', tone: 'danger' },
  interrupted: { label: '已中断', description: '应用重启后未继续执行该任务。', tone: 'danger' }
};

const ACTIVE_STATUSES: readonly AgentTaskStatus[] = ['queued', 'running', 'waiting_for_approval', 'waiting_for_input'];

export function isActiveAgentTaskStatus(status: AgentTaskStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

export function estimateContextUsage(messages: ReadonlyArray<{ content: string }>, draft: string, budget = 10_000): { characters: number; percent: number } {
  const characters = messages.reduce((total, message) => total + message.content.length, 0) + draft.length;
  return { characters, percent: Math.min(100, Math.round((characters / Math.max(1, budget)) * 100)) };
}

export function currentAgentStep(task: AgentTask): string {
  const current = task.steps.find((step) => step.index === task.currentStep) ?? task.steps.at(-1);
  return current?.summary ?? '等待 Agent 开始第一步。';
}

export function agentTaskOutcome(task: AgentTask): string | null {
  if (task.result?.summary) return task.result.summary;
  if (task.error) return task.error;
  return task.status === 'cancelled' ? '任务已取消，未继续执行后续步骤。' : task.status === 'timed_out' ? '任务已超时，未继续执行后续步骤。' : task.status === 'interrupted' ? '任务在应用重启后中断，首版不会自动继续。' : null;
}
