import { forwardRef, useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type HTMLAttributes, type ReactNode, type RefObject } from 'react';
import type { AgentTask } from '../../shared/agent';
import type { WorkbenchDiffPreview, WorkbenchEnvironment, WorkbenchFilePreview, WorkbenchInspection, WorkbenchVerificationResult, WorkbenchVerificationScript } from '../../shared/workbench';
import { workbenchGitStatusLabel, workbenchSessionMeta } from '../../shared/workbench';
import { AGENT_TASK_STATUS_LABELS, currentAgentStep, isActiveAgentTaskStatus } from './agent-ui-model';
import { SETTINGS_CARDS, type SettingsPageId, type WorkbenchPage } from './settings-schema';
import { WorkbenchIcon, type WorkbenchIconName } from './WorkbenchIcon';
import { WorkbenchResizeHandle } from './WorkbenchResizeHandle';
import type { ResolvedTheme } from '../../shared/theme';
import type { AuthorizedWorkspace, WorkbenchSession, WorkspaceTrustState } from '../../shared/session';
import {
  WORKBENCH_LAYOUT_LIMITS,
  maxBottomPanelHeight,
  maxRightRailWidth,
  readWorkbenchLayoutState,
  writeWorkbenchLayoutPatch,
  type WorkbenchLayoutState,
  type WorkbenchViewport
} from './workbench-layout';
export type { WorkbenchPage } from './settings-schema';
import './workbench/workbench.css';
import './workbench/reference.css';

const STARCHAT_ICON_URL = new URL('../../../../assets/icons/starchat-64.png', import.meta.url).href;
const STARCHAT_AVATAR_URL = new URL('./assets/starchat-brand.png', import.meta.url).href;

export function Surface({ className = '', children, ...props }: HTMLAttributes<HTMLDivElement>): JSX.Element {
  return <div {...props} className={`wb-surface ${className}`.trim()}>{children}</div>;
}

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string }>(function IconButton({ label, children, className = '', ...props }, ref): JSX.Element {
  return <button {...props} ref={ref} type="button" className={`wb-icon-button ${className}`.trim()} aria-label={label} title={label}>{children}</button>;
});

function BrandAvatar(): JSX.Element {
  return <span className="wb-brand-avatar wb-brand-avatar-crop" data-workbench="brand-avatar" data-workbench-avatar-source="starchat-character-icon" aria-hidden="true">
    <img src={STARCHAT_AVATAR_URL} alt="" draggable={false} />
  </span>;
}

const REFERENCE_WORKBENCH_LAYOUT: WorkbenchLayoutState = {
  version: 4,
  sidebarCollapsed: false,
  rightRailCollapsed: false,
  bottomPanelOpen: true,
  sidebarWidth: 280,
  rightRailWidth: 352,
  bottomPanelHeight: 174,
  characterWidth: 332
};

export const REFERENCE_WORKBENCH_VIEWPORT = { width: 1622, height: 969 } as const;

function rendererViewport(): WorkbenchViewport {
  if (typeof window === 'undefined') return { width: 1280, height: 900 };
  return { width: window.innerWidth, height: window.innerHeight };
}

interface TopbarProps {
  onMinimize: () => void;
  onClose: () => void;
  onMaximize?: () => void;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  sidebarToggleRef: RefObject<HTMLButtonElement>;
  isMaximized: boolean;
  theme?: ResolvedTheme;
  onToggleTheme?: () => void;
}

export function Topbar({ onMinimize, onClose, onMaximize, sidebarCollapsed, onToggleSidebar, sidebarToggleRef, isMaximized, theme = 'light', onToggleTheme = () => undefined }: TopbarProps): JSX.Element {
  const nextTheme = theme === 'dark' ? 'light' : 'dark';
  const themeLabel = nextTheme === 'dark' ? '切换深色主题' : '切换浅色主题';
  return <header className="wb-topbar" data-workbench="topbar" data-workbench-region="topbar">
    <div className="wb-drag-region wb-brand-lockup">
      <BrandAvatar />
      <span className="wb-brand-name">StarChat</span>
      <IconButton label={themeLabel} className="wb-theme-toggle" data-workbench="theme-toggle" data-theme-icon={nextTheme === 'dark' ? 'moon' : 'sun'} aria-pressed={theme === 'dark'} onClick={onToggleTheme}><WorkbenchIcon name={nextTheme === 'dark' ? 'moon' : 'sun'} size={17} /></IconButton>
      <IconButton label={sidebarCollapsed ? '展开项目栏' : '折叠项目栏'} className="wb-sidebar-toggle" ref={sidebarToggleRef} aria-expanded={!sidebarCollapsed} aria-controls="workbench-sidebar" onClick={onToggleSidebar}><WorkbenchIcon name="sidebar" size={24} /></IconButton>
    </div>
    <div className="wb-window-controls" aria-label="窗口控制">
      <IconButton label="最小化" className="wb-window-control" data-workbench-window-control="minimize" onClick={onMinimize}><WorkbenchIcon name="minimize" size={22} /></IconButton>
      <IconButton label={isMaximized ? '恢复窗口' : '最大化'} className="wb-window-control" data-workbench-window-control="maximize" aria-pressed={isMaximized} onClick={onMaximize}><WorkbenchIcon name="maximize" size={22} /></IconButton>
      <IconButton label="隐藏工作台" className="wb-window-control wb-window-close" data-workbench-window-control="close" onClick={onClose}><WorkbenchIcon name="close" size={22} /></IconButton>
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
  referenceFixture?: boolean;
  workspaces: readonly AuthorizedWorkspace[];
  sessions: readonly WorkbenchSession[];
  activeWorkspaceId: string | null;
  activeSessionId: string | null;
  onChooseWorkspace: () => void;
  onSelectWorkspace: (workspaceId: string) => void;
  onSelectSession: (sessionId: string) => void;
  onRenameSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
}

function SidebarProjectRow({ label, active = false, collapsed, onClick }: { label: string; active?: boolean; collapsed: boolean; onClick: () => void }): JSX.Element {
  return <button type="button" className={`wb-project-row ${active ? 'is-active' : ''}`} onClick={onClick} tabIndex={collapsed ? -1 : 0} aria-current={active ? 'page' : undefined}>
    <WorkbenchIcon name="folder" size={22} /><strong>{label}</strong><WorkbenchIcon name="chevron" size={19} className="wb-chevron" />
  </button>;
}

function SidebarSessionRow({ label, meta, active = false, collapsed, onClick, onRename, onDelete }: { label: string; meta: string; active?: boolean; collapsed: boolean; onClick: () => void; onRename?: () => void; onDelete?: () => void }): JSX.Element {
  return <div className={`wb-session-row ${active ? 'is-active' : ''}`}>
    <button type="button" className="wb-session-select" onClick={onClick} tabIndex={collapsed ? -1 : 0} aria-current={active ? 'page' : undefined}><WorkbenchIcon name="chat" size={20} /><span>{label}</span><small>{meta}</small></button>
    {active && !collapsed && onRename && onDelete ? <span className="wb-session-actions"><IconButton label="重命名会话" onClick={onRename}><WorkbenchIcon name="edit" size={13} /></IconButton><IconButton label="删除会话" onClick={onDelete}><WorkbenchIcon name="close" size={13} /></IconButton></span> : null}
  </div>;
}

export function Sidebar({ activePage, onNavigate, onNewConversation, collapsed, workspaceLabel, sessionTitle, sessionMeta, referenceFixture = false, workspaces, sessions, activeWorkspaceId, activeSessionId, onChooseWorkspace, onSelectWorkspace, onSelectSession, onRenameSession, onDeleteSession }: SidebarProps): JSX.Element {
  const settingsActive = activePage !== null;
  const personalSessions = sessions.filter((session) => session.contextType === 'personal');
  return <aside id="workbench-sidebar" className={`wb-sidebar ${collapsed ? 'is-collapsed' : 'is-expanded'}`} data-agent-domain="sessions" data-workbench="sidebar" data-workbench-region="sidebar" aria-hidden={collapsed} aria-label="StarChat 项目与会话导航">
    <button className="wb-new-chat" type="button" tabIndex={collapsed ? -1 : 0} onClick={onNewConversation}><WorkbenchIcon name="newChat" size={24} />新对话</button>
    <div className="wb-sidebar-heading"><strong>工作区</strong><span className="wb-sidebar-heading-actions"><IconButton label="搜索工作区" disabled tabIndex={collapsed ? -1 : 0}><WorkbenchIcon name="search" size={21} /></IconButton><IconButton label="筛选工作区" disabled tabIndex={collapsed ? -1 : 0}><WorkbenchIcon name="strength" size={21} /></IconButton><IconButton label="添加工作区" tabIndex={collapsed ? -1 : 0} onClick={onChooseWorkspace}><WorkbenchIcon name="folderPlus" size={22} /></IconButton></span></div>
    <div className="wb-project-tree">
      {personalSessions.length > 0 ? <div className="wb-workspace-group wb-personal-space"><SidebarProjectRow label="个人空间" collapsed={collapsed} active={!activeWorkspaceId} onClick={() => { onSelectSession(personalSessions[0].id); onNavigate(null); }} />{personalSessions.map((session) => <SidebarSessionRow key={session.id} label={session.title} collapsed={collapsed} meta={workbenchSessionMeta(session.messages.length, false)} active={session.id === activeSessionId && activePage === null} onClick={() => { onSelectSession(session.id); onNavigate(null); }} onRename={() => onRenameSession(session.id)} onDelete={() => onDeleteSession(session.id)} />)}</div> : null}
      {workspaces.map((workspace) => <div className="wb-workspace-group" key={workspace.id}><SidebarProjectRow label={workspace.label} collapsed={collapsed} active={workspace.id === activeWorkspaceId} onClick={() => { onSelectWorkspace(workspace.id); onNavigate(null); }} />{sessions.filter((session) => session.workspaceId === workspace.id).map((session) => <SidebarSessionRow key={session.id} label={session.title} collapsed={collapsed} meta={workbenchSessionMeta(session.messages.length, false)} active={session.id === activeSessionId && activePage === null} onClick={() => { onSelectSession(session.id); onNavigate(null); }} onRename={() => onRenameSession(session.id)} onDelete={() => onDeleteSession(session.id)} />)}</div>)}
      {workspaces.length === 0 && !referenceFixture ? <button className="wb-workspace-empty" type="button" onClick={onChooseWorkspace}><WorkbenchIcon name="folderPlus" size={20} /><span><strong>选择工作区</strong><small>授权项目目录后开始</small></span></button> : null}
      {referenceFixture ? <div className="wb-reference-secondary-workspace" data-workbench-reference="secondary-workspace">
        <SidebarProjectRow label={workspaceLabel || 'StarChat'} collapsed={collapsed} onClick={() => onNavigate(null)} />
        <SidebarSessionRow label={sessionTitle || '模型窗口交互'} collapsed={collapsed} meta={sessionMeta || '刚刚'} active onClick={() => onNavigate(null)} />
        <SidebarProjectRow label="StarChat" collapsed={collapsed} onClick={() => onNavigate(null)} />
        <SidebarSessionRow label="模型窗口交互" collapsed={collapsed} meta="7天" onClick={() => onNavigate(null)} />
      </div> : null}
    </div>
    <div className="wb-sidebar-footer">
      <button type="button" className={`wb-settings-entry ${settingsActive ? 'is-active' : ''}`} data-workbench="settings-entry" aria-label="设置" aria-current={settingsActive ? 'page' : undefined} tabIndex={collapsed ? -1 : 0} onClick={() => onNavigate('settings')}>
        <WorkbenchIcon name="settings" size={24} /><span>设置</span>
      </button>
    </div>
  </aside>;
}

const SETTINGS_ICON_BY_ID: Record<SettingsPageId, WorkbenchIconName> = {
  general: 'settings',
  appearance: 'sun',
  shortcuts: 'menu',
  chat: 'chat',
  personality: 'pet',
  model: 'model',
  voice: 'mic',
  service: 'source',
  behavior: 'settings',
  agent: 'task',
  permissions: 'check',
  terminal: 'terminal',
  browser: 'browser',
  git: 'source'
};

interface SettingsSidebarProps {
  activePage: WorkbenchPage;
  onNavigate: (page: WorkbenchPage) => void;
  collapsed: boolean;
}

/**
 * Settings deliberately uses the same first-layer navigation slot as the
 * workbench. The content stays in the shared React surface; this is not a
 * second native settings window or a collection of shortcut cards.
 */
export function SettingsSidebar({ activePage, onNavigate, collapsed }: SettingsSidebarProps): JSX.Element {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleCards = useMemo(() => SETTINGS_CARDS.filter((card) => {
    if (!normalizedQuery) return true;
    return `${card.title} ${card.description}`.toLocaleLowerCase().includes(normalizedQuery);
  }), [normalizedQuery]);
  const groups = [
    { id: 'personal', label: '个人' },
    { id: 'character', label: '角色' },
    { id: 'agent', label: 'Agent' },
    { id: 'integration', label: '集成' }
  ] as const;

  return <aside id="workbench-sidebar" className={`wb-sidebar wb-settings-sidebar ${collapsed ? 'is-collapsed' : 'is-expanded'}`} data-workbench="sidebar" data-workbench-region="sidebar" data-workbench-sidebar-mode="settings" aria-hidden={collapsed} aria-label="设置导航">
    <div className="wb-settings-sidebar-top">
      <button type="button" className="wb-settings-back" onClick={() => onNavigate(null)} tabIndex={collapsed ? -1 : 0}>
        <span aria-hidden="true">←</span><span>返回应用</span>
      </button>
      <div className="wb-settings-title"><WorkbenchIcon name="settings" size={18} /><strong>设置</strong></div>
    </div>
    <label className="wb-settings-search">
      <WorkbenchIcon name="search" size={16} />
      <span className="visually-hidden">搜索设置</span>
      <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索设置" tabIndex={collapsed ? -1 : 0} />
    </label>
    <nav className="wb-settings-nav" aria-label="设置分类">
      <span className="wb-settings-group-label">StarChat</span>
      <button type="button" className={`wb-settings-nav-item ${activePage === 'settings' ? 'is-active' : ''}`} onClick={() => onNavigate('settings')} tabIndex={collapsed ? -1 : 0} aria-current={activePage === 'settings' ? 'page' : undefined}>
        <WorkbenchIcon name="layout" size={17} /><span>设置总览</span>
      </button>
      {groups.map((group) => {
        const cards = visibleCards.filter((card) => card.group === group.id);
        return cards.length ? <div className="wb-settings-nav-group" key={group.id}><span className="wb-settings-group-label">{group.label}</span>{cards.map((card) => <button type="button" className={`wb-settings-nav-item ${activePage === card.id ? 'is-active' : ''}`} key={card.id} data-settings-page={card.id} onClick={() => onNavigate(card.id)} tabIndex={collapsed ? -1 : 0} aria-current={activePage === card.id ? 'page' : undefined}><WorkbenchIcon name={SETTINGS_ICON_BY_ID[card.id]} size={17} /><span>{card.title}</span></button>)}</div> : null;
      })}
      {visibleCards.length === 0 ? <span className="wb-settings-search-empty">没有匹配的设置</span> : null}
    </nav>
    <p className="wb-settings-sidebar-note">配置保存在本地，并通过安全 IPC 应用到桌宠与 Agent。</p>
  </aside>;
}

export type WorkbenchToolAction = 'resources' | 'source' | 'chat' | 'tasks' | 'terminal' | 'browser';
export type ActiveWorkbenchTool = Exclude<WorkbenchToolAction, 'chat'>;
type AgentToolDomain = 'workspace-read' | 'git-read' | 'agent-control' | 'verification' | 'browser-safe' | 'conversation';
interface ToolCardProps { label: string; icon: WorkbenchIconName; domain: AgentToolDomain; action?: WorkbenchToolAction; disabled?: boolean; collapsed?: boolean; onNavigate?: (page: WorkbenchPage) => void; onToolAction?: (action: WorkbenchToolAction) => void; }

function ToolCard({ label, icon, domain, action, disabled = false, collapsed = false, onNavigate, onToolAction }: ToolCardProps): JSX.Element {
  const onClick = action === 'chat'
    ? (onToolAction ? () => onToolAction('chat') : onNavigate ? () => onNavigate(null) : undefined)
    : action && onToolAction ? () => onToolAction(action) : undefined;
  const content = <><span className="wb-tool-icon"><WorkbenchIcon name={icon} size={28} /></span><strong>{label}</strong></>;
  if (disabled) return <div className="wb-tool-card is-disabled" data-agent-domain={domain} data-capability-state="disabled" aria-disabled="true">{content}<small>未启用</small></div>;
  if (!onClick) return <div className="wb-tool-card is-disabled" data-agent-domain={domain} data-capability-state="disabled" aria-disabled="true">{content}<small>当前窗口未连接</small></div>;
  return <button className="wb-tool-card" type="button" data-agent-domain={domain} data-capability-state="available" onClick={onClick} tabIndex={collapsed ? -1 : 0}>{content}</button>;
}

interface RightRailProps { onNavigate?: (page: WorkbenchPage) => void; onToolAction?: (action: WorkbenchToolAction) => void; collapsed?: boolean; }

export function RightRail({ onNavigate, onToolAction, collapsed = false }: RightRailProps): JSX.Element {
  return <aside id="workbench-right-rail" className={`wb-right-rail ${collapsed ? 'is-collapsed' : 'is-expanded'}`} data-workbench="right-rail" data-workbench-region="right" data-right-rail-state={collapsed ? 'collapsed' : 'expanded'} aria-hidden={collapsed} aria-label="Agent 工作流工具">
    <div className="wb-rail-topline"><IconButton label="添加工作流工具未启用" disabled><WorkbenchIcon name="plus" size={24} /></IconButton></div>
    <div className="wb-tool-grid" data-agent-ui="capabilities" aria-label="Agent 工具入口">
      <ToolCard label="资源管理器" icon="resource" domain="workspace-read" action="resources" collapsed={collapsed} onToolAction={onToolAction} />
      <ToolCard label="源代码管理" icon="source" domain="git-read" action="source" collapsed={collapsed} onToolAction={onToolAction} />
      <ToolCard label="任务管理" icon="task" domain="agent-control" action="tasks" collapsed={collapsed} onToolAction={onToolAction} />
      <ToolCard label="终端" icon="terminal" domain="verification" action="terminal" collapsed={collapsed} onToolAction={onToolAction} />
      <ToolCard label="浏览器" icon="browser" domain="browser-safe" action="browser" collapsed={collapsed} onToolAction={onToolAction} />
      <ToolCard label="侧边聊天" icon="chat" domain="conversation" action="chat" collapsed={collapsed} onNavigate={onNavigate} onToolAction={onToolAction} />
    </div>
  </aside>;
}

interface WorkbenchToolPanelProps {
  activeTool: ActiveWorkbenchTool;
  inspection: WorkbenchInspection | null;
  filePreview: WorkbenchFilePreview | null;
  diffPreview: WorkbenchDiffPreview | null;
  verification: WorkbenchVerificationResult | null;
  tasks: readonly AgentTask[];
  busy: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onOpenResource: (path: string) => void;
  onPreviewFile: (path: string) => void;
  onPreviewDiff: (path: string) => void;
  onVerify: (script: WorkbenchVerificationScript) => void;
  onCancelTask?: (taskId: string) => void;
  onApproveTask?: (task: AgentTask, approved: boolean) => void;
  onRetryTask?: (task: AgentTask) => void;
  onRespondTask?: (task: AgentTask) => void;
}

const STEP_STATUS_LABELS = { started: '进行中', completed: '已完成', waiting: '等待中', failed: '失败' } as const;

function AgentApprovalCenter({ task, onApprove }: { task: AgentTask; onApprove?: (task: AgentTask, approved: boolean) => void }): JSX.Element | null {
  const approval = task.approval;
  if (!approval) return null;
  return <section className="wb-approval-center" data-agent-ui="approval-center" aria-labelledby={`approval-${approval.id}`}>
    <header><div><span className="section-kicker">WRITE APPROVAL</span><h4 id={`approval-${approval.id}`}>写入前审批</h4></div><span className="wb-approval-risk">将修改本地文件</span></header>
    <p>{approval.plan}</p>
    {approval.preview ? <>
      <div className="wb-approval-summary"><strong>{approval.preview.files.length} 个文件</strong><span className="is-addition">+{approval.preview.additions}</span><span className="is-deletion">−{approval.preview.deletions}</span></div>
      <ul className="wb-approval-files" aria-label="待修改文件">{approval.preview.files.map((file) => <li key={file}>{file}</li>)}</ul>
      <details><summary>查看精确补丁</summary><pre tabIndex={0} aria-label="待批准的精确补丁">{approval.preview.patch}</pre></details>
    </> : approval.toolName === 'apply_patch' ? <p className="wb-approval-warning">该写入计划没有可核对的补丁正文，建议拒绝并让 Agent 重新生成。</p> : null}
    <div className="wb-task-actions"><button type="button" className="secondary-button" onClick={() => onApprove?.(task, false)}>拒绝</button><button type="button" className="primary-button" disabled={approval.toolName === 'apply_patch' && !approval.preview} onClick={() => onApprove?.(task, true)}>{approval.toolName === 'apply_patch' ? '批准并写入' : '批准计划'}</button></div>
  </section>;
}

function AgentTaskDetail({ task, onApprove, onRetry, onRespond, onCancel }: { task: AgentTask; onApprove?: (task: AgentTask, approved: boolean) => void; onRetry?: (task: AgentTask) => void; onRespond?: (task: AgentTask) => void; onCancel?: (taskId: string) => void }): JSX.Element {
  const retryable = ['interrupted', 'failed', 'cancelled', 'timed_out'].includes(task.status);
  return <>
    <header><span className={`wb-task-status is-${task.status}`}>{AGENT_TASK_STATUS_LABELS[task.status].label}</span><h3>{task.message}</h3><p>{task.route.explain}</p>{task.resumedFromTaskId ? <p className="wb-task-lineage">由中断任务重新执行 · 原任务 {task.resumedFromTaskId.slice(0, 8)}</p> : null}</header>
    <ol className="wb-agent-timeline" data-agent-ui="timeline" aria-label="Agent 执行时间线">{task.steps.map((step) => <li key={step.id} className={`is-${step.status}`}><WorkbenchIcon name={step.status === 'completed' ? 'agentDone' : 'agentStep'} size={16} /><span><strong>{step.summary}</strong><small>{STEP_STATUS_LABELS[step.status]} · {new Date(step.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</small></span></li>)}</ol>
    <AgentApprovalCenter task={task} onApprove={onApprove} />
    {task.result ? <section className="wb-task-result" aria-label="任务结果"><h4>结果</h4><p>{task.result.summary}</p>{task.result.changedFiles?.length ? <p>已修改：{task.result.changedFiles.join('、')}</p> : null}{task.result.verification ? <p className={task.result.verification.ok ? 'is-success' : 'is-error'}>自动验证 {task.result.verification.script}：{task.result.verification.ok ? '通过' : '失败'}</p> : null}</section> : null}
    <div className="wb-task-actions">{task.input ? <button type="button" className="primary-button" onClick={() => onRespond?.(task)}>补充信息</button> : null}{isActiveAgentTaskStatus(task.status) ? <button type="button" className="secondary-button" onClick={() => onCancel?.(task.id)}>停止任务</button> : null}{retryable ? <button type="button" className="primary-button" onClick={() => onRetry?.(task)}>重新执行</button> : null}</div>
    {task.error ? <p className="wb-tool-error" role="alert">{task.error}</p> : null}
  </>;
}

function ToolPanelHeader({ kicker, title, busy, onRefresh, onClose }: { kicker: string; title: string; busy: boolean; onRefresh: () => void; onClose: () => void }): JSX.Element {
  return <header className="wb-tool-panel-header"><div><span className="section-kicker">{kicker}</span><h2>{title}</h2></div><div className="wb-inspection-actions"><button className="secondary-button" type="button" disabled={busy} onClick={onRefresh}>刷新</button><IconButton label="关闭工具面板" onClick={onClose}><WorkbenchIcon name="close" size={16} /></IconButton></div></header>;
}

function WorkbenchToolPanel(props: WorkbenchToolPanelProps): JSX.Element {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(props.tasks[0]?.id ?? null);
  const [command, setCommand] = useState('git status --short');
  const [commandOutput, setCommandOutput] = useState('');
  const [commandBusy, setCommandBusy] = useState(false);
  const [browserUrl, setBrowserUrl] = useState('https://');
  const [browserStatus, setBrowserStatus] = useState('');
  const [commitMessage, setCommitMessage] = useState('');
  const [commitStatus, setCommitStatus] = useState('');
  useEffect(() => {
    if (!props.tasks.some((task) => task.id === selectedTaskId)) setSelectedTaskId(props.tasks[0]?.id ?? null);
  }, [props.tasks, selectedTaskId]);
  const selectedTask = props.tasks.find((task) => task.id === selectedTaskId) ?? props.tasks[0] ?? null;
  const runCommand = async (): Promise<void> => {
    setCommandBusy(true);
    try {
      const result = await window.starchat.workbench.command({ command });
      setCommandOutput(`${result.ok ? '完成' : `退出码 ${result.code}`} · ${result.command}\n${result.output || '命令没有输出。'}`);
    } catch (reason) {
      setCommandOutput(reason instanceof Error ? reason.message : '受控命令执行失败');
    } finally { setCommandBusy(false); }
  };
  const openBrowser = async (): Promise<void> => {
    try {
      const result = await window.starchat.workbench.openUrl({ url: browserUrl });
      setBrowserStatus(`已在系统浏览器打开：${result.url}`);
    } catch (reason) { setBrowserStatus(reason instanceof Error ? reason.message : '网页打开失败'); }
  };
  const commitStaged = async (): Promise<void> => {
    const message = commitMessage.trim();
    if (!message || !window.confirm(`提交当前已暂存变更？\n\n${message}\n\nStarChat 不会自动暂存或推送。`)) return;
    try {
      const result = await window.starchat.workbench.gitCommit({ message });
      setCommitStatus(result.ok ? `提交完成：${result.message}` : result.output || '提交失败');
      if (result.ok) { setCommitMessage(''); props.onRefresh(); }
    } catch (reason) { setCommitStatus(reason instanceof Error ? reason.message : 'Git 提交失败'); }
  };

  if (props.activeTool === 'resources') {
    const path = props.inspection?.resourcePath ?? '';
    return <section className="wb-tool-panel" data-workbench-tool="resources" aria-label="资源管理器">
      <ToolPanelHeader kicker="WORKSPACE RESOURCES" title="资源管理器" busy={props.busy} onRefresh={props.onRefresh} onClose={props.onClose} />
      <div className="wb-tool-location"><IconButton label="返回上级目录" disabled={props.inspection?.resourceParentPath === null || props.busy} onClick={() => props.onOpenResource(props.inspection?.resourceParentPath ?? '')}><WorkbenchIcon name="arrowUp" size={15} /></IconButton><span><WorkbenchIcon name="folder" size={15} />{path || '工作区根目录'}</span></div>
      <div className="wb-tool-split"><nav className="wb-resource-tree" aria-label="工作区文件列表">{(props.inspection?.resources ?? []).map((entry) => <button type="button" key={entry.path} onClick={() => entry.kind === 'directory' ? props.onOpenResource(entry.path) : props.onPreviewFile(entry.path)}><WorkbenchIcon name={entry.kind === 'directory' ? 'folder' : 'file'} size={15} /><span>{entry.path.split('/').at(-1)}</span><small>{entry.kind === 'directory' ? '目录' : '文件'}</small></button>)}{props.inspection?.resources?.length === 0 ? <p className="wb-tool-empty">当前目录没有可显示的文件。</p> : null}</nav><article className="wb-file-preview" aria-label="文件预览">{props.filePreview ? <><header><strong>{props.filePreview.path}</strong><span>{props.filePreview.language} · {props.filePreview.lineCount} 行</span></header><pre tabIndex={0}>{props.filePreview.content}</pre></> : <div className="wb-tool-empty"><WorkbenchIcon name="file" size={24} /><p>选择一个文本文件进行只读预览。</p></div>}</article></div>
    </section>;
  }

  if (props.activeTool === 'source') {
    const source = props.inspection?.source;
    return <section className="wb-tool-panel" data-workbench-tool="source" aria-label="源代码管理">
      <ToolPanelHeader kicker="SOURCE CONTROL" title="源代码管理" busy={props.busy} onRefresh={props.onRefresh} onClose={props.onClose} />
      <div className="wb-source-overview"><strong>{workbenchGitStatusLabel(source?.status ?? props.inspection?.environment.gitStatus ?? 'unavailable')}</strong><span>{source?.branch ?? (source?.head ? `分离 HEAD @ ${source.head}` : '未识别分支')} · {source?.changedFiles.length ?? 0} 个变更</span></div>
      <div className="wb-source-commit"><input aria-label="Git 提交说明" value={commitMessage} maxLength={120} onChange={(event) => setCommitMessage(event.target.value)} placeholder="提交已暂存变更（不会自动暂存）" /><button className="primary-button" type="button" disabled={!commitMessage.trim()} onClick={() => void commitStaged()}>提交</button>{commitStatus ? <span role="status">{commitStatus}</span> : null}</div>
      <div className="wb-tool-split"><nav className="wb-resource-tree" aria-label="变更文件列表">{(source?.changedFiles ?? []).map((path) => <button type="button" key={path} onClick={() => props.onPreviewDiff(path)}><WorkbenchIcon name="source" size={15} /><span>{path}</span></button>)}{source?.changedFiles.length === 0 ? <p className="wb-tool-empty">当前没有可显示的未提交变更。</p> : null}</nav><article className="wb-file-preview wb-diff-preview" aria-label="Git 差异预览">{props.diffPreview ? <><header><strong>{props.diffPreview.path}</strong><span>只读 diff{props.diffPreview.truncated ? ' · 已截断' : ''}</span></header><pre tabIndex={0}>{props.diffPreview.patch || '该文件没有工作树差异。'}</pre></> : <div className="wb-tool-empty"><WorkbenchIcon name="source" size={24} /><p>选择变更文件查看只读差异。</p></div>}</article></div>
    </section>;
  }

  if (props.activeTool === 'tasks') {
    return <section className="wb-tool-panel" data-workbench-tool="tasks" aria-label="任务管理">
      <ToolPanelHeader kicker="AGENT TASKS" title="任务管理" busy={false} onRefresh={props.onRefresh} onClose={props.onClose} />
      <div className="wb-tool-split"><nav className="wb-task-list" aria-label="会话任务列表">{props.tasks.map((task) => <button type="button" key={task.id} className={task.id === selectedTask?.id ? 'is-active' : ''} onClick={() => setSelectedTaskId(task.id)}><strong>{task.message}</strong><span>{AGENT_TASK_STATUS_LABELS[task.status].label} · {currentAgentStep(task)}</span></button>)}{props.tasks.length === 0 ? <p className="wb-tool-empty">当前会话暂无 Agent 任务。</p> : null}</nav><article className="wb-task-detail" aria-label="任务详情">{selectedTask ? <AgentTaskDetail task={selectedTask} onApprove={props.onApproveTask} onRetry={props.onRetryTask} onRespond={props.onRespondTask} onCancel={props.onCancelTask} /> : <div className="wb-tool-empty"><p>选择任务查看步骤、审批和结果。</p></div>}</article></div>
    </section>;
  }

  if (props.activeTool === 'browser') {
    return <section className="wb-tool-panel" data-workbench-tool="browser" aria-label="安全浏览器">
      <ToolPanelHeader kicker="SAFE BROWSER" title="浏览器" busy={false} onRefresh={() => setBrowserStatus('')} onClose={props.onClose} />
      <p className="wb-verification-note">仅允许 http/https 地址，并交给系统默认浏览器打开；不注入脚本、不读取登录状态。</p>
      <form className="wb-browser-form" onSubmit={(event) => { event.preventDefault(); void openBrowser(); }}><input aria-label="网页地址" value={browserUrl} onChange={(event) => setBrowserUrl(event.target.value)} placeholder="https://example.com" /><button className="primary-button" type="submit">打开网页</button></form>
      <div className="wb-browser-boundary"><WorkbenchIcon name="browser" size={30} /><strong>外部安全边界</strong><p>网页运行在系统浏览器中，StarChat 不获取 Cookie、密码、页面内容或自动化权限。</p>{browserStatus ? <span role="status">{browserStatus}</span> : null}</div>
    </section>;
  }

  return <section className="wb-tool-panel" data-workbench-tool="terminal" aria-label="受控验证终端">
    <ToolPanelHeader kicker="CONTROLLED TERMINAL" title="受控终端" busy={props.busy || commandBusy} onRefresh={() => setCommandOutput('')} onClose={props.onClose} />
    <p className="wb-verification-note">执行真实子进程，但只接受 Git 只读命令和项目验证脚本；不启动任意 PowerShell 或 Shell。</p>
    <form className="wb-terminal-command" onSubmit={(event) => { event.preventDefault(); void runCommand(); }}><span aria-hidden="true">›</span><input aria-label="受控终端命令" list="workbench-command-list" value={command} onChange={(event) => setCommand(event.target.value)} /><datalist id="workbench-command-list"><option value="git status --short" /><option value="git diff --stat" /><option value="git diff --name-only" /><option value="pnpm run test" /><option value="pnpm run typecheck" /><option value="pnpm run build" /><option value="pnpm run verify:live2d" /></datalist><button className="primary-button" type="submit" disabled={commandBusy}>运行</button></form>
    <div className="wb-verification-actions">{(['test', 'typecheck', 'build', 'verify:live2d'] as const).map((script) => <button type="button" key={script} disabled={props.busy} onClick={() => props.onVerify(script)}><WorkbenchIcon name="terminal" size={15} /><span>pnpm run {script}</span></button>)}</div>
    <article className="wb-verification-output" aria-live="polite">{commandBusy || props.busy ? <p>正在运行受控命令…</p> : commandOutput ? <pre tabIndex={0}>{commandOutput}</pre> : props.verification ? <><header><strong>{props.verification.script}</strong><span className={props.verification.ok ? 'is-success' : 'is-error'}>{props.verification.ok ? '通过' : '失败'}</span></header><pre tabIndex={0}>{props.verification.output || '脚本已完成，没有输出。'}</pre></> : <p>输入白名单命令或选择验证脚本。</p>}</article>
  </section>;
}

interface EnvironmentPopoverProps { onClose: () => void; environment: WorkbenchEnvironment | null; workspaceTrust?: WorkspaceTrustState; onSetWorkspaceTrust?: (trust: WorkspaceTrustState) => void; referenceFixture?: boolean; }

function EnvironmentPopover({ onClose, environment, workspaceTrust = 'untrusted', onSetWorkspaceTrust = () => undefined, referenceFixture = false }: EnvironmentPopoverProps): JSX.Element {
  const branch = environment?.branch ?? (environment?.head ? `分离 HEAD @ ${environment.head}` : '未识别');
  if (referenceFixture) {
    return <aside className="wb-environment-popover wb-environment-popover-reference" data-workbench="environment-popover" data-workbench-reference="environment" aria-label="环境信息" role="dialog">
      <div className="wb-environment-heading"><strong>环境信息</strong><IconButton label="添加环境信息" disabled><WorkbenchIcon name="plus" size={15} /></IconButton></div>
      <div className="wb-environment-list">
        <span><WorkbenchIcon name="file" size={15} />变更</span>
        <span><WorkbenchIcon name="folder" size={15} />工作树 <WorkbenchIcon name="chevron" size={14} className="wb-environment-chevron" /></span>
        <span className="wb-environment-code"><WorkbenchIcon name="source" size={15} />codex/project-008-settings</span>
        <span><WorkbenchIcon name="share" size={15} />提交或推送</span>
      </div>
      <div className="wb-environment-source"><div><strong>来源</strong><IconButton label="添加来源" disabled><WorkbenchIcon name="plus" size={15} /></IconButton></div>
        <span><i className="wb-environment-source-avatar" aria-hidden="true"><img src={STARCHAT_AVATAR_URL} alt="" draggable={false} /></i>角色图标参考</span>
        <span><i className="wb-environment-reference-thumb" aria-hidden="true" />界面布局参考</span>
        <span><WorkbenchIcon name="share" size={15} />查看全部</span>
      </div>
    </aside>;
  }
  return <aside className="wb-environment-popover" data-workbench="environment-popover" aria-label="环境信息" role="dialog">
    <div className="wb-environment-heading"><strong>环境信息</strong><IconButton label="关闭环境信息" onClick={onClose}><WorkbenchIcon name="close" size={15} /></IconButton></div>
    <div className="wb-environment-list">
      <span><WorkbenchIcon name="file" size={15} />变更 <b>{environment?.changedFiles ?? '读取中'}</b></span>
      <span><WorkbenchIcon name="folder" size={15} />工作树 <b className="wb-environment-code">{branch}</b></span>
      <span className="wb-environment-code"><WorkbenchIcon name="source" size={15} />{environment?.gitRoot ?? 'Git 根目录未识别'}</span>
      <span><WorkbenchIcon name="share" size={15} />{environment ? workbenchGitStatusLabel(environment.gitStatus) : '正在读取 Git 状态'}</span>
    </div>
    <div className="wb-environment-source"><div><strong>工作区路径</strong></div><span className="wb-environment-code"><WorkbenchIcon name="folder" size={15} />{environment?.workspaceRoot ?? '等待授权工作区'}</span></div>
    <div className="wb-trust-control" data-workspace-trust={workspaceTrust}><div><strong>执行权限</strong><span>{workspaceTrust === 'trusted-execution' ? '已允许脚本执行' : workspaceTrust === 'read-only' ? '仅允许读取' : '默认未信任'}</span></div><div className="wb-trust-actions"><button type="button" className="secondary-button" disabled={workspaceTrust === 'trusted-execution'} onClick={() => onSetWorkspaceTrust('trusted-execution')}>允许脚本</button><button type="button" className="secondary-button" disabled={workspaceTrust === 'read-only'} onClick={() => onSetWorkspaceTrust('read-only')}>仅读取</button></div></div>
  </aside>;
}

interface CenterFrameProps { activePage: WorkbenchPage; children: ReactNode; initialEnvironmentOpen?: boolean; environment: WorkbenchEnvironment | null; workspaceTrust?: WorkspaceTrustState; onSetWorkspaceTrust?: (trust: WorkspaceTrustState) => void; onShare?: () => Promise<string>; bottomPanelOpen: boolean; onToggleBottomPanel: () => void; rightRailCollapsed: boolean; onToggleRightRail: () => void; rightRailToggleRef: RefObject<HTMLButtonElement>; onToolAction?: (action: WorkbenchToolAction) => void; centerTitle?: string; referenceEnvironment?: boolean; }

function CenterFrame({ activePage, children, initialEnvironmentOpen = false, environment, workspaceTrust, onSetWorkspaceTrust, onShare, bottomPanelOpen, onToggleBottomPanel, rightRailCollapsed, onToggleRightRail, rightRailToggleRef, onToolAction, centerTitle, referenceEnvironment = false }: CenterFrameProps): JSX.Element {
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

  const title = centerTitle ?? (activePage === null
    ? '当前会话'
    : activePage === 'settings'
      ? '设置'
      : SETTINGS_CARDS.find((card) => card.id === activePage)?.title ?? '设置');
  return <section className="wb-center" data-workbench="center" data-workbench-region="center" aria-label={activePage === null ? '主工作区' : '设置内容'}>
    <div className="wb-center-scroll">
      <div className="wb-center-frame" data-workbench-structure="shared" data-workbench-theme="tokenized" data-workbench-mode={activePage === null ? 'workbench' : 'settings'}>
        {activePage === null ? <header className="wb-center-toolbar">
          <div className="wb-center-title"><WorkbenchIcon name="folder" size={26} /><strong>{title}</strong></div>
          <div className="wb-center-actions">
             <button type="button" className="wb-share-action" onClick={() => void share()}><WorkbenchIcon name="share" size={24} /><span>分享</span></button>
             <IconButton label="环境信息" data-workbench="environment-trigger" ref={environmentTriggerRef} aria-expanded={environmentOpen} onClick={() => setEnvironmentOpen((open) => !open)}><WorkbenchIcon name="environment" size={24} /></IconButton>
             <IconButton label={bottomPanelOpen ? '折叠底部面板' : '展开底部面板'} data-workbench="bottom-panel-toggle" aria-expanded={bottomPanelOpen} aria-controls="workbench-bottom-panel" onClick={onToggleBottomPanel}><WorkbenchIcon name="panel" size={24} /></IconButton>
             <IconButton label={rightRailCollapsed ? '展开侧边工具栏' : '折叠侧边工具栏'} data-workbench="right-rail-toggle" ref={rightRailToggleRef} aria-expanded={!rightRailCollapsed} aria-controls="workbench-right-rail" onClick={onToggleRightRail}><WorkbenchIcon name="columns" size={24} /></IconButton>
          </div>
        </header> : null}
        {activePage === null && environmentOpen ? <div ref={environmentPopoverRef}><EnvironmentPopover environment={environment} workspaceTrust={workspaceTrust} onSetWorkspaceTrust={onSetWorkspaceTrust} referenceFixture={referenceEnvironment} onClose={closeEnvironment} /></div> : null}
        {shareStatus ? <p className="wb-action-status" role="status">{shareStatus}</p> : null}
        <div className={`wb-center-content ${activePage === null ? 'is-agent-home' : 'is-settings'}`}>{children}</div>
      </div>
    </div>
  </section>;
}

interface BottomPanelProps { open: boolean; onToggle: () => void; agentTasks?: readonly AgentTask[]; onCancelTask?: (taskId: string) => void; }

export function BottomPanel({ open, onToggle, agentTasks = [], onCancelTask }: BottomPanelProps): JSX.Element {
  return <section id="workbench-bottom-panel" className={`wb-bottom-panel ${open ? 'is-open' : 'is-collapsed'}`} data-agent-domain="verification" data-workbench="bottom-panel" data-workbench-terminal="verification-log" data-workbench-region="bottom" data-open={open} aria-expanded={open} aria-hidden={!open} aria-label="底部受控验证日志">
    <div className="wb-terminal-tabs"><span className="wb-terminal-tab is-active"><WorkbenchIcon name="terminal" size={15} />受控验证日志</span><button className="wb-terminal-add" type="button" aria-label="添加面板未启用" title="受控验证日志为唯一底部面板" disabled><WorkbenchIcon name="plus" size={15} /></button><button className="wb-terminal-close" type="button" tabIndex={open ? 0 : -1} aria-label={open ? '收起受控验证日志' : '展开受控验证日志'} onClick={onToggle}>{open ? <WorkbenchIcon name="close" size={15} /> : <WorkbenchIcon name="arrowUp" size={15} />}</button></div>
    {open ? <div className="wb-terminal-body" data-workbench="verification-log"><p className="wb-verification-note">这里显示 Agent 任务和白名单验证结果；未启用任意 PowerShell 或 Shell 输入。</p>{agentTasks.length === 0 ? <p className="wb-verification-empty">暂无 Agent 任务或受控验证记录。</p> : <ul className="wb-verification-list">{agentTasks.slice(0, 8).map((task) => <li key={task.id}><div><strong>{AGENT_TASK_STATUS_LABELS[task.status].label} · {task.message}</strong><span>{currentAgentStep(task)}</span></div>{isActiveAgentTaskStatus(task.status) && onCancelTask ? <button className="wb-task-cancel" type="button" onClick={() => onCancelTask(task.id)}>停止</button> : null}</li>)}</ul>}</div> : null}
  </section>;
}

interface AgentWorkbenchProps {
  activePage: WorkbenchPage;
  roleName: string;
  modelLabel: string;
  themeLabel?: string;
  theme?: ResolvedTheme;
  onToggleTheme?: () => void;
  bottomPanelOpen?: boolean;
  agentAvailable?: boolean;
  agentTasks?: readonly AgentTask[];
  onNavigate: (page: WorkbenchPage) => void;
  onToggleBottomPanel: () => void;
  onNewConversation?: () => void;
  sessionTitle?: string;
  sessionMetaLabel?: string;
  sessionMessageCount?: number;
  workspaceLabel?: string;
  workspaces?: readonly AuthorizedWorkspace[];
  sessions?: readonly WorkbenchSession[];
  activeWorkspaceId?: string | null;
  activeSessionId?: string | null;
  onChooseWorkspace?: () => void;
  onSelectWorkspace?: (workspaceId: string) => void;
  onSelectSession?: (sessionId: string) => void;
  onRenameSession?: (sessionId: string) => void;
  onDeleteSession?: (sessionId: string) => void;
  workspaceTrust?: WorkspaceTrustState;
  onSetWorkspaceTrust?: (trust: WorkspaceTrustState) => void;
  environment?: WorkbenchEnvironment | null;
  inspection?: WorkbenchInspection | null;
  activeTool?: ActiveWorkbenchTool | null;
  filePreview?: WorkbenchFilePreview | null;
  diffPreview?: WorkbenchDiffPreview | null;
  verification?: WorkbenchVerificationResult | null;
  toolBusy?: boolean;
  onToolAction?: (action: WorkbenchToolAction) => void;
  onRefreshInspection?: () => void;
  onOpenResource?: (path: string) => void;
  onPreviewFile?: (path: string) => void;
  onPreviewDiff?: (path: string) => void;
  onVerify?: (script: WorkbenchVerificationScript) => void;
  onApproveTask?: (task: AgentTask, approved: boolean) => void;
  onRetryTask?: (task: AgentTask) => void;
  onRespondTask?: (task: AgentTask) => void;
  onShare?: () => Promise<string>;
  onCancelTask?: (taskId: string) => void;
  onMinimize?: () => void;
  onClose?: () => void;
  onMaximize?: () => void;
  isMaximized?: boolean;
  initialEnvironmentOpen?: boolean;
  centerTitle?: string;
  referenceEnvironment?: boolean;
  referenceLayout?: boolean;
  referenceFixture?: boolean;
  children: ReactNode;
}

export function AgentWorkbench({ activePage, roleName: _roleName, modelLabel: _modelLabel, theme = 'light', onToggleTheme = () => undefined, bottomPanelOpen = false, agentAvailable = true, agentTasks = [], onNavigate, onToggleBottomPanel, onNewConversation = () => onNavigate(null), sessionTitle = '当前会话', sessionMetaLabel, sessionMessageCount = 0, workspaceLabel = '本地工作区', workspaces = [], sessions = [], activeWorkspaceId = null, activeSessionId = null, onChooseWorkspace = () => undefined, onSelectWorkspace = () => undefined, onSelectSession = () => undefined, onRenameSession = () => undefined, onDeleteSession = () => undefined, workspaceTrust = 'untrusted', onSetWorkspaceTrust = () => undefined, environment = null, inspection = null, activeTool = null, filePreview = null, diffPreview = null, verification = null, toolBusy = false, onToolAction, onRefreshInspection = () => undefined, onOpenResource = () => undefined, onPreviewFile = () => undefined, onPreviewDiff = () => undefined, onVerify = () => undefined, onApproveTask, onRetryTask = (task) => { void window.starchat.agent.retry(task.id); }, onRespondTask, onShare, onCancelTask, onMinimize = () => undefined, onClose = () => undefined, onMaximize, isMaximized = false, initialEnvironmentOpen = false, centerTitle, referenceEnvironment = false, referenceLayout = false, referenceFixture = false, children }: AgentWorkbenchProps): JSX.Element {
  const initialLayout = useMemo(() => referenceLayout ? REFERENCE_WORKBENCH_LAYOUT : readWorkbenchLayoutState(), [referenceLayout]);
  const [viewport, setViewport] = useState(rendererViewport);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(initialLayout.sidebarCollapsed);
  const [rightRailCollapsed, setRightRailCollapsed] = useState(initialLayout.rightRailCollapsed);
  const [sidebarWidth, setSidebarWidth] = useState(initialLayout.sidebarWidth);
  const [rightRailWidth, setRightRailWidth] = useState(initialLayout.rightRailWidth);
  const [bottomPanelHeight, setBottomPanelHeight] = useState(initialLayout.bottomPanelHeight);
  const sidebarToggleRef = useRef<HTMLButtonElement>(null);
  const rightRailToggleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const updateViewport = (): void => setViewport(rendererViewport());
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);
  useEffect(() => { sidebarToggleRef.current?.focus(); }, [sidebarCollapsed]);
  useEffect(() => { rightRailToggleRef.current?.focus(); }, [rightRailCollapsed]);
  useEffect(() => {
    if (!referenceLayout) writeWorkbenchLayoutPatch({ bottomPanelOpen }, viewport);
  }, [bottomPanelOpen, referenceLayout, viewport]);
  const persistLayout = (patch: Partial<Omit<WorkbenchLayoutState, 'version'>>): void => {
    if (!referenceLayout) writeWorkbenchLayoutPatch(patch, viewport);
  };
  const toggleSidebar = (): void => {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    persistLayout({ sidebarCollapsed: next });
  };
  const toggleRightRail = (): void => {
    const next = !rightRailCollapsed;
    setRightRailCollapsed(next);
    persistLayout({ rightRailCollapsed: next });
  };
  const resizeSidebar = (value: number): void => {
    setSidebarWidth(value);
    persistLayout({ sidebarWidth: value });
  };
  const resizeRightRail = (value: number): void => {
    setRightRailWidth(value);
    persistLayout({ rightRailWidth: value });
  };
  const resizeBottomPanel = (value: number): void => {
    setBottomPanelHeight(value);
    persistLayout({ bottomPanelHeight: value });
  };
  const effectiveRightRailWidth = referenceLayout ? rightRailWidth : Math.min(rightRailWidth, maxRightRailWidth(viewport.width, sidebarCollapsed ? 0 : sidebarWidth));
  const effectiveBottomPanelHeight = Math.min(bottomPanelHeight, maxBottomPanelHeight(viewport.height));
  const referenceScale = referenceLayout ? Math.min(viewport.width / REFERENCE_WORKBENCH_VIEWPORT.width, viewport.height / REFERENCE_WORKBENCH_VIEWPORT.height) : 1;
  const scaleLength = (value: number): string => `${value * referenceScale}px`;
  const shellStyle = {
    '--wb-reference-scale': `${referenceScale}`,
    '--wb-sidebar-open-width': scaleLength(sidebarWidth),
    '--wb-right-rail-open-width': scaleLength(effectiveRightRailWidth),
    '--wb-bottom-panel-open-height': scaleLength(effectiveBottomPanelHeight),
    '--wb-frame-right-inset': scaleLength(16),
    '--wb-frame-bottom-inset': scaleLength(12),
    '--wb-character-width': scaleLength(initialLayout.characterWidth)
  } as CSSProperties;
  const toolPanel = activePage === null && activeTool ? <WorkbenchToolPanel activeTool={activeTool} inspection={inspection} filePreview={filePreview} diffPreview={diffPreview} verification={verification} tasks={agentTasks} busy={toolBusy} onClose={() => onToolAction?.(activeTool)} onRefresh={onRefreshInspection} onOpenResource={onOpenResource} onPreviewFile={onPreviewFile} onPreviewDiff={onPreviewDiff} onVerify={onVerify} onCancelTask={onCancelTask} onApproveTask={onApproveTask} onRetryTask={onRetryTask} onRespondTask={onRespondTask} /> : null;
  return <div className="wb-shell" style={shellStyle} data-workbench="shell" data-workbench-structure="shared" data-workbench-visual="reference" data-workbench-theme="tokenized" data-workbench-mode={activePage === null ? 'workbench' : 'settings'} data-reference-layout={referenceLayout ? 'true' : 'false'} data-agent-available={agentAvailable} data-sidebar-state={sidebarCollapsed ? 'collapsed' : 'expanded'} data-right-rail-state={rightRailCollapsed ? 'collapsed' : 'expanded'} data-bottom-panel={bottomPanelOpen ? 'open' : 'closed'} data-sidebar-width={sidebarWidth} data-right-rail-width={effectiveRightRailWidth} data-bottom-panel-height={effectiveBottomPanelHeight}>
    <Topbar sidebarCollapsed={sidebarCollapsed} onToggleSidebar={toggleSidebar} sidebarToggleRef={sidebarToggleRef} onMinimize={onMinimize} onMaximize={onMaximize} onClose={onClose} isMaximized={isMaximized} theme={theme} onToggleTheme={onToggleTheme} />
    {activePage === null ? <Sidebar collapsed={sidebarCollapsed} activePage={activePage} onNavigate={onNavigate} onNewConversation={onNewConversation} workspaceLabel={workspaceLabel} sessionTitle={sessionTitle} sessionMeta={sessionMetaLabel ?? workbenchSessionMeta(sessionMessageCount, false)} referenceFixture={referenceFixture} workspaces={workspaces} sessions={sessions} activeWorkspaceId={activeWorkspaceId} activeSessionId={activeSessionId} onChooseWorkspace={onChooseWorkspace} onSelectWorkspace={onSelectWorkspace} onSelectSession={onSelectSession} onRenameSession={onRenameSession} onDeleteSession={onDeleteSession} /> : <SettingsSidebar collapsed={sidebarCollapsed} activePage={activePage} onNavigate={onNavigate} />}
    {!sidebarCollapsed ? <div className="wb-resizer-slot wb-sidebar-resizer" data-workbench-resizer="sidebar"><WorkbenchResizeHandle axis="vertical" value={sidebarWidth} minimum={WORKBENCH_LAYOUT_LIMITS.sidebar.minimum} maximum={WORKBENCH_LAYOUT_LIMITS.sidebar.maximum} resetValue={initialLayout.sidebarWidth} label="调整左侧栏宽度" controls="workbench-sidebar" onChange={resizeSidebar} /></div> : null}
    <div className="wb-main-grid" data-settings-workspace={activePage === null ? undefined : 'replacement'}>
      <CenterFrame activePage={activePage} centerTitle={centerTitle} referenceEnvironment={referenceEnvironment} initialEnvironmentOpen={initialEnvironmentOpen} environment={environment} workspaceTrust={workspaceTrust} onSetWorkspaceTrust={onSetWorkspaceTrust} onShare={onShare} bottomPanelOpen={bottomPanelOpen} onToggleBottomPanel={onToggleBottomPanel} rightRailCollapsed={rightRailCollapsed} onToggleRightRail={toggleRightRail} rightRailToggleRef={rightRailToggleRef} onToolAction={onToolAction}>{toolPanel ?? children}</CenterFrame>
      {activePage === null && !rightRailCollapsed ? <div className="wb-resizer-slot wb-right-rail-resizer" data-workbench-resizer="right-rail"><WorkbenchResizeHandle axis="vertical" direction={-1} value={effectiveRightRailWidth} minimum={WORKBENCH_LAYOUT_LIMITS.rightRail.minimum} maximum={referenceLayout ? WORKBENCH_LAYOUT_LIMITS.rightRail.maximum : maxRightRailWidth(viewport.width, sidebarCollapsed ? 0 : sidebarWidth)} resetValue={initialLayout.rightRailWidth} label="调整右侧工具栏宽度" controls="workbench-right-rail" onChange={resizeRightRail} /></div> : null}
      {activePage === null ? <RightRail collapsed={rightRailCollapsed} onNavigate={onNavigate} onToolAction={onToolAction ?? (referenceEnvironment ? () => undefined : undefined)} /> : null}
    </div>
    {activePage === null && bottomPanelOpen ? <div className="wb-resizer-slot wb-bottom-panel-resizer" data-workbench-resizer="bottom-panel"><WorkbenchResizeHandle axis="horizontal" direction={-1} value={effectiveBottomPanelHeight} minimum={WORKBENCH_LAYOUT_LIMITS.bottomPanel.minimum} maximum={maxBottomPanelHeight(viewport.height)} resetValue={initialLayout.bottomPanelHeight} label="调整底部面板高度" controls="workbench-bottom-panel" onChange={resizeBottomPanel} /></div> : null}
    {activePage === null ? <BottomPanel open={bottomPanelOpen} onToggle={onToggleBottomPanel} agentTasks={agentTasks} onCancelTask={onCancelTask} /> : null}
  </div>;
}

export const Shell = AgentWorkbench;
