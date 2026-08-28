import { forwardRef, useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type HTMLAttributes, type ReactNode, type RefObject } from 'react';
import type { AgentTask } from '../../shared/agent';
import type { WorkbenchEnvironment, WorkbenchInspection, WorkbenchInspectionKind } from '../../shared/workbench';
import { workbenchGitStatusLabel, workbenchSessionMeta } from '../../shared/workbench';
import { AGENT_TASK_STATUS_LABELS, currentAgentStep, isActiveAgentTaskStatus } from './agent-ui-model';
import { SETTINGS_CARDS, type SettingsPageId, type WorkbenchPage } from './settings-schema';
import { WorkbenchIcon, type WorkbenchIconName } from './WorkbenchIcon';
import { WorkbenchResizeHandle } from './WorkbenchResizeHandle';
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

const STARCHAT_ICON_URL = new URL('../../../../assets/icons/baoyin-64.png', import.meta.url).href;

export function Surface({ className = '', children, ...props }: HTMLAttributes<HTMLDivElement>): JSX.Element {
  return <div {...props} className={`wb-surface ${className}`.trim()}>{children}</div>;
}

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string }>(function IconButton({ label, children, className = '', ...props }, ref): JSX.Element {
  return <button {...props} ref={ref} type="button" className={`wb-icon-button ${className}`.trim()} aria-label={label} title={label}>{children}</button>;
});

const REFERENCE_WORKBENCH_LAYOUT: WorkbenchLayoutState = {
  version: 2,
  sidebarCollapsed: false,
  rightRailCollapsed: false,
  bottomPanelOpen: true,
  sidebarWidth: 280,
  rightRailWidth: 354,
  bottomPanelHeight: 174,
  characterWidth: 332
};

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
}

export function Topbar({ onMinimize, onClose, onMaximize, sidebarCollapsed, onToggleSidebar, sidebarToggleRef, isMaximized }: TopbarProps): JSX.Element {
  return <header className="wb-topbar" data-workbench="topbar" data-workbench-region="topbar">
    <div className="wb-drag-region wb-brand-lockup">
      <img className="wb-brand-avatar" src={STARCHAT_ICON_URL} alt="" />
      <span className="wb-brand-name">StarChat</span>
      <IconButton label="收藏功能未启用" className="wb-brand-star is-limited" disabled><WorkbenchIcon name="star" size={16} /></IconButton>
      <IconButton label={sidebarCollapsed ? '展开项目栏' : '折叠项目栏'} className="wb-sidebar-toggle" ref={sidebarToggleRef} aria-expanded={!sidebarCollapsed} aria-controls="workbench-sidebar" onClick={onToggleSidebar}><WorkbenchIcon name="sidebar" size={18} /></IconButton>
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
    <button className="wb-new-chat" type="button" tabIndex={collapsed ? -1 : 0} onClick={onNewConversation}><WorkbenchIcon name="newChat" size={20} />新对话</button>
    <div className="wb-sidebar-heading"><strong>工作区</strong><span><WorkbenchIcon name="search" size={17} /><WorkbenchIcon name="strength" size={17} /><WorkbenchIcon name="folderPlus" size={17} /></span></div>
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

const SETTINGS_ICON_BY_ID: Record<SettingsPageId, WorkbenchIconName> = {
  chat: 'chat',
  personality: 'pet',
  model: 'model',
  voice: 'mic',
  service: 'source',
  behavior: 'settings'
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

  return <aside id="workbench-sidebar" className={`wb-sidebar wb-settings-sidebar ${collapsed ? 'is-collapsed' : 'is-expanded'}`} data-workbench="sidebar" data-workbench-region="sidebar" data-workbench-sidebar-mode="settings" aria-hidden={collapsed} aria-label="设置导航">
    <div className="wb-settings-sidebar-top">
      <button type="button" className="wb-settings-back" onClick={() => onNavigate(null)} tabIndex={collapsed ? -1 : 0}>
        <span aria-hidden="true">←</span><span>返回工作台</span>
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
      <span className="wb-settings-group-label">配置</span>
      {visibleCards.map((card) => <button type="button" className={`wb-settings-nav-item ${activePage === card.id ? 'is-active' : ''}`} key={card.id} data-settings-page={card.id} onClick={() => onNavigate(card.id)} tabIndex={collapsed ? -1 : 0} aria-current={activePage === card.id ? 'page' : undefined}>
        <WorkbenchIcon name={SETTINGS_ICON_BY_ID[card.id]} size={17} /><span>{card.title}</span>
      </button>)}
      {visibleCards.length === 0 ? <span className="wb-settings-search-empty">没有匹配的设置</span> : null}
    </nav>
    <p className="wb-settings-sidebar-note">配置保存在本地，并通过安全 IPC 应用到桌宠与 Agent。</p>
  </aside>;
}

export type WorkbenchToolAction = 'resources' | 'source' | 'chat' | 'tasks' | 'terminal';
interface ToolCardProps { label: string; icon: WorkbenchIconName; action?: WorkbenchToolAction; disabled?: boolean; collapsed?: boolean; onNavigate?: (page: WorkbenchPage) => void; onToolAction?: (action: WorkbenchToolAction) => void; }

function ToolCard({ label, icon, action, disabled = false, collapsed = false, onNavigate, onToolAction }: ToolCardProps): JSX.Element {
  const onClick = action === 'chat' ? (onNavigate ? () => onNavigate(null) : undefined) : action && onToolAction ? () => onToolAction(action) : undefined;
  const content = <><span className="wb-tool-icon"><WorkbenchIcon name={icon} size={28} /></span><strong>{label}</strong></>;
  if (disabled) return <div className="wb-tool-card is-disabled" data-capability-state="disabled" aria-disabled="true">{content}<small>未启用</small></div>;
  if (!onClick) return <div className="wb-tool-card is-disabled" data-capability-state="disabled" aria-disabled="true">{content}<small>当前窗口未连接</small></div>;
  return <button className="wb-tool-card" type="button" data-capability-state="available" onClick={onClick} tabIndex={collapsed ? -1 : 0}>{content}</button>;
}

interface RightRailProps { onNavigate?: (page: WorkbenchPage) => void; onToolAction?: (action: WorkbenchToolAction) => void; collapsed?: boolean; }

export function RightRail({ onNavigate, onToolAction, collapsed = false }: RightRailProps): JSX.Element {
  return <aside id="workbench-right-rail" className={`wb-right-rail ${collapsed ? 'is-collapsed' : 'is-expanded'}`} data-workbench="right-rail" data-workbench-region="right" data-right-rail-state={collapsed ? 'collapsed' : 'expanded'} aria-hidden={collapsed} aria-label="Agent 工作流工具">
    <div className="wb-rail-topline"><IconButton label="添加工作流工具未启用" disabled><WorkbenchIcon name="plus" size={18} /></IconButton></div>
    <div className="wb-tool-grid" data-agent-ui="capabilities" aria-label="Agent 工具入口">
      <ToolCard label="资源管理器" icon="resource" action="resources" collapsed={collapsed} onToolAction={onToolAction} />
      <ToolCard label="源代码管理" icon="source" action="source" collapsed={collapsed} onToolAction={onToolAction} />
      <ToolCard label="任务管理" icon="task" action="tasks" collapsed={collapsed} onToolAction={onToolAction} />
      <ToolCard label="终端" icon="terminal" action="terminal" collapsed={collapsed} onToolAction={onToolAction} />
      <ToolCard label="浏览器" icon="browser" disabled />
      <ToolCard label="侧边聊天" icon="chat" action="chat" collapsed={collapsed} onNavigate={onNavigate} onToolAction={onToolAction} />
    </div>
  </aside>;
}

interface EnvironmentPopoverProps { onClose: () => void; environment: WorkbenchEnvironment | null; referenceFixture?: boolean; }

function EnvironmentPopover({ onClose, environment, referenceFixture = false }: EnvironmentPopoverProps): JSX.Element {
  const branch = environment?.branch ?? (environment?.head ? `分离 HEAD @ ${environment.head}` : '未识别');
  if (referenceFixture) {
    return <aside className="wb-environment-popover wb-environment-popover-reference" data-workbench="environment-popover" data-workbench-reference="environment" aria-label="环境信息" role="dialog">
      <div className="wb-environment-heading"><strong>环境信息</strong><IconButton label="添加环境信息" disabled><WorkbenchIcon name="plus" size={15} /></IconButton></div>
      <div className="wb-environment-list">
        <span><WorkbenchIcon name="file" size={15} />变更</span>
        <span><WorkbenchIcon name="folder" size={15} />工作树 <WorkbenchIcon name="chevron" size={14} className="wb-environment-chevron" /></span>
        <span><WorkbenchIcon name="source" size={15} />codex/project-008-settings</span>
        <span><WorkbenchIcon name="share" size={15} />提交或推送</span>
      </div>
      <div className="wb-environment-source"><div><strong>来源</strong><IconButton label="添加来源" disabled><WorkbenchIcon name="plus" size={15} /></IconButton></div>
        <span><img src={STARCHAT_ICON_URL} alt="" />角色图标参考</span>
        <span><i className="wb-environment-reference-thumb" aria-hidden="true" />界面布局参考</span>
        <span><WorkbenchIcon name="share" size={15} />查看全部</span>
      </div>
    </aside>;
  }
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

interface CenterFrameProps { activePage: WorkbenchPage; children: ReactNode; initialEnvironmentOpen?: boolean; environment: WorkbenchEnvironment | null; onShare?: () => Promise<string>; bottomPanelOpen: boolean; onToggleBottomPanel: () => void; rightRailCollapsed: boolean; onToggleRightRail: () => void; rightRailToggleRef: RefObject<HTMLButtonElement>; onToolAction?: (action: WorkbenchToolAction) => void; centerTitle?: string; referenceEnvironment?: boolean; }

function CenterFrame({ activePage, children, initialEnvironmentOpen = false, environment, onShare, bottomPanelOpen, onToggleBottomPanel, rightRailCollapsed, onToggleRightRail, rightRailToggleRef, onToolAction, centerTitle, referenceEnvironment = false }: CenterFrameProps): JSX.Element {
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
        <header className="wb-center-toolbar">
          <div className="wb-center-title"><WorkbenchIcon name={activePage === null ? 'folder' : 'settings'} size={17} /><strong>{title}</strong></div>
          {activePage === null ? <div className="wb-center-actions"><button type="button" className="wb-share-action" onClick={() => void share()}><WorkbenchIcon name="share" size={17} /><span>分享</span></button><IconButton label="环境信息" data-workbench="environment-trigger" ref={environmentTriggerRef} onClick={() => setEnvironmentOpen((open) => !open)}><WorkbenchIcon name="environment" size={17} /></IconButton><IconButton label={bottomPanelOpen ? '折叠底部面板' : '展开底部面板'} data-workbench="bottom-panel-toggle" aria-expanded={bottomPanelOpen} aria-controls="workbench-bottom-panel" onClick={onToggleBottomPanel}><WorkbenchIcon name="chat" size={17} /></IconButton><IconButton label={rightRailCollapsed ? '展开侧边工具栏' : '折叠侧边工具栏'} data-workbench="right-rail-toggle" ref={rightRailToggleRef} aria-expanded={!rightRailCollapsed} aria-controls="workbench-right-rail" onClick={onToggleRightRail}><WorkbenchIcon name="layout" size={17} /></IconButton></div> : null}
        </header>
        {activePage === null && environmentOpen ? <div ref={environmentPopoverRef}><EnvironmentPopover environment={environment} referenceFixture={referenceEnvironment} onClose={closeEnvironment} /></div> : null}
        {shareStatus ? <p className="wb-action-status" role="status">{shareStatus}</p> : null}
        <div className={`wb-center-content ${activePage === null ? 'is-agent-home' : 'is-settings'}`}>{children}</div>
      </div>
    </div>
  </section>;
}

interface BottomPanelProps { open: boolean; onToggle: () => void; agentTasks?: readonly AgentTask[]; onCancelTask?: (taskId: string) => void; }

export function BottomPanel({ open, onToggle, agentTasks = [], onCancelTask }: BottomPanelProps): JSX.Element {
  return <section id="workbench-bottom-panel" className={`wb-bottom-panel ${open ? 'is-open' : 'is-collapsed'}`} data-workbench="bottom-panel" data-workbench-terminal="verification-log" data-workbench-region="bottom" data-open={open} aria-expanded={open} aria-hidden={!open} aria-label="底部受控验证日志">
    <div className="wb-terminal-tabs"><span className="wb-terminal-tab is-active"><WorkbenchIcon name="terminal" size={15} />受控验证日志</span><button className="wb-terminal-close" type="button" tabIndex={open ? 0 : -1} aria-label={open ? '收起受控验证日志' : '展开受控验证日志'} onClick={onToggle}>{open ? <WorkbenchIcon name="close" size={15} /> : <WorkbenchIcon name="arrowUp" size={15} />}</button></div>
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
  sessionMetaLabel?: string;
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
  centerTitle?: string;
  referenceEnvironment?: boolean;
  referenceLayout?: boolean;
  children: ReactNode;
}

export function AgentWorkbench({ activePage, roleName: _roleName, modelLabel: _modelLabel, bottomPanelOpen = false, agentAvailable = true, agentTasks = [], onNavigate, onToggleBottomPanel, onNewConversation = () => onNavigate(null), sessionTitle = '当前会话', sessionMetaLabel, sessionMessageCount = 0, workspaceLabel = '本地工作区', environment = null, inspection = null, activeTool = null, onToolAction, onRefreshInspection, onShare, onCancelTask, onMinimize = () => undefined, onClose = () => undefined, onMaximize, isMaximized = false, initialEnvironmentOpen = false, centerTitle, referenceEnvironment = false, referenceLayout = false, children }: AgentWorkbenchProps): JSX.Element {
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
  const effectiveRightRailWidth = Math.min(rightRailWidth, maxRightRailWidth(viewport.width, sidebarCollapsed ? 0 : sidebarWidth));
  const effectiveBottomPanelHeight = Math.min(bottomPanelHeight, maxBottomPanelHeight(viewport.height));
  const shellStyle = {
    '--wb-sidebar-open-width': `${sidebarWidth}px`,
    '--wb-right-rail-open-width': `${effectiveRightRailWidth}px`,
    '--wb-bottom-panel-open-height': `${effectiveBottomPanelHeight}px`,
    '--wb-character-width': `${initialLayout.characterWidth}px`
  } as CSSProperties;
  const toolPanel = activePage === null && activeTool && inspection ? <section className="wb-inspection-panel" aria-label={activeTool === 'resources' ? '资源管理器' : '源代码管理'}><header><div><span className="section-kicker">{activeTool === 'resources' ? 'WORKSPACE RESOURCES' : 'SOURCE CONTROL'}</span><h2>{activeTool === 'resources' ? '资源管理器' : '源代码管理'}</h2></div><div className="wb-inspection-actions"><button className="secondary-button" type="button" onClick={onRefreshInspection}>刷新</button><button className="secondary-button" type="button" onClick={() => onToolAction?.(activeTool === 'resources' ? 'resources' : 'source')}>关闭</button></div></header>{activeTool === 'resources' ? <ul className="wb-resource-list">{(inspection.resources ?? []).map((entry) => <li key={entry.path}><WorkbenchIcon name={entry.kind === 'directory' ? 'folder' : 'file'} size={14} /><span>{entry.path}</span></li>)}</ul> : <div className="wb-source-summary"><p>{workbenchGitStatusLabel(inspection.source?.status ?? inspection.environment.gitStatus)} · {inspection.source?.changedFiles.length ?? inspection.environment.changedFiles} 个变更文件</p><p>分支：{inspection.source?.branch ?? (inspection.source?.head ? `分离 HEAD @ ${inspection.source.head}` : '未识别')}</p>{inspection.source?.changedFiles.length ? <ul>{inspection.source.changedFiles.map((path) => <li key={path}>{path}</li>)}</ul> : <p>当前没有可显示的未提交文件。</p>}</div>}</section> : null;
  return <div className="wb-shell" style={shellStyle} data-workbench="shell" data-workbench-structure="shared" data-workbench-theme="tokenized" data-workbench-mode={activePage === null ? 'workbench' : 'settings'} data-agent-available={agentAvailable} data-sidebar-state={sidebarCollapsed ? 'collapsed' : 'expanded'} data-right-rail-state={rightRailCollapsed ? 'collapsed' : 'expanded'} data-bottom-panel={bottomPanelOpen ? 'open' : 'closed'} data-sidebar-width={sidebarWidth} data-right-rail-width={effectiveRightRailWidth} data-bottom-panel-height={effectiveBottomPanelHeight}>
    <Topbar sidebarCollapsed={sidebarCollapsed} onToggleSidebar={toggleSidebar} sidebarToggleRef={sidebarToggleRef} onMinimize={onMinimize} onMaximize={onMaximize} onClose={onClose} isMaximized={isMaximized} />
    {activePage === null ? <Sidebar collapsed={sidebarCollapsed} activePage={activePage} onNavigate={onNavigate} onNewConversation={onNewConversation} workspaceLabel={workspaceLabel} sessionTitle={sessionTitle} sessionMeta={sessionMetaLabel ?? workbenchSessionMeta(sessionMessageCount, false)} /> : <SettingsSidebar collapsed={sidebarCollapsed} activePage={activePage} onNavigate={onNavigate} />}
    {!sidebarCollapsed ? <div className="wb-resizer-slot wb-sidebar-resizer" data-workbench-resizer="sidebar"><WorkbenchResizeHandle axis="vertical" value={sidebarWidth} minimum={WORKBENCH_LAYOUT_LIMITS.sidebar.minimum} maximum={WORKBENCH_LAYOUT_LIMITS.sidebar.maximum} resetValue={initialLayout.sidebarWidth} label="调整左侧栏宽度" controls="workbench-sidebar" onChange={resizeSidebar} /></div> : null}
    <div className="wb-main-grid">
      <CenterFrame activePage={activePage} centerTitle={centerTitle} referenceEnvironment={referenceEnvironment} initialEnvironmentOpen={initialEnvironmentOpen} environment={environment} onShare={onShare} bottomPanelOpen={bottomPanelOpen} onToggleBottomPanel={onToggleBottomPanel} rightRailCollapsed={rightRailCollapsed} onToggleRightRail={toggleRightRail} rightRailToggleRef={rightRailToggleRef} onToolAction={onToolAction}>{toolPanel}{children}</CenterFrame>
      {activePage === null && !rightRailCollapsed ? <div className="wb-resizer-slot wb-right-rail-resizer" data-workbench-resizer="right-rail"><WorkbenchResizeHandle axis="vertical" direction={-1} value={effectiveRightRailWidth} minimum={WORKBENCH_LAYOUT_LIMITS.rightRail.minimum} maximum={maxRightRailWidth(viewport.width, sidebarCollapsed ? 0 : sidebarWidth)} resetValue={initialLayout.rightRailWidth} label="调整右侧工具栏宽度" controls="workbench-right-rail" onChange={resizeRightRail} /></div> : null}
      <RightRail collapsed={rightRailCollapsed} onNavigate={onNavigate} onToolAction={onToolAction ?? (referenceEnvironment ? () => undefined : undefined)} />
    </div>
    {activePage === null && bottomPanelOpen ? <div className="wb-resizer-slot wb-bottom-panel-resizer" data-workbench-resizer="bottom-panel"><WorkbenchResizeHandle axis="horizontal" direction={-1} value={effectiveBottomPanelHeight} minimum={WORKBENCH_LAYOUT_LIMITS.bottomPanel.minimum} maximum={maxBottomPanelHeight(viewport.height)} resetValue={initialLayout.bottomPanelHeight} label="调整底部面板高度" controls="workbench-bottom-panel" onChange={resizeBottomPanel} /></div> : null}
    <BottomPanel open={bottomPanelOpen} onToggle={onToggleBottomPanel} agentTasks={agentTasks} onCancelTask={onCancelTask} />
  </div>;
}

export const Shell = AgentWorkbench;
