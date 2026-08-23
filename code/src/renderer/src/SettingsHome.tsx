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
    <section className="settings-home" aria-label="设置分类首页">
      <div className="settings-home-intro">
        <span className="eyebrow">BAOYIN CONFIGURATION CENTER</span>
        <h1>配置中心</h1>
        <p>把表现、模型和桌面交互分开调节。白音会保留当前角色的核心性格。</p>
      </div>
      <div className="settings-card-grid">
        {SETTINGS_CARDS.map((card) => (
          <button className="settings-category-card" type="button" key={card.id} onClick={() => onOpen(card.id)}>
            <span className="settings-category-icon" aria-hidden="true">{card.icon}</span>
            <span className="settings-category-copy">
              <strong>{card.title}</strong>
              <span>{card.description}</span>
              <small>{card.summary(context)}</small>
            </span>
            <span className="settings-category-arrow" aria-hidden="true">›</span>
          </button>
        ))}
      </div>
      <p className="settings-footnote">在线人格对话、关系记忆、语义表情与系统TTS口型已接入；家电、移动端和可导入声线仍未实现。</p>
    </section>
  );
}
