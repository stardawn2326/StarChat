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
        <span className="eyebrow">BAOYIN / SETTINGS</span>
        <h1 id="settings-home-title">配置中心</h1>
        <p>把陪伴、模型、服务和桌面行为放在清晰的入口里。每次修改都会保留旧配置的兼容字段。</p>
      </div>
      <div className="settings-card-grid">
        {SETTINGS_CARDS.map((card, index) => <button className="settings-category-card" type="button" key={card.id} onClick={() => onOpen(card.id)} aria-label={`${card.title}：${card.description}`}>
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
      <p className="settings-footnote">设置中心只控制语义配置；透明桌宠窗口和 Live2D runtime 继续保持独立。</p>
    </section>
  );
}
