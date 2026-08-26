export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowState {
  maximized: boolean;
  restoreBounds: WindowBounds | null;
}

export interface WindowStateTransition {
  state: WindowState;
  bounds: WindowBounds;
}

export function toggleWindowState(
  current: WindowState,
  currentBounds: WindowBounds,
  workArea: WindowBounds
): WindowStateTransition {
  if (current.maximized) {
    return {
      state: { maximized: false, restoreBounds: null },
      bounds: current.restoreBounds ?? currentBounds
    };
  }

  return {
    state: { maximized: true, restoreBounds: currentBounds },
    bounds: workArea
  };
}
