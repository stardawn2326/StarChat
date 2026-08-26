import type { PublicAppState } from '../../shared/ipc';
import type { AgentEvent, AgentMode, AgentTask } from '../../shared/agent';
import { CompanionChat } from './CompanionChat';

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
        <div className="agent-character-actions"><button type="button" className="agent-character-action">◉　刷出为桌宠</button><button type="button" className="agent-character-action">—　最小化</button></div>
        <div className="agent-character-art"><img src={BAOYIN_CHARACTER_ART} alt="白音角色立绘" /></div>
        <div className="agent-character-caption"><strong>{state.role.displayName}</strong><span>在线 · 默认人格</span><small>角色画面仅为工作台预览，桌宠透明窗口保持独立。</small></div>
      </aside>
      <div className="agent-dialogue-column"><div className="agent-dialogue-meta"><span>用时　<strong>6分45秒</strong>　⌄</span><span>●　Agent 工作流已就绪</span></div><div className="agent-plan-preview" data-agent-ui="plan"><span>◈　规则判断 · 需要工作链路</span><span>◈　轻量分类 · 项目分析</span><span>◈　上下文注入 · 项目设置</span><span>⊞　工具执行 · 检索文件结构　已完成</span><p>我已分析该项目的设置结构，主要分为全局设置、开发设置、构建设置、测试设置和部署设置五大类。</p><div className="agent-plan-actions" aria-hidden="true"><span>▣</span><span>♧</span><span>♧</span><span>⟳</span></div></div><CompanionChat state={state} agentTasks={agentTasks} agentEvent={agentEvent} onModeChange={onModeChange} /></div>
    </div>
  </section>;
}
