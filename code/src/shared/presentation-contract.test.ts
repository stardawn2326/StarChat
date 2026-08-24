import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRESENTATION_SETTINGS,
  PRESENTATION_SLIDERS,
  presentationSummary,
  resetPresentationSetting,
  sanitizePresentationSettings
} from './presentation-contract';

describe('presentation settings contract', () => {
  it('defines the four safe sliders and physics switch defaults', () => {
    expect(PRESENTATION_SLIDERS.map((item) => item.key)).toEqual([
      'bodyFollowStrength', 'bodyLag', 'inertiaStrength', 'idleSwayStrength'
    ]);
    expect(DEFAULT_PRESENTATION_SETTINGS.physicsEnabled).toBe(true);
    expect(DEFAULT_PRESENTATION_SETTINGS.bodyFollowStrength).toBeGreaterThan(0.7);
    expect(DEFAULT_PRESENTATION_SETTINGS.inertiaStrength).toBeGreaterThan(0.5);
    expect(DEFAULT_PRESENTATION_SETTINGS.idleSwayStrength).toBeGreaterThanOrEqual(0.05);
  });

  it('clamps unsafe values and supports single-field reset', () => {
    const sanitized = sanitizePresentationSettings({ bodyFollowStrength: 2, bodyLag: -1, idleSwayStrength: 9, physicsEnabled: false });
    expect(sanitized.bodyFollowStrength).toBe(1);
    expect(sanitized.bodyLag).toBe(0.05);
    expect(sanitized.idleSwayStrength).toBe(0.15);
    expect(sanitized.physicsEnabled).toBe(false);
    expect(resetPresentationSetting('bodyLag')).toEqual({ bodyLag: 0.32 });
    expect(resetPresentationSetting('physicsEnabled')).toEqual({ physicsEnabled: true });
  });

  it('summarizes only real stored configuration state', () => {
    expect(presentationSummary(DEFAULT_PRESENTATION_SETTINGS)).toContain('全身跟随');
    expect(presentationSummary({ ...DEFAULT_PRESENTATION_SETTINGS, bodyFollowStrength: 0, physicsEnabled: false })).toBe('全身跟随关闭 · 物理已关闭');
  });
});
