import { forwardRef, useEffect, useRef, useState, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode, type RefObject } from 'react';
import type { AgentTask } from '../../shared/agent';
import type { WorkbenchEnvironment, WorkbenchInspection, WorkbenchInspectionKind } from '../../shared/workbench';
import { workbenchGitStatusLabel, workbenchSessionMeta } from '../../shared/workbench';
import { AGENT_TASK_STATUS_LABELS, currentAgentStep, isActiveAgentTaskStatus } from './agent-ui-model';
import type { WorkbenchPage } from './settings-schema';
import { WorkbenchIcon, type WorkbenchIconName } from './WorkbenchIcon';
export type { WorkbenchPage } from './settings-schema';
import './workbench/workbench.css';

const STARCHAT_ICON_URL = new URL('../../../../assets/icons/baoyin-64.png', import.meta.url).href;

export function Surface({ className = '', children, ...props }: HTMLAttributes<HTMLDivElement>): JSX.Element {
  return <div {...props} className={`wb-surface ${className}`.trim()}>{children}</div>;
}

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string }>(function IconButton({ label, children, className = '', ...props }, ref): JSX.Element {
  return <button {...props} ref={ref} type="button" className={`wb-icon-button ${className}`.trim()} aria-label={label} title={label}>{children}</button>;
});

function readPersistedBoolean(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback;
  try { return window.localStorage.getItem(key) === 'true'; } catch { return fallback; }
}

function writePersistedBoolean(key: string, value: boolean): void {
  try { window.localStorage.setItem(key, String(value)); } catch { /* browser storage can be unavailable */ }
}

interface TopbarProps {
  onMinimize: () => void;
  onClose: () => void;
  onMaximize?: () => void;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  sidebarToggleRef: RefObject<HTMLButtonElement>;
  isMaximized: boolean;
}

export function Topbar({ onMinimize, onClose, onMaximize, sidebarCollapsed, onToggleSidebar, sidebarToggleRef, isMaximized }: TopbarProps): JSX.Element {
  return <header className="wb-topbar" data-workbench="topbar" data-workbench-region="topbar">
    <div className="wb-drag-region wb-brand-lockup">
      <img className="wb-brand-avatar" src={STARCHAT_ICON_URL} alt="" />
      <span className="wb-brand-name">StarChat</span>
      <IconButton label="收藏功能未启用" className="wb-brand-star is-limited" disabled><WorkbenchIcon name="star" size={16} /></IconButton>
      <IconButton label="折叠项目栏" className="wb-sidebar-toggle" ref={sidebarToggleRef} aria-expanded={!sidebarCollapsed} aria-controls="workbench-sidebar" onClick={onToggleSidebar}><WorkbenchIcon name="sidebar" size={18} /></IconButton>
    </div>
    <div className="wb-window-controls" aria-label="窗口控制">
      <IconButton label="最小化" className="wb-window-control" data-workbench-window-control="minimize" onClick={onMinimize}><WorkbenchIcon name="minimize" size={16} /></IconButton>
      <IconButton label={isMaximized ? '恢复窗口' : '最大化'} className="wb-window-control" data-workbench-window-control="maximize" aria-pressed={isMaximized} onClick={onMaximize}><WorkbenchIcon name="maximize" size={15} /></IconButton>
      <IconButton label="隐藏工作台" className="wb-window-control wb-window-close" data-workbench-window-control="close" onClick={onClose}><WorkbenchIcon name="close" size={16} /></IconButton>
    </div>
  </header>;
}

interface SidebarProps {
  activePage: WorkbenchPage;
  onNavigate: (page: WorkbenchPage) => void;
  onNewConversation: () => void;
  collapsed: boolean;
  workspaceLabel: string;
  sessionTitle: string;
  sessionMeta: string;
}

function SidebarProjectRow({ label, active = false, collapsed, onClick }: { label: string; active?: boolean; collapsed: boolean; onClick: () => void }): JSX.Element {
  return <button type="button" className={`wb-project-row ${active ? 'is-active' : ''}`} onClick={onClick} tabIndex={collapsed ? -1 : 0} aria-current={active ? 'page' : undefined}>
    <WorkbenchIcon name="folder" size={17} /><strong>{label}</strong><WorkbenchIcon name="chevron" size={15} className="wb-chevron" />
  </button>;
}

function SidebarSessionRow({ label, meta, active = false, collapsed, onClick }: { label: string; meta: string; active?: boolean; collapsed: boolean; onClick: () => void }): JSX.Element {
  return <button type="button" className={`wb-session-row ${active ? 'is-active' : ''}`} onClick={onClick} tabIndex={collapsed ? -1 : 0} aria-current={active ? 'page' : undefined}>
    <WorkbenchIcon name="chat" size={15} /><span>{label}</span><small>{meta}</small>
  </button>;
}

export function Sidebar({ activePage, onNavigate, onNewConversation, collapsed, workspaceLabel, sessionTitle, sessionMeta }: SidebarProps): JSX.Element {
  const settingsActive = activePage !== null;
  return <aside id="workbench-sidebar" className={`wb-sidebar ${collapsed ? 'is-collapsed' : 'is-expanded'}`} data-workbench="sidebar" data-workbench-region="sidebar" aria-hidden={collapsed} aria-label="StarChat 项目与会话导航">
    <button className="wb-new-chat" type="button" tabIndex={collapsed ? -1 : 0} onClick={onNewConversation}><WorkbenchIcon name="plus" size={17} />新对话</button>
    <div className="wb-sidebar-heading"><strong>工作区</strong><span><WorkbenchIcon name="search" size={15} /><WorkbenchIcon name="menu" size={15} /><WorkbenchIcon name="file" size={15} /></span></div>
    <div className="wb-project-tree">
      <SidebarProjectRow label={workspaceLabel} collapsed={collapsed} active={activePage === null} onClick={() => onNavigate(null)} />
      <SidebarSessionRow label={sessionTitle} collapsed={collapsed} meta={sessionMeta} active={activePage === null} onClick={() => onNavigate(null)} />
    </div>
    <div className="wb-sidebar-footer">
      <button type="button" className={`wb-settings-entry ${settingsActive ? 'is-active' : ''}`} data-workbench="settings-entry" aria-label="设置" aria-current={settingsActive ? 'page' : undefined} tabIndex={collapsed ? -1 : 0} onClick={() => onNavigate('settings')}>
        <WorkbenchIcon name="settings" size={17} /><span>设置</span>
      </button>
    </div>
  </aside>;
}

export type WorkbenchToolAction = 'resources' | 'source' | 'chat' | 'tasks' | 'terminal';
interface ToolCardProps { label: string; icon: WorkbenchIconName; action?: WorkbenchToolAction; disabled?: boolean; onNavigate?: (page: WorkbenchPage) => void; onToolAction?: (action: WorkbenchToolAction) => void; }

function ToolCard({ label, icon, action, disabled = false, onNavigate, onToolAction }: ToolCardProps): JSX.Element {
  const onClick = action === 'chat' ? (onNavigate ? () => onNavigate(null) : undefined) : action && onToolAction ? () => onToolAction(action) : undefined;
  const content = <><span className="wb-tool-icon"><WorkbenchIcon name={icon} size={28} /></span><strong>{label}</strong></>;
  if (disabled) return <div className="wb-tool-card is-disabled" data-capability-state="disabled" aria-disabled="true">{content}<small>未启用</small></div>;
  if (!onClick) return <div className="wb-tool-card is-disabled" data-capability-state="disabled" aria-disabled="true">{content}<small>当前窗口未连接</small></div>;
  return <button className="wb-tool-card" type="button" data-capability-state="available" onClick={onClick}>{content}</button>;
}

interface RightRailProps { onNavigate?: (page: WorkbenchPage) => void; onToolAction?: (action: WorkbenchToolAction) => void; }

export function RightRail({ onNavigate, onToolAction }: RightRailProps): JSX.Element {
  return <aside className="wb-right-rail" data-workbench="right-rail" data-workbench-region="right" aria-label="Agent 工作流工具">
    <div className="wb-rail-topline"><IconButton label="添加工作流工具未启用" disabled><WorkbenchIcon name="plus" size={18} /></IconButton></div>
    <div className="wb-tool-grid" data-agent-ui="capabilities" aria-label="Agent 工具入口">
      <ToolCard label="资源管理器" icon="resource" action="resources" onToolAction={onToolAction} />
      <ToolCard label="源代码管理" icon="source" action="source" onToolAction={onToolAction} />
      <ToolCard label="任务管理" icon="task" action="tasks" onToolAction={onToolAction} />
      <ToolCard label="终端" icon="terminal" action="terminal" onToolAction={onToolAction} />
      <ToolCard label="浏览器" icon="browser" disabled />
      <ToolCard label="侧边聊天" icon="chat" action="chat" onNavigate={onNavigate} onToolAction={onToolAction} />
    </div>
  </aside>;
}

interface EnvironmentPopoverProps { onClose: () => void; environment: WorkbenchEnvironment | null; }

function EnvironmentPopover({ onClose, environment }: EnvironmentPopoverProps): JSX.Element {
  const branch = environment?.branch ?? (environment?.head ? `分离 HEAD @ ${environment.head}` : '未识别');
  return <aside className="wb-environment-popover" data-workbench="environment-popover" aria-label="环境信息" role="dialog">
    <div className="wb-environment-heading"><strong>环境信息</strong><IconButton label="关闭环境信息" onClick={onClose}><WorkbenchIcon name="close" size={15} /></IconButton></div>
    <div className="wb-environment-list">
      <span><WorkbenchIcon name="file" size={15} />变更 <b>{environment?.changedFiles ?? '读取中'}</b></span>
      <span><WorkbenchIcon name="folder" size={15} />工作树 <b>{branch}</b></span>
      <span><WorkbenchIcon name="source" size={15} />{environment?.gitRoot ?? 'Git 根目录未识别'}</span>
      <span><WorkbenchIcon name="share" size={15} />{environment ? workbenchGitStatusLabel(environment.gitStatus) : '正在读取 Git 状态'}</span>
    </div>
    <div className="wb-environment-source"><div><strong>工作区路径</strong></div><span><WorkbenchIcon name="folder" size={15} />{environment?.workspaceRoot ?? '等待授权工作区'}</span></div>
  </aside>;
}

interface CenterFrameProps { activePage: WorkbenchPage; children: ReactNode; initialEnvironmentOpen?: boolean; environment: WorkbenchEnvironment | null; onShare?: () => Promise<string>; onToggleSidebar: () => void; }

function CenterFrame({ activePage, children, initialEnvironmentOpen = false, environment, onShare, onToggleSidebar }: CenterFrameProps): JSX.Element {
  const [environmentOpen, setEnvironmentOpen] = useState(initialEnvironmentOpen);
  const [shareStatus, setShareStatus] = useState('');
  const environmentTriggerRef = useRef<HTMLButtonElement>(null);
  const environmentPopoverRef = useRef<HTMLDivElement>(null);

  const closeEnvironment = (): void => {
    setEnvironmentOpen(false);
    window.requestAnimationFrame(() => environmentTriggerRef.current?.focus());
  };

  const share = async (): Promise<void> => {
    if (!onShare) return;
    try { setShareStatus(await onShare()); } catch (error) { setShareStatus(error instanceof Error ? error.message : '分享失败'); }
  };

  useEffect(() => {
    if (!environmentOpen) return undefined;
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node;
      if (!environmentPopoverRef.current?.contains(target) && !environmentTriggerRef.current?.contains(target)) closeEnvironment();
    };
    const onKeyDown = (event: KeyboardEvent): void => { if (event.key === 'Escape') closeEnvironment(); };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('pointerdown', onPointerDown); document.removeEventListener('keydown', onKeyDown); };
  }, [environmentOpen]);

  return <section className="wb-center" data-workbench="center" data-workbench-region="center" aria-label="主工作区">
    <div className="wb-center-scroll">
      <div className="wb-center-frame" data-workbench-structure="shared" data-workbench-theme="tokenized">
        <header className="wb-center-toolbar">
          <div className="wb-center-title"><WorkbenchIcon name="folder" size={17} /><strong>{activePage === null ? '当前会话' : 'StarChat 设置'}</strong></div>
          <div className="wb-center-actions"><IconButton label="复制环境摘要" onClick={() => void share()}><WorkbenchIcon name="share" size={17} /></IconButton><IconButton label="环境信息" data-workbench="environment-trigger" ref={environmentTriggerRef} onClick={() => setEnvironmentOpen((open) => !open)}><WorkbenchIcon name="environment" size={17} /></IconButton><IconButton label="切换侧栏布局" onClick={onToggleSidebar}><WorkbenchIcon name="layout" size={17} /></IconButton></div>
        </header>
        {activePage === null && environmentOpen ? <div ref={environmentPopoverRef}><EnvironmentPopover environment={environment} onClose={closeEnvironment} /></div> : null}
        {shareStatus ? <p className="wb-action-status" role="status">{shareStatus}</p> : null}
        <div className={`wb-center-content ${activePage === null ? 'is-agent-home' : 'is-settings'}`}>{children}</div>
      </div>
    </div>
  </section>;
}

interface BottomPanelProps { open: boolean; onToggle: () => void; agentTasks?: readonly AgentTask[]; onCancelTask?: (taskId: string) => void; }

export function BottomPanel({ open, onToggle, agentTasks = [], onCancelTask }: BottomPanelProps): JSX.Element {
  return <section className={`wb-bottom-panel ${open ? 'is-open' : 'is-collapsed'}`} data-workbench="bottom-panel" data-workbench-terminal="verification-log" data-workbench-region="bottom" data-open={open} aria-label="底部受控验证日志">
    <div className="wb-terminal-tabs"><span className="wb-terminal-tab is-active"><WorkbenchIcon name="terminal" size={15} />受控验证日志</span><button className="wb-terminal-close" type="button" aria-label={open ? '收起受控验证日志' : '展开受控验证日志'} onClick={onToggle}>{open ? <WorkbenchIcon name="close" size={15} /> : <WorkbenchIcon name="arrowUp" size={15} />}</button></div>
    {open ? <div className="wb-terminal-body" data-workbench="verification-log"><p className="wb-verification-note">这里显示 Agent 任务和白名单验证结果；未启用任意 PowerShell 或 Shell 输入。</p>{agentTasks.length === 0 ? <p className="wb-verification-empty">暂无 Agent 任务或受控验证记录。</p> : <ul className="wb-verification-list">{agentTasks.slice(0, 8).map((task) => <li key={task.id}><div><strong>{AGENT_TASK_STATUS_LABELS[task.status].label} · {task.message}</strong><span>{currentAgentStep(task)}</span></div>{isActiveAgentTaskStatus(task.status) && onCancelTask ? <button className="wb-task-cancel" type="button" onClick={() => onCancelTask(task.id)}>停止</button> : null}</li>)}</ul>}</div> : null}
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
  onNewConversation?: () => void;
  sessionTitle?: string;
  sessionMessageCount?: number;
  workspaceLabel?: string;
  environment?: WorkbenchEnvironment | null;
  inspection?: WorkbenchInspection | null;
  activeTool?: WorkbenchInspectionKind | null;
  onToolAction?: (action: WorkbenchToolAction) => void;
  onRefreshInspection?: () => void;
  onShare?: () => Promise<string>;
  onCancelTask?: (taskId: string) => void;
  onMinimize?: () => void;
  onClose?: () => void;
  onMaximize?: () => void;
  isMaximized?: boolean;
  initialEnvironmentOpen?: boolean;
  children: ReactNode;
}

export function AgentWorkbench({ activePage, roleName: _roleName, modelLabel: _modelLabel, bottomPanelOpen = true, agentAvailable = true, agentTasks = [], onNavigate, onToggleBottomPanel, onNewConversation = () => onNavigate(null), sessionTitle = '当前会话', sessionMessageCount = 0, workspaceLabel = '本地工作区', environment = null, inspection = null, activeTool = null, onToolAction, onRefreshInspection, onShare, onCancelTask, onMinimize = () => undefined, onClose = () => undefined, onMaximize, isMaximized = false, initialEnvironmentOpen = false, children }: AgentWorkbenchProps): JSX.Element {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readPersistedBoolean('starchat.sidebar.collapsed', false));
  const sidebarToggleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { sidebarToggleRef.current?.focus(); }, [sidebarCollapsed]);
  useEffect(() => { writePersistedBoolean('starchat.sidebar.collapsed', sidebarCollapsed); }, [sidebarCollapsed]);
  const toolPanel = activeTool && inspection ? <section className="wb-inspection-panel" aria-label={activeTool === 'resources' ? '资源管理器' : '源代码管理'}><header><div><span className="section-kicker">{activeTool === 'resources' ? 'WORKSPACE RESOURCES' : 'SOURCE CONTROL'}</span><h2>{activeTool === 'resources' ? '资源管理器' : '源代码管理'}</h2></div><div className="wb-inspection-actions"><button className="secondary-button" type="button" onClick={onRefreshInspection}>刷新</button><button className="secondary-button" type="button" onClick={() => onToolAction?.(activeTool === 'resources' ? 'resources' : 'source')}>关闭</button></div></header>{activeTool === 'resources' ? <ul className="wb-resource-list">{(inspection.resources ?? []).map((entry) => <li key={entry.path}><WorkbenchIcon name={entry.kind === 'directory' ? 'folder' : 'file'} size={14} /><span>{entry.path}</span></li>)}</ul> : <div className="wb-source-summary"><p>{workbenchGitStatusLabel(inspection.source?.status ?? inspection.environment.gitStatus)} · {inspection.source?.changedFiles.length ?? inspection.environment.changedFiles} 个变更文件</p><p>分支：{inspection.source?.branch ?? (inspection.source?.head ? `分离 HEAD @ ${inspection.source.head}` : '未识别')}</p>{inspection.source?.changedFiles.length ? <ul>{inspection.source.changedFiles.map((path) => <li key={path}>{path}</li>)}</ul> : <p>当前没有可显示的未提交文件。</p>}</div>}</section> : null;
  return <div className="wb-shell" data-workbench="shell" data-workbench-structure="shared" data-workbench-theme="tokenized" data-agent-available={agentAvailable} data-sidebar-state={sidebarCollapsed ? 'collapsed' : 'expanded'}>
    <Topbar sidebarCollapsed={sidebarCollapsed} onToggleSidebar={() => setSidebarCollapsed((collapsed) => !collapsed)} sidebarToggleRef={sidebarToggleRef} onMinimize={onMinimize} onMaximize={onMaximize} onClose={onClose} isMaximized={isMaximized} />
    <Sidebar collapsed={sidebarCollapsed} activePage={activePage} onNavigate={onNavigate} onNewConversation={onNewConversation} workspaceLabel={workspaceLabel} sessionTitle={sessionTitle} sessionMeta={workbenchSessionMeta(sessionMessageCount, false)} />
    <div className="wb-main-grid">
      <CenterFrame activePage={activePage} initialEnvironmentOpen={initialEnvironmentOpen} environment={environment} onShare={onShare} onToggleSidebar={() => setSidebarCollapsed((collapsed) => !collapsed)}>{toolPanel}{children}</CenterFrame>
      <RightRail onNavigate={onNavigate} onToolAction={onToolAction} />
    </div>
    <BottomPanel open={bottomPanelOpen} onToggle={onToggleBottomPanel} agentTasks={agentTasks} onCancelTask={onCancelTask} />
  </div>;
}

export const Shell = AgentWorkbench;
