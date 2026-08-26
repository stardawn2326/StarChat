import type { HTMLAttributes, ReactNode } from 'react';
import { SETTINGS_CARDS, type SettingsPageId } from './settings-schema';
import './settings-center.css';

export type WorkbenchPage = SettingsPageId | null;

interface WorkbenchNavigationItem {
  id: WorkbenchPage;
  label: string;
  description: string;
  icon: string;
}

const NAVIGATION_ITEMS: readonly WorkbenchNavigationItem[] = [
  { id: null, label: '工作台总览', description: 'StarChat Agent', icon: '⌂' },
  ...SETTINGS_CARDS.map((card) => ({ id: card.id, label: card.title, description: card.description, icon: card.icon }))
];

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
      {NAVIGATION_ITEMS.slice(0, 1).map((item) => <button key="overview" type="button" className={`workbench-nav-item ${activePage === item.id ? 'is-active' : ''}`} aria-current={activePage === item.id ? 'page' : undefined} onClick={() => onNavigate(item.id)}>
        <span className="workbench-nav-icon" aria-hidden="true">{item.icon}</span><span><strong>{item.label}</strong><small>{item.description}</small></span>
      </button>)}
      <span className="workbench-nav-label">能力</span>
      {NAVIGATION_ITEMS.slice(1).map((item) => <button key={item.id} type="button" className={`workbench-nav-item ${activePage === item.id ? 'is-active' : ''}`} aria-current={activePage === item.id ? 'page' : undefined} onClick={() => onNavigate(item.id)}>
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
}

export function RightRail({ roleName, modelLabel, themeLabel }: RightRailProps): JSX.Element {
  return <aside className="workbench-right-rail" data-workbench="right-rail" aria-label="StarChat 能力栏">
    <span className="section-kicker">PRESENCE</span>
    <h2>陪伴状态</h2>
    <Surface className="workbench-presence-card">
      <span className="workbench-avatar" aria-hidden="true">白</span>
      <div><strong>{roleName}</strong><small>默认人格已就绪</small></div>
      <span className="workbench-online-pill">在线</span>
    </Surface>
    <span className="section-kicker workbench-rail-kicker">CAPABILITIES</span>
    <Surface className="workbench-capability-card">
      <div><span className="workbench-capability-icon" aria-hidden="true">◌</span><span><strong>Live2D 视觉</strong><small>{modelLabel}</small></span></div>
      <div><span className="workbench-capability-icon" aria-hidden="true">◈</span><span><strong>对话与 Agent</strong><small>通过现有安全路由</small></span></div>
      <div><span className="workbench-capability-icon" aria-hidden="true">♫</span><span><strong>语音表现</strong><small>CosyVoice 配置</small></span></div>
    </Surface>
    <Surface className="workbench-guardrail-card"><span className="workbench-guardrail-icon" aria-hidden="true">◇</span><div><strong>安全边界</strong><small>当前工作台只呈现已接入能力，不开放任意 Shell、浏览器或 Git 写入。</small></div></Surface>
    <div className="workbench-rail-footer"><span>主题</span><strong>{themeLabel}</strong></div>
  </aside>;
}

interface BottomPanelProps {
  open: boolean;
  roleName: string;
  modelLabel: string;
  onToggle: () => void;
}

export function BottomPanel({ open, roleName, modelLabel, onToggle }: BottomPanelProps): JSX.Element {
  return <section className={`workbench-bottom-panel ${open ? 'is-open' : 'is-collapsed'}`} data-workbench="bottom-panel" data-open={open} aria-label="工作台状态面板">
    <button className="workbench-bottom-toggle" type="button" aria-expanded={open} onClick={onToggle}>
      <span><span className="workbench-bottom-grip" aria-hidden="true">⌁</span><strong>运行状态</strong><small>StarChat 工作台 · 现有能力摘要</small></span><span aria-hidden="true">{open ? '⌄' : '⌃'}</span>
    </button>
    {open ? <div className="workbench-bottom-content"><div><span className="section-kicker">SESSION</span><strong>桌宠链路已隔离</strong><small>设置工作台只发送语义配置，Live2D runtime 保持独立。</small></div><div><span className="section-kicker">ROLE</span><strong>{roleName}</strong><small>人格与记忆沿用现有角色包。</small></div><div><span className="section-kicker">MODEL</span><strong>{modelLabel}</strong><small>外部模型继续只读引用。</small></div></div> : null}
  </section>;
}

interface AgentWorkbenchProps {
  activePage: WorkbenchPage;
  roleName: string;
  modelLabel: string;
  themeLabel: string;
  bottomPanelOpen?: boolean;
  onNavigate: (page: WorkbenchPage) => void;
  onToggleBottomPanel: () => void;
  onShowPet?: () => void;
  onMinimize?: () => void;
  onClose?: () => void;
  children: ReactNode;
}

export function AgentWorkbench({ activePage, roleName, modelLabel, themeLabel, bottomPanelOpen = true, onNavigate, onToggleBottomPanel, onShowPet = () => undefined, onMinimize = () => undefined, onClose = () => undefined, children }: AgentWorkbenchProps): JSX.Element {
  return <div className="workbench-shell" data-workbench="shell">
    <Topbar themeLabel={themeLabel} onShowPet={onShowPet} onMinimize={onMinimize} onClose={onClose} />
    <div className="workbench-main-grid">
      <Sidebar activePage={activePage} onNavigate={onNavigate} />
      <section className="workbench-center" data-workbench="center" aria-label="主工作区"><div className="workbench-center-scroll">{children}</div></section>
      <RightRail roleName={roleName} modelLabel={modelLabel} themeLabel={themeLabel} />
    </div>
    <BottomPanel open={bottomPanelOpen} roleName={roleName} modelLabel={modelLabel} onToggle={onToggleBottomPanel} />
  </div>;
}

export const Shell = AgentWorkbench;
