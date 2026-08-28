import { describe, expect, it } from 'vitest';

import {
  clampWorkbenchBoundsToWorkArea,
  defaultWorkbenchBoundsForWorkArea,
  resolveWorkbenchWindowState,
  sanitizePersistedWorkbenchWindowState,
  toggleWindowState,
  type WindowState
} from './window-state';

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

describe('adaptive workbench window bounds', () => {
  it('uses the compact 1280x900 profile on a 1080p usable work area', () => {
    expect(defaultWorkbenchBoundsForWorkArea({ x: 0, y: 0, width: 1920, height: 1040 })).toEqual({
      x: 320,
      y: 70,
      width: 1280,
      height: 900
    });
  });

  it('uses the large 1920x1200 profile when the usable 2K area can contain it', () => {
    expect(defaultWorkbenchBoundsForWorkArea({ x: 0, y: 0, width: 2560, height: 1400 })).toEqual({
      x: 320,
      y: 100,
      width: 1920,
      height: 1200
    });
  });

  it('centers a safely clamped compact window on a smaller usable area', () => {
    expect(defaultWorkbenchBoundsForWorkArea({ x: -1366, y: 0, width: 1366, height: 768 })).toEqual({
      x: -1323,
      y: 0,
      width: 1280,
      height: 768
    });
  });

  it('keeps a restored window fully inside the selected display work area', () => {
    expect(clampWorkbenchBoundsToWorkArea(
      { x: 2400, y: -200, width: 1500, height: 1000 },
      { x: 1920, y: 0, width: 1920, height: 1040 }
    )).toEqual({ x: 2340, y: 0, width: 1500, height: 1000 });
  });

  it('restores valid saved bounds and native maximized state', () => {
    const restored = resolveWorkbenchWindowState(
      { version: 1, bounds: { x: 2100, y: 80, width: 1420, height: 900 }, maximized: true },
      [
        { x: 0, y: 0, width: 1920, height: 1040 },
        { x: 1920, y: 0, width: 1920, height: 1040 }
      ],
      { x: 0, y: 0, width: 1920, height: 1040 }
    );

    expect(restored).toEqual({
      bounds: { x: 2100, y: 80, width: 1420, height: 900 },
      maximized: true
    });
  });

  it('moves an off-screen saved window back to the primary display', () => {
    const restored = resolveWorkbenchWindowState(
      { version: 1, bounds: { x: 8000, y: 6000, width: 1600, height: 1000 }, maximized: false },
      [{ x: 0, y: 0, width: 1920, height: 1040 }],
      { x: 0, y: 0, width: 1920, height: 1040 }
    );

    expect(restored).toEqual({
      bounds: { x: 160, y: 20, width: 1600, height: 1000 },
      maximized: false
    });
  });

  it('rejects malformed persisted window state', () => {
    expect(sanitizePersistedWorkbenchWindowState({
      version: 1,
      bounds: { x: 'bad', y: 10, width: -1, height: Number.NaN },
      maximized: 'yes'
    })).toEqual({ version: 1, bounds: null, maximized: false });
  });
});
