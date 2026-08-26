import type { PublicAppState } from '../../shared/ipc';
import type { AgentEvent, AgentMode, AgentTask } from '../../shared/agent';
import { CompanionChat } from './CompanionChat';
import { WorkbenchIcon } from './WorkbenchIcon';

const BAOYIN_CHARACTER_ART = new URL('../../../../assets/character/白音-精修设定稿-v2.png', import.meta.url).href;

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
    <div className="agent-workflow-layout" data-agent-ui="workflow">
      <aside className="agent-character-panel" aria-label={`${state.role.displayName}角色预览`}>
        <div className="agent-character-actions"><button type="button" className="agent-character-action"><WorkbenchIcon name="pet" size={15} />刷出为桌宠</button><button type="button" className="agent-character-action"><WorkbenchIcon name="minimize" size={15} />最小化</button></div>
        <div className="agent-character-art"><img src={BAOYIN_CHARACTER_ART} alt="白音角色立绘" /></div>
        <div className="agent-character-caption"><strong>{state.role.displayName}</strong><span>在线 · 默认人格</span><small>角色画面与透明桌宠窗口保持独立。</small></div>
      </aside>
      <div className="agent-dialogue-column"><div className="agent-dialogue-meta"><span>用时　<strong>6分45秒</strong>　<WorkbenchIcon name="chevron" size={13} /></span><span><WorkbenchIcon name="check" size={14} />Agent 工作流已就绪</span></div><div className="agent-plan-preview" data-agent-ui="plan"><span><WorkbenchIcon name="step" size={15} />规则判断 · 需要工作链路</span><span><WorkbenchIcon name="step" size={15} />轻量分类 · 项目分析</span><span><WorkbenchIcon name="step" size={15} />上下文注入 · 项目结构</span><span><WorkbenchIcon name="check" size={15} />工具执行 · 检索文件结构　已完成</span><p>我已完成项目结构扫描，工作流入口、设置入口与运行时边界保持清晰分层。</p><div className="agent-plan-actions" aria-hidden="true"><WorkbenchIcon name="copy" size={15} /><WorkbenchIcon name="thumbsUp" size={15} /><WorkbenchIcon name="thumbsDown" size={15} /><WorkbenchIcon name="refresh" size={15} /></div></div><CompanionChat state={state} agentTasks={agentTasks} agentEvent={agentEvent} onModeChange={onModeChange} /></div>
    </div>
  </section>;
}
