import type { PublicAppState } from '../../shared/ipc';
import { SETTINGS_CARDS, type SettingsPageId } from './settings-schema';
import type { PresentationSettings } from '../../shared/presentation-contract';
import './settings-center.css';

interface SettingsHomeProps {
  state: PublicAppState;
  presentation: PresentationSettings;
  onOpen: (page: SettingsPageId) => void;
}

export function SettingsHome({ state, presentation, onOpen }: SettingsHomeProps): JSX.Element {
  const context = {
    roleName: state.role.displayName,
    modelPath: state.live2d.entryPath,
    tracking: state.settings.cursorTrackingEnabled,
    alwaysOnTop: state.settings.alwaysOnTop,
    presentation
  };
  return (
    <section className="settings-home" aria-labelledby="settings-home-title">
      <div className="settings-home-intro">
        <span className="eyebrow">STARCHAT / AGENT WORKSPACE</span>
        <h1 id="settings-home-title">StarChat Agent 工作台</h1>
        <p>从桌宠陪伴出发，集中管理角色、视觉、语音与连接。现有配置会继续兼容并保留。</p>
      </div>
      <div className="settings-card-grid">
        {SETTINGS_CARDS.map((card, index) => <button className="settings-category-card" type="button" key={card.id} data-settings-page={card.id} data-workbench-entry="settings" onClick={() => onOpen(card.id)} aria-label={`${card.title}：${card.description}`}>
          <span className="settings-category-index" aria-hidden="true">0{index + 1}</span>
          <span className="settings-category-icon" aria-hidden="true">{card.icon}</span>
          <span className="settings-category-copy">
            <strong>{card.title}</strong>
            <span>{card.description}</span>
            <small>{card.summary(context)}</small>
          </span>
          <span className="settings-category-arrow" aria-hidden="true">↗</span>
        </button>)}
      </div>
      <p className="settings-footnote">工作台只控制语义配置；透明桌宠窗口和 Live2D runtime 继续保持独立。</p>
    </section>
  );
}
