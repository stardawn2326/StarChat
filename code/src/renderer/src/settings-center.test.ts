import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PublicAppState } from '../../shared/ipc';
import { DEFAULT_ROLE_PACKAGE } from '../../shared/default-role';
import { DEFAULT_APP_SETTINGS } from '../../shared/settings';
import { DEFAULT_PRESENTATION_SETTINGS } from '../../shared/presentation-contract';
import { SettingsHome } from './SettingsHome';
import { formatSemanticMappings, parseSemanticMappings } from './SettingsDetails';
import { isWindowIntent } from './settings-preview';
import { syncPetBoundsIntoSettings } from './settings-state';

describe('settings center components', () => {
  it('renders the category-card home without a legacy menu', () => {
    const state = {
      settings: DEFAULT_APP_SETTINGS,
      hasApiKey: false,
      role: DEFAULT_ROLE_PACKAGE,
      roles: [DEFAULT_ROLE_PACKAGE],
      live2d: { entryPath: null }
    } as unknown as PublicAppState;
    const markup = renderToStaticMarkup(createElement(SettingsHome, { state, presentation: DEFAULT_PRESENTATION_SETTINGS, onOpen: () => undefined }));
    expect(markup).toContain('设置分类首页');
    expect(markup).toContain('人格与角色');
    expect(markup).not.toContain('<nav');
  });

  it('round-trips editable semantic mappings', () => {
    const text = formatSemanticMappings(DEFAULT_ROLE_PACKAGE.presentation.semanticMappings);
    expect(parseSemanticMappings(text)).toEqual(DEFAULT_ROLE_PACKAGE.presentation.semanticMappings);
  });

  it('keeps window slider intent separate from model viewport changes', () => {
    expect(isWindowIntent({ petWindowOpacity: 0.7 })).toBe(true);
    expect(isWindowIntent({ modelViewportByModel: {} })).toBe(false);
  });

  it('syncs native window bounds before a clean settings save', () => {
    const next = syncPetBoundsIntoSettings({ ...DEFAULT_APP_SETTINGS, petBounds: { x: 1200, y: 200, width: 432, height: 600 } }, { x: 638, y: 210, width: 432, height: 600 });
    expect(next.petBounds).toEqual({ x: 638, y: 210, width: 432, height: 600 });
  });
});
