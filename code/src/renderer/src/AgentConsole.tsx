import type { PublicAppState } from '../../shared/ipc';
import type { AgentEvent, AgentMode, AgentTask } from '../../shared/agent';
import { AGENT_TASK_STATUS_LABELS } from './agent-ui-model';
import { CompanionChat } from './CompanionChat';
import { WorkbenchIcon } from './WorkbenchIcon';

const BAOYIN_CHARACTER_ART = new URL('../../../../assets/character/白音-精修设定稿-v2.png', import.meta.url).href;

interface AgentConsoleProps {
  state: PublicAppState;
  agentTasks: readonly AgentTask[];
  agentEvent: AgentEvent | null;
  onModeChange: (mode: AgentMode) => void;
  onNewConversation?: () => void;
  onMessageSent?: (message: string) => void;
  contextUsageOverride?: number;
}

function elapsedLabel(task: AgentTask | null): string {
  if (!task) return '未开始';
  const seconds = Math.max(0, Math.round((task.updatedAt - task.createdAt) / 1000));
  if (seconds < 60) return `${seconds} 秒`;
  return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}

function stepLabel(task: AgentTask): string {
  return `${AGENT_TASK_STATUS_LABELS[task.status].label} · ${task.message}`;
}

export function AgentConsole({ state, agentTasks, agentEvent, onModeChange, onNewConversation, onMessageSent, contextUsageOverride }: AgentConsoleProps): JSX.Element {
  const latestTask = agentTasks.find((task) => task.roleId === state.role.id) ?? null;
  const trajectory = latestTask?.steps.slice(-5) ?? [];
  return <section className="wb-agent-console" data-agent-ui="console" aria-label="Agent 工作流">
    <div className="wb-agent-workflow" data-agent-ui="workflow">
      <aside className="wb-character-panel" data-workbench-region="character" aria-label={`${state.role.displayName}角色画面`}>
        <div className="wb-character-actions"><button type="button" className="wb-character-action" onClick={() => window.baoyin.app.showPet()}><WorkbenchIcon name="pet" size={15} />显示桌宠</button><button type="button" className="wb-character-action" onClick={() => window.baoyin.app.minimize()}><WorkbenchIcon name="minimize" size={15} />最小化</button></div>
        <div className="wb-character-art"><img src={BAOYIN_CHARACTER_ART} alt="白音角色立绘" /></div>
      </aside>
      <div className="wb-dialogue-column" data-workbench-region="dialogue">
        <div className="wb-dialogue-meta"><span>任务用时　<strong>{elapsedLabel(latestTask)}</strong>　<WorkbenchIcon name="chevron" size={13} /></span></div>
        <div className="wb-trajectory" data-agent-ui="plan">
          {trajectory.length > 0 ? trajectory.map((step) => <span key={step.id}><WorkbenchIcon name={step.status === 'completed' ? 'check' : 'step'} size={15} />{step.summary}</span>) : <span><WorkbenchIcon name="step" size={15} />发送消息后显示实时任务步骤</span>}
          <p>{latestTask ? stepLabel(latestTask) : '当前没有后台任务；普通消息会通过现有流式聊天链路回复，需要项目操作时才创建 Agent 任务。'}</p>
          <div className="wb-plan-actions" aria-label="轨迹状态"><span>{agentEvent ? `最近事件：${agentEvent.type}` : '等待任务事件'}</span></div>
        </div>
        <CompanionChat state={state} agentTasks={agentTasks} agentEvent={agentEvent} onModeChange={onModeChange} onNewConversation={onNewConversation} onMessageSent={onMessageSent} showRouteControl={false} contextUsageOverride={contextUsageOverride} />
      </div>
    </div>
  </section>;
}
