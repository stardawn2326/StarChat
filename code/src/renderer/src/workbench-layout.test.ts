import { describe, expect, it } from 'vitest';

import {
  defaultWorkbenchLayoutState,
  maxCharacterPanelWidth,
  maxRightRailWidth,
  mergeWorkbenchLayoutState,
  sanitizeWorkbenchLayoutState
} from './workbench-layout';

describe('workbench layout persistence contract', () => {
  it('starts with the left sidebar open while the tool rail and bottom panel stay collapsed', () => {
    expect(defaultWorkbenchLayoutState({ width: 1280, height: 900 })).toEqual({
      version: 4,
      sidebarCollapsed: false,
      rightRailCollapsed: true,
      bottomPanelOpen: false,
      sidebarWidth: 280,
      rightRailWidth: 220,
      bottomPanelHeight: 148,
      characterWidth: 300
    });
  });

  it('uses the reference-proportional large sizes at 1920x1200', () => {
    expect(defaultWorkbenchLayoutState({ width: 1920, height: 1200 })).toEqual({
      version: 4,
      sidebarCollapsed: false,
      rightRailCollapsed: true,
      bottomPanelOpen: false,
      sidebarWidth: 328,
      rightRailWidth: 414,
      bottomPanelHeight: 156,
      characterWidth: 389
    });
  });

  it('clamps corrupted values and preserves explicit collapse state', () => {
    expect(sanitizeWorkbenchLayoutState({
      version: 4,
      sidebarCollapsed: true,
      rightRailCollapsed: false,
      bottomPanelOpen: true,
      sidebarWidth: 9999,
      rightRailWidth: -20,
      bottomPanelHeight: 9999,
      characterWidth: 10
    }, { width: 1920, height: 1200 })).toEqual({
      version: 4,
      sidebarCollapsed: true,
      rightRailCollapsed: false,
      bottomPanelOpen: true,
      sidebarWidth: 360,
      rightRailWidth: 220,
      bottomPanelHeight: 420,
      characterWidth: 240
    });
  });

  it('merges one panel update without losing concurrent panel state', () => {
    const initial = defaultWorkbenchLayoutState({ width: 1920, height: 1200 });
    expect(mergeWorkbenchLayoutState(initial, { bottomPanelOpen: true, bottomPanelHeight: 260 }, { width: 1920, height: 1200 })).toMatchObject({
      sidebarCollapsed: false,
      rightRailCollapsed: true,
      bottomPanelOpen: true,
      sidebarWidth: 328,
      rightRailWidth: 414,
      bottomPanelHeight: 260,
      characterWidth: 389
    });
  });

  it('reserves a readable center when the right panel is expanded', () => {
    expect(maxRightRailWidth(1280, 280)).toBe(220);
    expect(maxRightRailWidth(1920, 328)).toBe(520);
  });

  it('reserves a readable dialogue/code column while resizing the character', () => {
    expect(maxCharacterPanelWidth(760)).toBe(272);
    expect(maxCharacterPanelWidth(1200)).toBe(560);
  });

  it('preserves user panel preferences while a compact window applies temporary visual clamps', () => {
    expect(sanitizeWorkbenchLayoutState({
      version: 4,
      sidebarCollapsed: false,
      rightRailCollapsed: false,
      bottomPanelOpen: true,
      sidebarWidth: 352,
      rightRailWidth: 454,
      bottomPanelHeight: 380,
      characterWidth: 419
    }, { width: 1280, height: 900 })).toMatchObject({
      rightRailWidth: 454,
      bottomPanelHeight: 380,
      characterWidth: 419
    });
  });

  it('migrates the previous layout version while applying the compact rail defaults', () => {
    expect(sanitizeWorkbenchLayoutState({
      version: 3,
      sidebarCollapsed: false,
      rightRailCollapsed: false,
      bottomPanelOpen: true,
      sidebarWidth: 352,
      rightRailWidth: 454,
      bottomPanelHeight: 380,
      characterWidth: 419
    }, { width: 1280, height: 900 })).toMatchObject({
      version: 4,
      rightRailCollapsed: true,
      bottomPanelOpen: false,
      sidebarWidth: 352,
      rightRailWidth: 454,
      bottomPanelHeight: 380,
      characterWidth: 419
    });
  });
});
