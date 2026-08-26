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
  contextUsageOverride?: number;
}

export function AgentConsole({ state, agentTasks, agentEvent, onModeChange, contextUsageOverride }: AgentConsoleProps): JSX.Element {
  return <section className="wb-agent-console" data-agent-ui="console" aria-label="Agent 工作流">
    <div className="wb-agent-workflow" data-agent-ui="workflow">
      <aside className="wb-character-panel" data-workbench-region="character" aria-label={`${state.role.displayName}角色画面`}>
        <div className="wb-character-actions"><button type="button" className="wb-character-action"><WorkbenchIcon name="pet" size={15} />刷出为桌宠</button><button type="button" className="wb-character-action"><WorkbenchIcon name="minimize" size={15} />最小化</button></div>
        <div className="wb-character-art"><img src={BAOYIN_CHARACTER_ART} alt="白音角色立绘" /></div>
      </aside>
      <div className="wb-dialogue-column" data-workbench-region="dialogue">
        <div className="wb-dialogue-meta"><span>用时　<strong>6分45秒</strong>　<WorkbenchIcon name="chevron" size={13} /></span></div>
        <div className="wb-trajectory" data-agent-ui="plan">
          <span><WorkbenchIcon name="step" size={15} />规则判断 · 需要工作链路</span>
          <span><WorkbenchIcon name="step" size={15} />轻量分类 · 项目分析</span>
          <span><WorkbenchIcon name="step" size={15} />上下文注入 · 项目设置</span>
          <span><WorkbenchIcon name="check" size={15} />工具执行 · 检索文件结构　已完成</span>
          <p>我已分析该项目的设置结构，主要分为全局设置、开发设置、构建设置、测试设置和部署设置五大类。</p>
          <div className="wb-plan-actions" aria-label="轨迹反馈"><WorkbenchIcon name="copy" size={15} /><WorkbenchIcon name="thumbsUp" size={15} /><WorkbenchIcon name="thumbsDown" size={15} /><WorkbenchIcon name="refresh" size={15} /></div>
        </div>
        <CompanionChat state={state} agentTasks={agentTasks} agentEvent={agentEvent} onModeChange={onModeChange} showRouteControl={false} contextUsageOverride={contextUsageOverride} />
      </div>
    </div>
  </section>;
}
