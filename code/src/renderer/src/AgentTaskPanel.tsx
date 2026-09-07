import { useState } from 'react';
import type { AgentTask, ToolInvocation } from '../../shared/agent';
import { AGENT_TASK_STATUS_LABELS, agentTaskOutcome, currentAgentStep, isActiveAgentTaskStatus } from './agent-ui-model';

interface AgentTaskPanelProps {
  task: AgentTask;
  onApprove?: (approved: boolean) => void;
  onRespond?: (value: string) => void;
  onCancel?: () => void;
}

function invocationStatusLabel(status: ToolInvocation['status']): string {
  if (status === 'queued') return '排队中';
  if (status === 'running') return '执行中';
  if (status === 'completed') return '已完成';
  if (status === 'failed') return '失败';
  if (status === 'waiting_for_approval') return '等待许可';
  if (status === 'waiting_for_input') return '等待补充信息';
  return '已取消';
}

export function AgentTaskPanel({ task, onApprove, onRespond, onCancel }: AgentTaskPanelProps): JSX.Element {
  const [input, setInput] = useState('');
  const status = AGENT_TASK_STATUS_LABELS[task.status];
  const outcome = agentTaskOutcome(task);
  const invocationCount = task.invocations?.length ?? 0;

  return <section className={`agent-task-panel is-${status.tone}`} data-agent-ui="task-panel" aria-live="polite" aria-label="Agent 任务详情">
    <header className="agent-task-panel-header">
      <div><span className="section-kicker">AGENT TASK</span><h2>任务执行</h2><p>{status.description}</p></div>
      <span className="agent-status-badge" data-status={task.status}>{status.label}</span>
    </header>
    <div className="agent-task-overview" data-agent-ui="status">
      <div><span>当前步骤</span><strong>{currentAgentStep(task)}</strong></div>
      <div><span>步骤进度</span><strong>{Math.min(task.steps.length, task.currentStep + 1)} / {Math.max(task.steps.length, 1)}</strong></div>
      <div><span>工具调用</span><strong>{invocationCount} 次</strong></div>
    </div>
    {isActiveAgentTaskStatus(task.status) && onCancel ? <button className="agent-cancel-button" type="button" onClick={onCancel}>停止任务</button> : null}
    {task.approval && task.status === 'waiting_for_approval' ? <div className="agent-interaction-card agent-patch-approval" data-agent-ui="approval" role="dialog" aria-label="Agent 授权请求">
      <span className="agent-interaction-icon" aria-hidden="true">!</span>
      <div><strong>需要你的许可</strong><p>Agent 请求使用「{task.approval.toolName}」处理：{task.approval.target}</p><small>{task.approval.plan}</small>{task.approval.preview ? <><div className="agent-patch-summary"><span>{task.approval.preview.files.length} 个文件</span><span>+{task.approval.preview.additions}</span><span>−{task.approval.preview.deletions}</span></div><ul aria-label="待修改文件">{task.approval.preview.files.map((file) => <li key={file}>{file}</li>)}</ul><details open><summary>精确补丁</summary><pre tabIndex={0}>{task.approval.preview.patch}</pre></details></> : null}<div className="agent-interaction-actions"><button className="primary-button" type="button" disabled={task.approval.toolName === 'apply_patch' && !task.approval.preview} onClick={() => onApprove?.(true)}>{task.approval.toolName === 'apply_patch' ? '批准并写入' : '批准这次计划'}</button><button className="secondary-button" type="button" onClick={() => onApprove?.(false)}>拒绝</button></div></div>
    </div> : null}
    {task.input && task.status === 'waiting_for_input' ? <div className="agent-interaction-card" data-agent-ui="input" role="dialog" aria-label="Agent 补充信息请求">
      <span className="agent-interaction-icon" aria-hidden="true">?</span>
      <div><strong>需要补充信息</strong><p>{task.input.prompt}</p><div className="agent-inline-input"><input aria-label="补充 Agent 信息" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && input.trim()) { event.preventDefault(); onRespond?.(input.trim()); setInput(''); } }} /><button className="primary-button" type="button" disabled={!input.trim()} onClick={() => { onRespond?.(input.trim()); setInput(''); }}>继续</button></div></div>
    </div> : null}
    <div className="agent-task-timeline" data-agent-ui="timeline">
      <div className="agent-panel-heading"><strong>步骤时间线</strong><span>只读记录</span></div>
      {task.steps.length > 0 ? <ol>{task.steps.map((step) => <li key={step.id} className={`is-${step.status}`}><span className="agent-step-marker" aria-hidden="true" /><div><strong>{step.summary}</strong><small>{step.status === 'waiting' ? '等待交互' : step.status === 'failed' ? '未完成' : step.status === 'completed' ? '已完成' : '进行中'}</small></div></li>)}</ol> : <p className="detail-note">尚未产生步骤记录。</p>}
    </div>
    {invocationCount > 0 ? <div className="agent-tool-log" data-agent-ui="tool-log">
      <div className="agent-panel-heading"><strong>工具调用</strong><span>不会进入角色记忆</span></div>
      <ul>{task.invocations?.map((invocation) => <li key={invocation.id}><div><strong>{invocation.name}</strong><span>{invocation.summary ?? '暂无摘要'}</span></div><em>{invocationStatusLabel(invocation.status)}</em></li>)}</ul>
    </div> : null}
    {outcome && !isActiveAgentTaskStatus(task.status) ? <div className="agent-task-outcome" data-agent-ui="outcome"><strong>{task.status === 'completed' ? '完成摘要' : '任务结果'}</strong><p>{outcome}</p></div> : null}
    <p className="agent-log-boundary">工具日志和执行步骤仅属于本次 Agent 任务，不会写入角色或关系记忆。</p>
  </section>;
}
