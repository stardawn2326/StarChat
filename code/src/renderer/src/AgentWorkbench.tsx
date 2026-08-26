import type { HTMLAttributes, ReactNode } from 'react';
import type { AgentTask, AgentTaskStatus } from '../../shared/agent';
import { getWorkbenchCapabilities, WORKBENCH_NAVIGATION_ITEMS, type WorkbenchCapabilityTarget, type WorkbenchPage } from './settings-schema';
export type { WorkbenchPage } from './settings-schema';
import './settings-center.css';

export function Surface({ className = '', children, ...props }: HTMLAttributes<HTMLDivElement>): JSX.Element {
  return <div {...props} className={`workbench-surface ${className}`.trim()} data-workbench-surface>{children}</div>;
}

export function IconButton({ label, children, className = '', ...props }: HTMLAttributes<HTMLButtonElement> & { label: string }): JSX.Element {
  return <button {...props} type="button" className={`workbench-icon-button ${className}`.trim()} aria-label={label} title={label}>{children}</button>;
}

interface TopbarProps {
  themeLabel: string;
  onShowPet: () => void;
  onMinimize: () => void;
  onClose: () => void;
}

export function Topbar({ themeLabel, onShowPet, onMinimize, onClose }: TopbarProps): JSX.Element {
  return <header className="titlebar workbench-topbar" data-workbench="topbar">
    <div className="drag-region workbench-brand-lockup">
      <span className="workbench-brand-mark" aria-hidden="true">✦</span>
      <span className="workbench-brand-name">StarChat</span>
      <span className="workbench-brand-divider" aria-hidden="true">/</span>
      <span className="workbench-brand-context">Agent 工作台</span>
    </div>
    <div className="workbench-topbar-meta">
      <span className="workbench-theme-chip"><span className="status-dot" aria-hidden="true" />{themeLabel}</span>
      <IconButton label="显示桌宠" onClick={onShowPet}>⌂</IconButton>
      <IconButton label="最小化" onClick={onMinimize}>−</IconButton>
      <IconButton label="隐藏工作台" onClick={onClose}>×</IconButton>
    </div>
  </header>;
}

interface SidebarProps {
  activePage: WorkbenchPage;
  onNavigate: (page: WorkbenchPage) => void;
}

export function Sidebar({ activePage, onNavigate }: SidebarProps): JSX.Element {
  return <aside className="workbench-sidebar" data-workbench="sidebar" aria-label="StarChat 项目与功能导航">
    <div className="workbench-project-card">
      <span className="section-kicker">PROJECT</span>
      <strong>白音 · Companion</strong>
      <small>桌宠驱动的 Agent 空间</small>
    </div>
    <nav className="workbench-nav" aria-label="工作台导航">
      <span className="workbench-nav-label">空间</span>
      {WORKBENCH_NAVIGATION_ITEMS.filter((item) => item.group === 'space').map((item) => <button key="overview" type="button" className={`workbench-nav-item ${activePage === item.id ? 'is-active' : ''}`} aria-current={activePage === item.id ? 'page' : undefined} aria-label={item.label} onClick={() => onNavigate(item.id)}>
        <span className="workbench-nav-icon" aria-hidden="true">{item.icon}</span><span><strong>{item.label}</strong><small>{item.description}</small></span>
      </button>)}
      <span className="workbench-nav-label">设置入口</span>
      {WORKBENCH_NAVIGATION_ITEMS.filter((item) => item.group === 'settings').map((item) => <button key={item.id} type="button" className={`workbench-nav-item ${activePage === item.id ? 'is-active' : ''}`} aria-current={activePage === item.id ? 'page' : undefined} aria-label={item.label} onClick={() => onNavigate(item.id)}>
        <span className="workbench-nav-icon" aria-hidden="true">{item.icon}</span><span><strong>{item.label}</strong><small>{item.description}</small></span>
      </button>)}
    </nav>
    <div className="workbench-sidebar-footer"><span className="workbench-status-pulse" aria-hidden="true" /><span>桌宠连接保持独立</span></div>
  </aside>;
}

interface RightRailProps {
  roleName: string;
  modelLabel: string;
  themeLabel: string;
  agentAvailable?: boolean;
  activeTaskCount?: number;
  onNavigate?: (page: WorkbenchPage) => void;
  onToggleBottomPanel?: () => void;
}

export function RightRail({ roleName, modelLabel, themeLabel, agentAvailable = true, activeTaskCount = 0, onNavigate, onToggleBottomPanel }: RightRailProps): JSX.Element {
  const capabilities = getWorkbenchCapabilities({ agentAvailable, activeTaskCount, hasModel: modelLabel !== '未配置外部模型', modelLabel });
  const actionFor = (target: WorkbenchCapabilityTarget | undefined): (() => void) | undefined => {
    if (target === 'chat' && onNavigate) return () => onNavigate('chat');
    if (target === 'bottom' && onToggleBottomPanel) return onToggleBottomPanel;
    if (target && target !== 'bottom' && onNavigate) return () => onNavigate(target);
    return undefined;
  };
  return <aside className="workbench-right-rail" data-workbench="right-rail" aria-label="StarChat 能力栏">
    <span className="section-kicker">PRESENCE</span>
    <h2>陪伴状态</h2>
    <Surface className="workbench-presence-card">
      <span className="workbench-avatar" aria-hidden="true">白</span>
      <div><strong>{roleName}</strong><small>默认人格已就绪</small></div>
      <span className="workbench-online-pill">在线</span>
    </Surface>
    <span className="section-kicker workbench-rail-kicker">CAPABILITIES</span>
    <Surface className="workbench-capability-card" data-agent-ui="capabilities" aria-label="Agent 能力状态">
      {capabilities.map((capability) => {
        const action = capability.state !== 'disabled' ? actionFor(capability.target) : undefined;
        const content = <><span className="workbench-capability-icon" aria-hidden="true">{capability.icon}</span><span><strong>{capability.label}</strong><small>{capability.description}</small></span><span className={`workbench-capability-status is-${capability.state}`}>{capability.statusLabel}</span></>;
        return action
          ? <button className="workbench-capability-entry" type="button" key={capability.id} data-capability-id={capability.id} data-capability-state={capability.state} onClick={action}>{content}</button>
          : <div className="workbench-capability-entry" key={capability.id} data-capability-id={capability.id} data-capability-state={capability.state} aria-disabled={capability.state === 'disabled' ? 'true' : undefined}>{content}</div>;
      })}
    </Surface>
    <Surface className="workbench-guardrail-card"><span className="workbench-guardrail-icon" aria-hidden="true">◇</span><div><strong>安全边界</strong><small>只读资源、受控验证和 Agent 审批保持在既有安全策略内；任意终端、浏览器和 Git 写入明确未启用。</small></div></Surface>
    <div className="workbench-rail-footer"><span>主题</span><strong>{themeLabel}</strong></div>
  </aside>;
}

interface BottomPanelProps {
  open: boolean;
  roleName: string;
  modelLabel: string;
  onToggle: () => void;
  agentTasks?: readonly AgentTask[];
  onCancelTask?: (taskId: string) => void;
}

const ACTIVE_AGENT_TASK_STATUSES: readonly AgentTaskStatus[] = ['queued', 'running', 'waiting_for_approval', 'waiting_for_input'];

function agentTaskStatusLabel(status: AgentTaskStatus): string {
  return ({ queued: '排队中', running: '执行中', waiting_for_approval: '等待许可', waiting_for_input: '等待输入', completed: '已完成', failed: '失败', cancelled: '已取消', timed_out: '超时', interrupted: '已中断' })[status];
}

export function BottomPanel({ open, roleName, modelLabel, onToggle, agentTasks = [], onCancelTask }: BottomPanelProps): JSX.Element {
  const activeTasks = agentTasks.filter((task) => ACTIVE_AGENT_TASK_STATUSES.includes(task.status));
  const taskSummary = activeTasks.length > 0 ? `${activeTasks.length} 个 Agent 任务活动中` : '暂无活动 Agent 任务';
  return <section className={`workbench-bottom-panel ${open ? 'is-open' : 'is-collapsed'}`} data-workbench="bottom-panel" data-open={open} aria-label="工作台状态面板">
    <button className="workbench-bottom-toggle" type="button" aria-expanded={open} onClick={onToggle}>
      <span><span className="workbench-bottom-grip" aria-hidden="true">⌁</span><strong>运行状态</strong><small>{taskSummary}</small></span><span aria-hidden="true">{open ? '⌄' : '⌃'}</span>
    </button>
    {open ? <div className="workbench-bottom-content"><div><span className="section-kicker">SESSION</span><strong>桌宠链路已隔离</strong><small>设置工作台只发送语义配置，Live2D runtime 保持独立。</small></div><div><span className="section-kicker">ROLE</span><strong>{roleName}</strong><small>人格与记忆沿用现有角色包。</small></div><div><span className="section-kicker">MODEL</span><strong>{modelLabel}</strong><small>外部模型继续只读引用。</small></div><div className="workbench-task-summary" data-agent-ui="tasks" aria-live="polite"><span className="section-kicker">AGENT TASKS</span><strong>{taskSummary}</strong>{agentTasks.length === 0 ? <small>任务执行、审批和补充输入会在这里显示。</small> : <div className="workbench-task-list">{agentTasks.slice(0, 4).map((task) => <div className="workbench-task-row" key={task.id} data-task-id={task.id}><span><strong>{agentTaskStatusLabel(task.status)}</strong><small>{task.message}</small></span>{ACTIVE_AGENT_TASK_STATUSES.includes(task.status) && onCancelTask ? <button className="workbench-task-cancel" type="button" aria-label={`取消任务 ${task.id}`} onClick={() => onCancelTask(task.id)}>取消</button> : null}</div>)}</div>}</div></div> : null}
  </section>;
}

interface AgentWorkbenchProps {
  activePage: WorkbenchPage;
  roleName: string;
  modelLabel: string;
  themeLabel: string;
  bottomPanelOpen?: boolean;
  agentAvailable?: boolean;
  agentTasks?: readonly AgentTask[];
  onNavigate: (page: WorkbenchPage) => void;
  onToggleBottomPanel: () => void;
  onCancelTask?: (taskId: string) => void;
  onShowPet?: () => void;
  onMinimize?: () => void;
  onClose?: () => void;
  children: ReactNode;
}

export function AgentWorkbench({ activePage, roleName, modelLabel, themeLabel, bottomPanelOpen = true, agentAvailable = true, agentTasks = [], onNavigate, onToggleBottomPanel, onCancelTask, onShowPet = () => undefined, onMinimize = () => undefined, onClose = () => undefined, children }: AgentWorkbenchProps): JSX.Element {
  return <div className="workbench-shell" data-workbench="shell">
    <Topbar themeLabel={themeLabel} onShowPet={onShowPet} onMinimize={onMinimize} onClose={onClose} />
    <div className="workbench-main-grid">
      <Sidebar activePage={activePage} onNavigate={onNavigate} />
      <section className="workbench-center" data-workbench="center" aria-label="主工作区"><div className="workbench-center-scroll">{children}</div></section>
      <RightRail roleName={roleName} modelLabel={modelLabel} themeLabel={themeLabel} agentAvailable={agentAvailable} activeTaskCount={agentTasks.filter((task) => ACTIVE_AGENT_TASK_STATUSES.includes(task.status)).length} onNavigate={onNavigate} onToggleBottomPanel={onToggleBottomPanel} />
    </div>
    <BottomPanel open={bottomPanelOpen} roleName={roleName} modelLabel={modelLabel} onToggle={onToggleBottomPanel} agentTasks={agentTasks} onCancelTask={onCancelTask} />
  </div>;
}

export const Shell = AgentWorkbench;
