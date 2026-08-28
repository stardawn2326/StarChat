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

export interface PersistedWorkbenchWindowState {
  version: 1;
  bounds: WindowBounds | null;
  maximized: boolean;
}

export interface ResolvedWorkbenchWindowState {
  bounds: WindowBounds;
  maximized: boolean;
}

export const DEFAULT_WORKBENCH_WINDOW_STATE: PersistedWorkbenchWindowState = {
  version: 1,
  bounds: null,
  maximized: false
};

export const WORKBENCH_COMPACT_SIZE = { width: 1280, height: 900 } as const;
export const WORKBENCH_LARGE_SIZE = { width: 1920, height: 1200 } as const;
export const WORKBENCH_MIN_SIZE = { width: 1280, height: 800 } as const;

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validBounds(value: unknown): value is WindowBounds {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<WindowBounds>;
  return finiteNumber(candidate.x)
    && finiteNumber(candidate.y)
    && finiteNumber(candidate.width)
    && finiteNumber(candidate.height)
    && candidate.width > 0
    && candidate.height > 0;
}

function centeredBounds(size: { width: number; height: number }, workArea: WindowBounds): WindowBounds {
  const width = Math.min(Math.max(1, Math.round(size.width)), workArea.width);
  const height = Math.min(Math.max(1, Math.round(size.height)), workArea.height);
  return {
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + (workArea.height - height) / 2),
    width,
    height
  };
}

function intersectionArea(a: WindowBounds, b: WindowBounds): number {
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return width * height;
}

export function sanitizePersistedWorkbenchWindowState(value: unknown): PersistedWorkbenchWindowState {
  if (!value || typeof value !== 'object') return { ...DEFAULT_WORKBENCH_WINDOW_STATE };
  const candidate = value as Partial<PersistedWorkbenchWindowState>;
  return {
    version: 1,
    bounds: validBounds(candidate.bounds) ? {
      x: Math.round(candidate.bounds.x),
      y: Math.round(candidate.bounds.y),
      width: Math.round(candidate.bounds.width),
      height: Math.round(candidate.bounds.height)
    } : null,
    maximized: candidate.maximized === true
  };
}

export function defaultWorkbenchBoundsForWorkArea(workArea: WindowBounds): WindowBounds {
  const useLargeProfile = workArea.width >= WORKBENCH_LARGE_SIZE.width
    && workArea.height >= WORKBENCH_LARGE_SIZE.height;
  return centeredBounds(useLargeProfile ? WORKBENCH_LARGE_SIZE : WORKBENCH_COMPACT_SIZE, workArea);
}

export function clampWorkbenchBoundsToWorkArea(bounds: WindowBounds, workArea: WindowBounds): WindowBounds {
  const minimumWidth = Math.min(WORKBENCH_MIN_SIZE.width, workArea.width);
  const minimumHeight = Math.min(WORKBENCH_MIN_SIZE.height, workArea.height);
  const width = Math.min(Math.max(Math.round(bounds.width), minimumWidth), workArea.width);
  const height = Math.min(Math.max(Math.round(bounds.height), minimumHeight), workArea.height);
  return {
    x: Math.min(Math.max(Math.round(bounds.x), workArea.x), workArea.x + workArea.width - width),
    y: Math.min(Math.max(Math.round(bounds.y), workArea.y), workArea.y + workArea.height - height),
    width,
    height
  };
}

export function resolveWorkbenchWindowState(
  persistedValue: unknown,
  workAreas: readonly WindowBounds[],
  primaryWorkArea: WindowBounds
): ResolvedWorkbenchWindowState {
  const persisted = sanitizePersistedWorkbenchWindowState(persistedValue);
  if (!persisted.bounds) {
    return { bounds: defaultWorkbenchBoundsForWorkArea(primaryWorkArea), maximized: persisted.maximized };
  }

  let matchingArea: WindowBounds | null = null;
  let matchingPixels = 0;
  for (const workArea of workAreas) {
    const pixels = intersectionArea(persisted.bounds, workArea);
    if (pixels > matchingPixels) {
      matchingArea = workArea;
      matchingPixels = pixels;
    }
  }

  const bounds = matchingArea
    ? clampWorkbenchBoundsToWorkArea(persisted.bounds, matchingArea)
    : clampWorkbenchBoundsToWorkArea(centeredBounds(persisted.bounds, primaryWorkArea), primaryWorkArea);
  return { bounds, maximized: persisted.maximized };
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
