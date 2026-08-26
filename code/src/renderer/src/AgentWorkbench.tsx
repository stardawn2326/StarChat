import { forwardRef, useEffect, useRef, useState, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode, type RefObject } from 'react';
import type { AgentTask } from '../../shared/agent';
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

interface TopbarProps {
  onMinimize: () => void;
  onClose: () => void;
  onMaximize?: () => void;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  sidebarToggleRef: RefObject<HTMLButtonElement>;
}

export function Topbar({ onMinimize, onClose, onMaximize, sidebarCollapsed, onToggleSidebar, sidebarToggleRef }: TopbarProps): JSX.Element {
  return <header className="wb-topbar" data-workbench="topbar" data-workbench-region="topbar">
    <div className="wb-drag-region wb-brand-lockup">
      <img className="wb-brand-avatar" src={STARCHAT_ICON_URL} alt="" />
      <span className="wb-brand-name">StarChat</span>
      <IconButton label="收藏 StarChat" className="wb-brand-star"><WorkbenchIcon name="star" size={16} /></IconButton>
      <IconButton label="折叠项目栏" className="wb-sidebar-toggle" ref={sidebarToggleRef} aria-expanded={!sidebarCollapsed} aria-controls="workbench-sidebar" onClick={onToggleSidebar}><WorkbenchIcon name="sidebar" size={18} /></IconButton>
    </div>
    <div className="wb-window-controls" aria-label="窗口控制">
      <IconButton label="最小化" className="wb-window-control" data-workbench-window-control="minimize" onClick={onMinimize}><WorkbenchIcon name="minimize" size={16} /></IconButton>
      <IconButton label="最大化（窗口桥接未接入）" className="wb-window-control is-limited" data-workbench-window-control="maximize" aria-disabled="true" onClick={onMaximize}><WorkbenchIcon name="maximize" size={15} /></IconButton>
      <IconButton label="隐藏工作台" className="wb-window-control wb-window-close" data-workbench-window-control="close" onClick={onClose}><WorkbenchIcon name="close" size={16} /></IconButton>
    </div>
  </header>;
}

interface SidebarProps {
  activePage: WorkbenchPage;
  onNavigate: (page: WorkbenchPage) => void;
  collapsed: boolean;
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

export function Sidebar({ activePage, onNavigate, collapsed }: SidebarProps): JSX.Element {
  const settingsActive = activePage !== null;
  return <aside id="workbench-sidebar" className={`wb-sidebar ${collapsed ? 'is-collapsed' : 'is-expanded'}`} data-workbench="sidebar" data-workbench-region="sidebar" aria-hidden={collapsed} aria-label="StarChat 项目与会话导航">
    <button className="wb-new-chat" type="button" tabIndex={collapsed ? -1 : 0} onClick={() => onNavigate(null)}><WorkbenchIcon name="plus" size={17} />新对话</button>
    <div className="wb-sidebar-heading"><strong>工作区</strong><span><WorkbenchIcon name="search" size={15} /><WorkbenchIcon name="menu" size={15} /><WorkbenchIcon name="file" size={15} /></span></div>
    <div className="wb-project-tree">
      <SidebarProjectRow label="Project-008" collapsed={collapsed} active={activePage === null} onClick={() => onNavigate(null)} />
      <SidebarSessionRow label="Project-008 Agent 工作流" collapsed={collapsed} meta="进行中" active={activePage === null} onClick={() => onNavigate(null)} />
      <SidebarProjectRow label="StarChat" collapsed={collapsed} onClick={() => onNavigate(null)} />
      <SidebarSessionRow label="窗口交互回归" collapsed={collapsed} meta="最近" onClick={() => onNavigate(null)} />
    </div>
    <div className="wb-sidebar-footer">
      <button type="button" className={`wb-settings-entry ${settingsActive ? 'is-active' : ''}`} data-workbench="settings-entry" aria-label="设置" aria-current={settingsActive ? 'page' : undefined} tabIndex={collapsed ? -1 : 0} onClick={() => onNavigate('settings')}>
        <WorkbenchIcon name="settings" size={17} /><span>设置</span>
      </button>
    </div>
  </aside>;
}

type ToolAction = 'chat' | 'task' | 'terminal' | undefined;
interface ToolCardProps { label: string; icon: WorkbenchIconName; action?: ToolAction; disabled?: boolean; onNavigate?: (page: WorkbenchPage) => void; onToggleBottomPanel?: () => void; }

function ToolCard({ label, icon, action, disabled = false, onNavigate, onToggleBottomPanel }: ToolCardProps): JSX.Element {
  const onClick = action === 'terminal' || action === 'task'
    ? onToggleBottomPanel
    : action === 'chat' ? () => onNavigate?.(null) : undefined;
  const content = <><span className="wb-tool-icon"><WorkbenchIcon name={icon} size={28} /></span><strong>{label}</strong></>;
  if (disabled) return <div className="wb-tool-card is-disabled" data-capability-state="disabled" aria-disabled="true">{content}</div>;
  return <button className="wb-tool-card" type="button" data-capability-state="available" onClick={onClick}>{content}</button>;
}

interface RightRailProps { onNavigate?: (page: WorkbenchPage) => void; onToggleBottomPanel?: () => void; }

export function RightRail({ onNavigate, onToggleBottomPanel }: RightRailProps): JSX.Element {
  return <aside className="wb-right-rail" data-workbench="right-rail" data-workbench-region="right" aria-label="Agent 工作流工具">
    <div className="wb-rail-topline"><IconButton label="添加工作流工具"><WorkbenchIcon name="plus" size={18} /></IconButton></div>
    <div className="wb-tool-grid" data-agent-ui="capabilities" aria-label="Agent 工具入口">
      <ToolCard label="资源管理器" icon="resource" />
      <ToolCard label="源代码管理" icon="source" />
      <ToolCard label="任务管理" icon="task" action="task" onToggleBottomPanel={onToggleBottomPanel} />
      <ToolCard label="终端" icon="terminal" action="terminal" onToggleBottomPanel={onToggleBottomPanel} />
      <ToolCard label="浏览器" icon="browser" disabled />
      <ToolCard label="侧边聊天" icon="chat" action="chat" onNavigate={onNavigate} />
    </div>
  </aside>;
}

interface EnvironmentPopoverProps { onClose: () => void; }

function EnvironmentPopover({ onClose }: EnvironmentPopoverProps): JSX.Element {
  return <aside className="wb-environment-popover" data-workbench="environment-popover" aria-label="环境信息" role="dialog">
    <div className="wb-environment-heading"><strong>环境信息</strong><IconButton label="关闭环境信息" onClick={onClose}><WorkbenchIcon name="close" size={15} /></IconButton></div>
    <div className="wb-environment-list">
      <span><WorkbenchIcon name="file" size={15} />变更</span>
      <span><WorkbenchIcon name="folder" size={15} />工作树 <b>main</b></span>
      <span><WorkbenchIcon name="source" size={15} />codex/project-008-settings</span>
      <span><WorkbenchIcon name="share" size={15} />提交或推送</span>
    </div>
    <div className="wb-environment-source"><div><strong>来源</strong><WorkbenchIcon name="plus" size={15} /></div><span><WorkbenchIcon name="pet" size={15} />角色图标参考</span><span><WorkbenchIcon name="layout" size={15} />界面布局参考</span><span><WorkbenchIcon name="file" size={15} />查看全部</span></div>
  </aside>;
}

interface CenterFrameProps { activePage: WorkbenchPage; children: ReactNode; initialEnvironmentOpen?: boolean; }

function CenterFrame({ activePage, children, initialEnvironmentOpen = false }: CenterFrameProps): JSX.Element {
  const sessionTitle = 'Project-008 Agent 工作流';
  const [environmentOpen, setEnvironmentOpen] = useState(initialEnvironmentOpen);
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
    const onKeyDown = (event: KeyboardEvent): void => { if (event.key === 'Escape') closeEnvironment(); };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('pointerdown', onPointerDown); document.removeEventListener('keydown', onKeyDown); };
  }, [environmentOpen]);

  return <section className="wb-center" data-workbench="center" data-workbench-region="center" aria-label="主工作区">
    <div className="wb-center-scroll">
      <div className="wb-center-frame" data-workbench-structure="shared" data-workbench-theme="tokenized">
        <header className="wb-center-toolbar">
          <div className="wb-center-title"><WorkbenchIcon name="folder" size={17} /><strong>{activePage === null ? sessionTitle : 'StarChat 设置'}</strong></div>
          <div className="wb-center-actions"><IconButton label="分享"><WorkbenchIcon name="share" size={17} /></IconButton><IconButton label="环境信息" data-workbench="environment-trigger" ref={environmentTriggerRef} onClick={() => setEnvironmentOpen((open) => !open)}><WorkbenchIcon name="environment" size={17} /></IconButton><IconButton label="打开侧边栏"><WorkbenchIcon name="layout" size={17} /></IconButton></div>
        </header>
        {activePage === null && environmentOpen ? <div ref={environmentPopoverRef}><EnvironmentPopover onClose={closeEnvironment} /></div> : null}
        <div className={`wb-center-content ${activePage === null ? 'is-agent-home' : 'is-settings'}`}>{children}</div>
      </div>
    </div>
  </section>;
}

interface BottomPanelProps { open: boolean; roleName: string; modelLabel: string; onToggle: () => void; agentTasks?: readonly AgentTask[]; onCancelTask?: (taskId: string) => void; }

export function BottomPanel({ open, onToggle }: BottomPanelProps): JSX.Element {
  return <section className={`wb-bottom-panel ${open ? 'is-open' : 'is-collapsed'}`} data-workbench="bottom-panel" data-workbench-terminal="terminal-panel" data-workbench-region="bottom" data-open={open} aria-label="底部终端面板">
    <div className="wb-terminal-tabs"><button className="wb-terminal-tab is-active" type="button" onClick={onToggle}><WorkbenchIcon name="terminal" size={15} />终端 1 <WorkbenchIcon name="close" size={13} /></button><button className="wb-terminal-add" type="button" aria-label="新建终端"><WorkbenchIcon name="plus" size={15} /></button><button className="wb-terminal-close" type="button" aria-label={open ? '收起终端面板' : '展开终端面板'} onClick={onToggle}>{open ? <WorkbenchIcon name="close" size={15} /> : <WorkbenchIcon name="arrowUp" size={15} />}</button></div>
    {open ? <div className="wb-terminal-body" data-workbench="terminal-panel"><div className="wb-terminal-prompt"><span>PS C:\workspace\Project-008&gt;</span><span className="wb-terminal-caret" aria-hidden="true" /></div></div> : null}
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
  initialEnvironmentOpen?: boolean;
  children: ReactNode;
}

export function AgentWorkbench({ activePage, roleName, modelLabel, bottomPanelOpen = true, agentAvailable = true, agentTasks = [], onNavigate, onToggleBottomPanel, onCancelTask, onMinimize = () => undefined, onClose = () => undefined, onMaximize, initialEnvironmentOpen = false, children }: AgentWorkbenchProps): JSX.Element {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const sidebarToggleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { sidebarToggleRef.current?.focus(); }, [sidebarCollapsed]);
  return <div className="wb-shell" data-workbench="shell" data-workbench-structure="shared" data-workbench-theme="tokenized" data-agent-available={agentAvailable} data-sidebar-state={sidebarCollapsed ? 'collapsed' : 'expanded'}>
    <Topbar sidebarCollapsed={sidebarCollapsed} onToggleSidebar={() => setSidebarCollapsed((collapsed) => !collapsed)} sidebarToggleRef={sidebarToggleRef} onMinimize={onMinimize} onMaximize={onMaximize} onClose={onClose} />
    <Sidebar collapsed={sidebarCollapsed} activePage={activePage} onNavigate={onNavigate} />
    <div className="wb-main-grid">
      <CenterFrame activePage={activePage} initialEnvironmentOpen={initialEnvironmentOpen}>{children}</CenterFrame>
      <RightRail onNavigate={onNavigate} onToggleBottomPanel={onToggleBottomPanel} />
    </div>
    <BottomPanel open={bottomPanelOpen} roleName={roleName} modelLabel={modelLabel} onToggle={onToggleBottomPanel} agentTasks={agentTasks} onCancelTask={onCancelTask} />
  </div>;
}

export const Shell = AgentWorkbench;
