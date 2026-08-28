import type { PublicAppState } from '../../shared/ipc';
import { WorkbenchIcon } from './WorkbenchIcon';
import type { PresentationSettings } from '../../shared/presentation-contract';
import './settings-center.css';

interface SettingsHomeProps {
  state: PublicAppState;
  presentation: PresentationSettings;
}

export function SettingsHome({ state, presentation }: SettingsHomeProps): JSX.Element {
  const modelLabel = state.live2d.entryPath ? state.live2d.entryPath.split(/[\\/]/).at(-1) ?? '已配置模型' : '未配置外部模型';
  const themeLabel = state.settings.themePreference === 'dark' ? '深色星夜' : state.settings.themePreference === 'light' ? '浅色晨星' : '跟随系统';
  return (
    <section className="settings-home" aria-labelledby="settings-home-title" data-settings-overview>
      <header className="settings-overview-header">
        <span className="eyebrow">STARCHAT / SETTINGS</span>
        <h1 id="settings-home-title">设置</h1>
        <p>从左侧选择一项设置。工作台、Agent 和透明桌宠共享同一份本地配置，修改会通过安全 IPC 应用。</p>
      </header>
      <section className="settings-overview-section" aria-labelledby="settings-overview-state-title">
        <div className="settings-overview-section-heading">
          <div><span className="section-kicker">WORKSPACE STATE</span><h2 id="settings-overview-state-title">当前状态</h2></div>
          <span className="settings-overview-live"><span className="status-dot" />本地已连接</span>
        </div>
        <div className="settings-overview-grid">
          <article className="settings-overview-card" data-settings-surface>
            <span className="settings-overview-icon"><WorkbenchIcon name="pet" size={20} /></span>
            <div><span>当前角色</span><strong>{state.role.displayName}</strong><small>人格、记忆与关系阶段</small></div>
          </article>
          <article className="settings-overview-card" data-settings-surface>
            <span className="settings-overview-icon"><WorkbenchIcon name="model" size={20} /></span>
            <div><span>角色模型</span><strong>{modelLabel}</strong><small>{state.live2d.status === 'not_configured' ? '可从角色模型导入' : state.live2d.message || '外部资源只读引用'}</small></div>
          </article>
          <article className="settings-overview-card" data-settings-surface>
            <span className="settings-overview-icon"><WorkbenchIcon name="settings" size={20} /></span>
            <div><span>应用外观</span><strong>{themeLabel}</strong><small>{state.settings.cursorTrackingEnabled ? '已启用光标跟随' : '光标跟随未启用'}</small></div>
          </article>
          <article className="settings-overview-card" data-settings-surface>
            <span className="settings-overview-icon"><WorkbenchIcon name="strength" size={20} /></span>
            <div><span>表现参数</span><strong>{presentation.physicsEnabled ? '物理表现开启' : '物理表现关闭'}</strong><small>身体跟随强度 {Math.round(presentation.bodyFollowStrength * 100)}%</small></div>
          </article>
        </div>
      </section>
      <section className="settings-overview-section settings-overview-help" aria-labelledby="settings-overview-help-title">
        <div className="settings-overview-section-heading"><div><span className="section-kicker">SHARED RENDERER</span><h2 id="settings-overview-help-title">工作台与桌宠</h2></div></div>
        <p>中央人物区域使用与透明 PetWindow 相同的 Live2D renderer。桌宠窗口仍由 Electron 独立管理，工作台只负责嵌入式呈现和安全控制。</p>
        <dl className="settings-overview-facts"><div><dt>桌宠置顶</dt><dd>{state.settings.alwaysOnTop ? '开启' : '关闭'}</dd></div><div><dt>互动次数</dt><dd>{state.companion.interactionCount}</dd></div><div><dt>长期记忆</dt><dd>{state.companion.memoryCount} 条</dd></div></dl>
      </section>
    </section>
  );
}
