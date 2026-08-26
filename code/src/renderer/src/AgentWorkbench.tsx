import type { HTMLAttributes, ReactNode } from 'react';
import type { AgentTask, AgentTaskStatus } from '../../shared/agent';
import type { WorkbenchPage } from './settings-schema';
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
      <span className="workbench-brand-avatar" aria-hidden="true">✦</span>
      <span className="workbench-brand-name">StarChat</span>
      <span className="workbench-brand-star" aria-hidden="true">✦</span>
      <IconButton label="折叠项目栏" className="workbench-sidebar-toggle">◫</IconButton>
    </div>
    <div className="workbench-topbar-meta">
      <span className="workbench-theme-chip"><span className="status-dot" aria-hidden="true" />{themeLabel}</span>
      <IconButton label="显示桌宠" onClick={onShowPet}>◌</IconButton>
      <IconButton label="最小化" onClick={onMinimize}>−</IconButton>
      <IconButton label="隐藏工作台" onClick={onClose}>×</IconButton>
    </div>
  </header>;
}

interface SidebarProps {
  activePage: WorkbenchPage;
  onNavigate: (page: WorkbenchPage) => void;
}

function SidebarProjectRow({ label, active = false, onClick }: { label: string; active?: boolean; onClick: () => void }): JSX.Element {
  return <button type="button" className={`workbench-project-row ${active ? 'is-active' : ''}`} onClick={onClick} aria-current={active ? 'page' : undefined}>
    <span className="workbench-folder-icon" aria-hidden="true">▱</span><strong>{label}</strong><span className="workbench-chevron" aria-hidden="true">⌄</span>
  </button>;
}

function SidebarSessionRow({ label, meta, active = false, onClick }: { label: string; meta: string; active?: boolean; onClick: () => void }): JSX.Element {
  return <button type="button" className={`workbench-session-row ${active ? 'is-active' : ''}`} onClick={onClick} aria-current={active ? 'page' : undefined}>
    <span className="workbench-session-icon" aria-hidden="true">⌁</span><span>{label}</span><small>{meta}</small>
  </button>;
}

export function Sidebar({ activePage, onNavigate }: SidebarProps): JSX.Element {
  const settingsActive = activePage !== null;
  return <aside className="workbench-sidebar" data-workbench="sidebar" aria-label="StarChat 项目与会话导航">
    <button className="workbench-new-chat" type="button" onClick={() => onNavigate(null)}><span aria-hidden="true">⊕</span>新对话</button>
    <div className="workbench-sidebar-heading"><strong>工作区</strong><span aria-hidden="true">⌕　☷　□</span></div>
    <div className="workbench-project-tree">
      <SidebarProjectRow label="Project-008" active={activePage === null} onClick={() => onNavigate(null)} />
      <SidebarSessionRow label="设置工作台预览" meta="刚刚" active={activePage === null} onClick={() => onNavigate(null)} />
      <SidebarProjectRow label="StarChat" onClick={() => onNavigate(null)} />
      <SidebarSessionRow label="模型窗口交互" meta="7天" onClick={() => onNavigate(null)} />
    </div>
    <div className="workbench-sidebar-footer">
      <button type="button" className={`workbench-settings-entry ${settingsActive ? 'is-active' : ''}`} data-workbench="settings-entry" aria-label="设置" aria-current={settingsActive ? 'page' : undefined} onClick={() => onNavigate('settings')}>
        <span className="workbench-settings-icon" aria-hidden="true">⚙</span><span>设置</span>
      </button>
    </div>
  </aside>;
}

type ToolAction = 'chat' | 'task' | 'terminal' | 'settings' | undefined;

interface ToolCardProps {
  label: string;
  icon: string;
  description: string;
  action?: ToolAction;
  disabled?: boolean;
  onNavigate?: (page: WorkbenchPage) => void;
  onToggleBottomPanel?: () => void;
}

function ToolCard({ label, icon, description, action, disabled = false, onNavigate, onToggleBottomPanel }: ToolCardProps): JSX.Element {
  const onClick = action === 'terminal'
    ? onToggleBottomPanel
    : action === 'chat'
      ? () => onNavigate?.(null)
      : action === 'settings'
        ? () => onNavigate?.('settings')
        : action === 'task'
          ? onToggleBottomPanel
          : undefined;
  const content = <><span className="workbench-tool-icon" aria-hidden="true">{icon}</span><strong>{label}</strong><small>{description}</small></>;
  if (disabled) return <div className="workbench-tool-card is-disabled" data-capability-state="disabled" aria-disabled="true">{content}</div>;
  return <button className="workbench-tool-card" type="button" data-capability-state="available" onClick={onClick}>{content}</button>;
}

interface RightRailProps {
  roleName: string;
  modelLabel: string;
  themeLabel: string;
  activeTaskCount?: number;
  onNavigate?: (page: WorkbenchPage) => void;
  onToggleBottomPanel?: () => void;
}

export function RightRail({ roleName, modelLabel, themeLabel, activeTaskCount = 0, onNavigate, onToggleBottomPanel }: RightRailProps): JSX.Element {
  return <aside className="workbench-right-rail" data-workbench="right-rail" aria-label="Agent 工作流工具">
    <div className="workbench-rail-topline"><span aria-hidden="true">＋</span></div>
    <Surface className="workbench-presence-card">
      <span className="workbench-avatar" aria-hidden="true">白</span>
      <div><strong>{roleName}</strong><small>{modelLabel === '未配置外部模型' ? '默认角色 · 在线' : 'Live2D 角色 · 在线'}</small></div>
      <span className="workbench-online-pill">在线</span>
    </Surface>
    <div className="workbench-tool-grid" data-agent-ui="capabilities" aria-label="Agent 工具入口">
      <ToolCard label="资源管理器" icon="⌂" description="工作区资源 · 文件与源码只读" onNavigate={onNavigate} />
      <ToolCard label="源代码管理" icon="⌘" description="源码状态 · Git status / diff · Git 写入未启用 · 受控验证" />
      <ToolCard label="任务管理" icon="◇" description={activeTaskCount > 0 ? `${activeTaskCount} 个活动任务` : '暂无活动任务'} action="task" onToggleBottomPanel={onToggleBottomPanel} />
      <ToolCard label="终端" icon="›_" description="任意终端未启用" action="terminal" onToggleBottomPanel={onToggleBottomPanel} />
      <ToolCard label="浏览器" icon="◎" description="浏览器控制未启用" disabled />
      <ToolCard label="侧边聊天" icon="▢" description="侧边对话入口" action="chat" onNavigate={onNavigate} />
    </div>
    <Surface className="workbench-guardrail-card"><span className="workbench-guardrail-icon" aria-hidden="true">◇</span><div><strong>Agent 安全边界</strong><small>资源读取、源码查看和受控验证保留既有安全策略；任意终端、浏览器和 Git 写入不启用。</small></div></Surface>
    <div className="workbench-rail-footer"><span>主题</span><strong>{themeLabel}</strong></div>
  </aside>;
}

function EnvironmentPopover(): JSX.Element {
  return <aside className="workbench-environment-popover" data-workbench="environment-popover" aria-label="环境信息">
    <div className="workbench-environment-heading"><strong>环境信息</strong><span aria-hidden="true">＋</span></div>
    <div className="workbench-environment-list">
      <span><i aria-hidden="true">⊞</i>变更</span>
      <span><i aria-hidden="true">↗</i>工作树 <b aria-hidden="true">›</b></span>
      <span><i aria-hidden="true">♧</i>codex/project-008-settings</span>
      <span><i aria-hidden="true">⊖</i>提交或推送</span>
    </div>
    <div className="workbench-environment-source"><div><strong>来源</strong><span aria-hidden="true">＋</span></div><span>◉　角色图标参考</span><span>▣　界面布局参考</span><span>⌘　查看全部</span></div>
  </aside>;
}

interface CenterFrameProps {
  activePage: WorkbenchPage;
  children: ReactNode;
}

function CenterFrame({ activePage, children }: CenterFrameProps): JSX.Element {
  const title = activePage === null ? 'Project-008 设置工作台预览' : activePage === 'settings' ? 'StarChat 设置' : 'StarChat 设置';
  return <section className="workbench-center" data-workbench="center" aria-label="主工作区">
    <div className="workbench-center-scroll">
      <div className="workbench-center-frame" data-workbench-structure="shared" data-workbench-theme="tokenized">
        <header className="workbench-center-toolbar">
          <div className="workbench-center-title"><span className="workbench-folder-icon" aria-hidden="true">▱</span><strong>{title}</strong></div>
          <div className="workbench-center-actions"><IconButton label="分享">⇧</IconButton><IconButton label="环境信息">☷</IconButton><IconButton label="打开侧边栏">▥</IconButton></div>
        </header>
        {activePage === null ? <EnvironmentPopover /> : null}
        <div className={`workbench-center-content ${activePage === null ? 'is-agent-home' : 'is-settings'}`}>{children}</div>
      </div>
    </div>
  </section>;
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
  return <section className={`workbench-bottom-panel ${open ? 'is-open' : 'is-collapsed'}`} data-workbench="bottom-panel" data-workbench-terminal="terminal-panel" data-open={open} aria-label="工作台状态面板 底部终端面板">
    <div className="workbench-terminal-tabs"><button className="workbench-terminal-tab is-active" type="button" onClick={onToggle}><span aria-hidden="true">›_</span>终端 1 <span aria-hidden="true">×</span></button><button className="workbench-terminal-add" type="button" aria-label="新建终端">＋</button><button className="workbench-terminal-close" type="button" aria-label={open ? '收起终端面板' : '展开终端面板'} onClick={onToggle}>{open ? '×' : '⌃'}</button></div>
    {open ? <div className="workbench-terminal-body" data-workbench="terminal-panel"><div className="workbench-terminal-prompt"><span>PS C:\workspace\Project-008&gt;</span><span className="workbench-terminal-caret" aria-hidden="true" /></div><div className="workbench-terminal-status"><span>Agent Runtime · {roleName}</span><span>{modelLabel}</span><span>{taskSummary}</span></div>{agentTasks.length > 0 ? <div className="workbench-task-list" data-agent-ui="tasks" aria-live="polite">{agentTasks.slice(0, 4).map((task) => <div className="workbench-task-row" key={task.id} data-task-id={task.id}><span><strong>{agentTaskStatusLabel(task.status)}</strong><small>{task.message}</small></span>{ACTIVE_AGENT_TASK_STATUSES.includes(task.status) && onCancelTask ? <button className="workbench-task-cancel" type="button" aria-label={`取消任务 ${task.id}`} onClick={() => onCancelTask(task.id)}>取消</button> : null}</div>)}</div> : null}</div> : null}
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
  return <div className="workbench-shell" data-workbench="shell" data-workbench-structure="shared" data-workbench-theme="tokenized" data-agent-available={agentAvailable}>
    <Topbar themeLabel={themeLabel} onShowPet={onShowPet} onMinimize={onMinimize} onClose={onClose} />
    <div className="workbench-main-grid">
      <Sidebar activePage={activePage} onNavigate={onNavigate} />
      <CenterFrame activePage={activePage}>{children}</CenterFrame>
      <RightRail roleName={roleName} modelLabel={modelLabel} themeLabel={themeLabel} activeTaskCount={agentTasks.filter((task) => ACTIVE_AGENT_TASK_STATUSES.includes(task.status)).length} onNavigate={onNavigate} onToggleBottomPanel={onToggleBottomPanel} />
    </div>
    <BottomPanel open={bottomPanelOpen} roleName={roleName} modelLabel={modelLabel} onToggle={onToggleBottomPanel} agentTasks={agentTasks} onCancelTask={onCancelTask} />
  </div>;
}

export const Shell = AgentWorkbench;
