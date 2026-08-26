import { forwardRef, useEffect, useRef, useState, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react';
import type { AgentTask, AgentTaskStatus } from '../../shared/agent';
import type { WorkbenchPage } from './settings-schema';
import { WorkbenchIcon, type WorkbenchIconName } from './WorkbenchIcon';
export type { WorkbenchPage } from './settings-schema';
import './settings-center.css';

const STARCHAT_ICON_URL = new URL('../../../../assets/icons/baoyin-64.png', import.meta.url).href;

export function Surface({ className = '', children, ...props }: HTMLAttributes<HTMLDivElement>): JSX.Element {
  return <div {...props} className={`workbench-surface ${className}`.trim()} data-workbench-surface>{children}</div>;
}

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string }>(function IconButton({ label, children, className = '', ...props }, ref): JSX.Element {
  return <button {...props} ref={ref} type="button" className={`workbench-icon-button ${className}`.trim()} aria-label={label} title={label}>{children}</button>;
});

interface TopbarProps {
  onMinimize: () => void;
  onClose: () => void;
  onMaximize?: () => void;
}

export function Topbar({ onMinimize, onClose, onMaximize }: TopbarProps): JSX.Element {
  return <header className="titlebar workbench-topbar" data-workbench="topbar">
    <div className="drag-region workbench-brand-lockup">
      <img className="workbench-brand-avatar" src={STARCHAT_ICON_URL} alt="" />
      <span className="workbench-brand-name">StarChat</span>
      <IconButton label="收藏 StarChat" className="workbench-brand-star"><WorkbenchIcon name="star" size={16} /></IconButton>
      <IconButton label="折叠项目栏" className="workbench-sidebar-toggle"><WorkbenchIcon name="sidebar" size={18} /></IconButton>
    </div>
    <div className="workbench-window-controls" aria-label="窗口控制">
      <IconButton label="最小化" className="workbench-window-control" data-workbench-window-control="minimize" onClick={onMinimize}><WorkbenchIcon name="minimize" size={16} /></IconButton>
      <IconButton label="最大化（窗口桥接未接入）" className="workbench-window-control is-limited" data-workbench-window-control="maximize" aria-disabled="true" onClick={onMaximize}><WorkbenchIcon name="maximize" size={15} /></IconButton>
      <IconButton label="隐藏工作台" className="workbench-window-control workbench-window-close" data-workbench-window-control="close" onClick={onClose}><WorkbenchIcon name="close" size={16} /></IconButton>
    </div>
  </header>;
}

interface SidebarProps {
  activePage: WorkbenchPage;
  onNavigate: (page: WorkbenchPage) => void;
}

function SidebarProjectRow({ label, active = false, onClick }: { label: string; active?: boolean; onClick: () => void }): JSX.Element {
  return <button type="button" className={`workbench-project-row ${active ? 'is-active' : ''}`} onClick={onClick} aria-current={active ? 'page' : undefined}>
    <WorkbenchIcon name="folder" size={17} /><strong>{label}</strong><WorkbenchIcon name="chevron" size={15} className="workbench-chevron" />
  </button>;
}

function SidebarSessionRow({ label, meta, active = false, onClick }: { label: string; meta: string; active?: boolean; onClick: () => void }): JSX.Element {
  return <button type="button" className={`workbench-session-row ${active ? 'is-active' : ''}`} onClick={onClick} aria-current={active ? 'page' : undefined}>
    <WorkbenchIcon name="chat" size={15} /><span>{label}</span><small>{meta}</small>
  </button>;
}

export function Sidebar({ activePage, onNavigate }: SidebarProps): JSX.Element {
  const settingsActive = activePage !== null;
  return <aside className="workbench-sidebar" data-workbench="sidebar" aria-label="StarChat 项目与会话导航">
    <button className="workbench-new-chat" type="button" onClick={() => onNavigate(null)}><WorkbenchIcon name="plus" size={17} />新对话</button>
    <div className="workbench-sidebar-heading"><strong>工作区</strong><span><WorkbenchIcon name="search" size={15} /><WorkbenchIcon name="menu" size={15} /><WorkbenchIcon name="file" size={15} /></span></div>
    <div className="workbench-project-tree">
      <SidebarProjectRow label="Project-008" active={activePage === null} onClick={() => onNavigate(null)} />
      <SidebarSessionRow label="检查 Project-008 设置结构" meta="进行中" active={activePage === null} onClick={() => onNavigate(null)} />
      <SidebarProjectRow label="StarChat" onClick={() => onNavigate(null)} />
      <SidebarSessionRow label="窗口交互回归" meta="最近" onClick={() => onNavigate(null)} />
    </div>
    <div className="workbench-sidebar-footer">
      <button type="button" className={`workbench-settings-entry ${settingsActive ? 'is-active' : ''}`} data-workbench="settings-entry" aria-label="设置" aria-current={settingsActive ? 'page' : undefined} onClick={() => onNavigate('settings')}>
        <WorkbenchIcon name="settings" size={17} /><span>设置</span>
      </button>
    </div>
  </aside>;
}

type ToolAction = 'chat' | 'task' | 'terminal' | undefined;

interface ToolCardProps {
  label: string;
  icon: WorkbenchIconName;
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
      : action === 'task'
        ? onToggleBottomPanel
        : undefined;
  const content = <><span className="workbench-tool-icon"><WorkbenchIcon name={icon} size={21} /></span><strong>{label}</strong><small>{description}</small></>;
  if (disabled) return <div className="workbench-tool-card is-disabled" data-capability-state="disabled" aria-disabled="true">{content}</div>;
  return <button className="workbench-tool-card" type="button" data-capability-state="available" onClick={onClick}>{content}</button>;
}

interface RightRailProps {
  roleName?: string;
  modelLabel?: string;
  themeLabel?: string;
  activeTaskCount?: number;
  onNavigate?: (page: WorkbenchPage) => void;
  onToggleBottomPanel?: () => void;
}

export function RightRail({ activeTaskCount = 0, onNavigate, onToggleBottomPanel }: RightRailProps): JSX.Element {
  return <aside className="workbench-right-rail" data-workbench="right-rail" aria-label="Agent 工作流工具">
    <div className="workbench-rail-topline"><IconButton label="添加工作流工具"><WorkbenchIcon name="plus" size={18} /></IconButton></div>
    <div className="workbench-tool-grid" data-agent-ui="capabilities" aria-label="Agent 工具入口">
      <ToolCard label="资源管理器" icon="resource" description="工作区资源" />
      <ToolCard label="源代码管理" icon="source" description="文件与源码只读 · Git 写入未启用 · 受控验证" />
      <ToolCard label="任务管理" icon="task" description={activeTaskCount > 0 ? `${activeTaskCount} 个活动任务` : '暂无活动任务'} action="task" onToggleBottomPanel={onToggleBottomPanel} />
      <ToolCard label="终端" icon="terminal" description="任意终端未启用" action="terminal" onToggleBottomPanel={onToggleBottomPanel} />
      <ToolCard label="浏览器" icon="browser" description="浏览器控制未启用" disabled />
      <ToolCard label="侧边聊天" icon="chat" description="侧边对话入口" action="chat" onNavigate={onNavigate} />
    </div>
  </aside>;
}

interface EnvironmentPopoverProps {
  onClose: () => void;
}

function EnvironmentPopover({ onClose }: EnvironmentPopoverProps): JSX.Element {
  return <aside className="workbench-environment-popover" data-workbench="environment-popover" aria-label="环境信息" role="dialog">
    <div className="workbench-environment-heading"><strong>环境信息</strong><IconButton label="关闭环境信息" onClick={onClose}><WorkbenchIcon name="close" size={15} /></IconButton></div>
    <div className="workbench-environment-list">
      <span><WorkbenchIcon name="file" size={15} />变更</span>
      <span><WorkbenchIcon name="folder" size={15} />工作树 <b>main</b></span>
      <span><WorkbenchIcon name="source" size={15} />codex/project-008-settings</span>
      <span><WorkbenchIcon name="share" size={15} />提交或推送</span>
    </div>
    <div className="workbench-environment-source"><div><strong>来源</strong><WorkbenchIcon name="plus" size={15} /></div><span><WorkbenchIcon name="pet" size={15} />角色图标参考</span><span><WorkbenchIcon name="layout" size={15} />界面布局参考</span><span><WorkbenchIcon name="file" size={15} />查看全部</span></div>
  </aside>;
}

interface CenterFrameProps {
  activePage: WorkbenchPage;
  children: ReactNode;
}

function CenterFrame({ activePage, children }: CenterFrameProps): JSX.Element {
  const sessionTitle = '检查 Project-008 设置结构';
  const [environmentOpen, setEnvironmentOpen] = useState(false);
  const environmentTriggerRef = useRef<HTMLButtonElement>(null);
  const environmentPopoverRef = useRef<HTMLDivElement>(null);

  const closeEnvironment = (): void => {
    setEnvironmentOpen(false);
    window.requestAnimationFrame(() => environmentTriggerRef.current?.focus());
  };

  useEffect(() => {
    if (!environmentOpen) return undefined;
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node;
      if (!environmentPopoverRef.current?.contains(target) && !environmentTriggerRef.current?.contains(target)) closeEnvironment();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeEnvironment();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [environmentOpen]);

  return <section className="workbench-center" data-workbench="center" aria-label="主工作区">
    <div className="workbench-center-scroll">
      <div className="workbench-center-frame" data-workbench-structure="shared" data-workbench-theme="tokenized">
        <header className="workbench-center-toolbar">
          <div className="workbench-center-title"><WorkbenchIcon name="folder" size={17} /><strong>{activePage === null ? sessionTitle : 'StarChat 设置'}</strong></div>
          <div className="workbench-center-actions"><IconButton label="分享"><WorkbenchIcon name="share" size={17} /></IconButton><IconButton label="环境信息" data-workbench="environment-trigger" ref={environmentTriggerRef} onClick={() => setEnvironmentOpen((open) => !open)}><WorkbenchIcon name="environment" size={17} /></IconButton><IconButton label="打开侧边栏"><WorkbenchIcon name="layout" size={17} /></IconButton></div>
        </header>
        {activePage === null && environmentOpen ? <div ref={environmentPopoverRef}><EnvironmentPopover onClose={closeEnvironment} /></div> : null}
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
    <div className="workbench-terminal-tabs"><button className="workbench-terminal-tab is-active" type="button" onClick={onToggle}><WorkbenchIcon name="terminal" size={15} />终端 1 <WorkbenchIcon name="close" size={13} /></button><button className="workbench-terminal-add" type="button" aria-label="新建终端"><WorkbenchIcon name="plus" size={15} /></button><button className="workbench-terminal-close" type="button" aria-label={open ? '收起终端面板' : '展开终端面板'} onClick={onToggle}>{open ? <WorkbenchIcon name="close" size={15} /> : <WorkbenchIcon name="arrowUp" size={15} />}</button></div>
    {open ? <div className="workbench-terminal-body" data-workbench="terminal-panel"><div className="workbench-terminal-prompt"><span>PS C:\workspace\Project-008&gt;</span><span className="workbench-terminal-caret" aria-hidden="true" /></div><div className="workbench-terminal-status"><span>Agent Runtime · {roleName}</span><span>{modelLabel}</span><span>{taskSummary}</span></div>{agentTasks.length > 0 ? <div className="workbench-task-list" data-agent-ui="tasks" aria-live="polite">{agentTasks.slice(0, 4).map((task) => <div className="workbench-task-row" key={task.id} data-task-id={task.id}><span><strong>{agentTaskStatusLabel(task.status)}</strong><small>{task.message}</small></span>{ACTIVE_AGENT_TASK_STATUSES.includes(task.status) && onCancelTask ? <button className="workbench-task-cancel" type="button" aria-label={`取消任务 ${task.id}`} onClick={() => onCancelTask(task.id)}>取消</button> : null}</div>)}</div> : null}</div> : null}
  </section>;
}

interface AgentWorkbenchProps {
  activePage: WorkbenchPage;
  roleName: string;
  modelLabel: string;
  themeLabel?: string;
  bottomPanelOpen?: boolean;
  agentAvailable?: boolean;
  agentTasks?: readonly AgentTask[];
  onNavigate: (page: WorkbenchPage) => void;
  onToggleBottomPanel: () => void;
  onCancelTask?: (taskId: string) => void;
  onMinimize?: () => void;
  onClose?: () => void;
  onMaximize?: () => void;
  children: ReactNode;
}

export function AgentWorkbench({ activePage, roleName, modelLabel, bottomPanelOpen = true, agentAvailable = true, agentTasks = [], onNavigate, onToggleBottomPanel, onCancelTask, onMinimize = () => undefined, onClose = () => undefined, onMaximize, children }: AgentWorkbenchProps): JSX.Element {
  const activeTaskCount = agentTasks.filter((task) => ACTIVE_AGENT_TASK_STATUSES.includes(task.status)).length;
  return <div className="workbench-shell" data-workbench="shell" data-workbench-structure="shared" data-workbench-theme="tokenized" data-agent-available={agentAvailable}>
    <Topbar onMinimize={onMinimize} onMaximize={onMaximize} onClose={onClose} />
    <div className="workbench-main-grid">
      <Sidebar activePage={activePage} onNavigate={onNavigate} />
      <CenterFrame activePage={activePage}>{children}</CenterFrame>
      <RightRail activeTaskCount={activeTaskCount} onNavigate={onNavigate} onToggleBottomPanel={onToggleBottomPanel} />
    </div>
    <BottomPanel open={bottomPanelOpen} roleName={roleName} modelLabel={modelLabel} onToggle={onToggleBottomPanel} agentTasks={agentTasks} onCancelTask={onCancelTask} />
  </div>;
}

export const Shell = AgentWorkbench;
