import type { PublicAppState } from '../../shared/ipc';
import type { AgentEvent, AgentMode, AgentTask } from '../../shared/agent';
import { CompanionChat } from './CompanionChat';

interface AgentConsoleProps {
  state: PublicAppState;
  agentTasks: readonly AgentTask[];
  agentEvent: AgentEvent | null;
  onModeChange: (mode: AgentMode) => void;
}

export function AgentConsole({ state, agentTasks, agentEvent, onModeChange }: AgentConsoleProps): JSX.Element {
  return <section className="agent-console" data-agent-ui="console" aria-labelledby="agent-console-title">
    <header className="agent-console-header">
      <div><span className="section-kicker">STARCHAT / AGENT WORKSPACE</span><h1 id="agent-console-title">和{state.role.displayName}一起完成任务</h1><p>对话会按处理模式路由到角色陪伴或安全 Agent Runtime。任务步骤、工具摘要和授权请求只留在本次任务中。</p></div>
      <div className="agent-console-live"><span className="status-dot" aria-hidden="true" /><span>运行时已接入</span><small>仅使用现有安全 IPC</small></div>
    </header>
    <CompanionChat state={state} agentTasks={agentTasks} agentEvent={agentEvent} onModeChange={onModeChange} />
  </section>;
}
