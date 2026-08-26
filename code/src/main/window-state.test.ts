import { describe, expect, it } from 'vitest';

import { toggleWindowState, type WindowState } from './window-state';

describe('window state fallback', () => {
  it('enters work-area bounds and restores the exact previous bounds', () => {
    const initial: WindowState = { maximized: false, restoreBounds: null };
    const bounds = { x: 120, y: 80, width: 900, height: 880 };
    const workArea = { x: 0, y: 0, width: 1920, height: 1040 };

    const maximized = toggleWindowState(initial, bounds, workArea);
    expect(maximized.state).toEqual({ maximized: true, restoreBounds: bounds });
    expect(maximized.bounds).toEqual(workArea);

    const restored = toggleWindowState(maximized.state, maximized.bounds, workArea);
    expect(restored.state).toEqual({ maximized: false, restoreBounds: null });
    expect(restored.bounds).toEqual(bounds);
  });
});
