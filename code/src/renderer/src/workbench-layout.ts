export interface WorkbenchViewport {
  width: number;
  height: number;
}

export interface WorkbenchLayoutState {
  version: 4;
  sidebarCollapsed: boolean;
  rightRailCollapsed: boolean;
  bottomPanelOpen: boolean;
  sidebarWidth: number;
  rightRailWidth: number;
  bottomPanelHeight: number;
  characterWidth: number;
}

export const WORKBENCH_LAYOUT_STORAGE_KEY = 'starchat.workbench.layout.v4';
const LEGACY_WORKBENCH_LAYOUT_STORAGE_KEY = 'starchat.workbench.layout.v3';
export const WORKBENCH_MIN_CENTER_WIDTH = 760;
export const WORKBENCH_MIN_DIALOGUE_WIDTH = 470;

const SIDEBAR_MIN = 240;
const SIDEBAR_MAX = 360;
const RIGHT_RAIL_MIN = 220;
const RIGHT_RAIL_MAX = 520;
const BOTTOM_PANEL_MIN = 112;
const BOTTOM_PANEL_MAX = 420;
const CHARACTER_MIN = 240;
const CHARACTER_MAX = 560;

export const WORKBENCH_LAYOUT_LIMITS = {
  sidebar: { minimum: SIDEBAR_MIN, maximum: SIDEBAR_MAX },
  rightRail: { minimum: RIGHT_RAIL_MIN, maximum: RIGHT_RAIL_MAX },
  bottomPanel: { minimum: BOTTOM_PANEL_MIN, maximum: BOTTOM_PANEL_MAX },
  character: { minimum: CHARACTER_MIN, maximum: CHARACTER_MAX }
} as const;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(Math.round(value), minimum), Math.max(minimum, maximum));
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function usableViewport(viewport: WorkbenchViewport): WorkbenchViewport {
  return {
    width: Math.max(1, finiteOr(viewport.width, 1280)),
    height: Math.max(1, finiteOr(viewport.height, 900))
  };
}

export function maxRightRailWidth(viewportWidth: number, sidebarWidth: number): number {
  const available = Math.round(viewportWidth) - Math.round(sidebarWidth) - WORKBENCH_MIN_CENTER_WIDTH - 28;
  return clamp(available, RIGHT_RAIL_MIN, RIGHT_RAIL_MAX);
}

export function maxBottomPanelHeight(viewportHeight: number): number {
  return clamp(Math.round(viewportHeight) - 55 - 500 - 20, BOTTOM_PANEL_MIN, BOTTOM_PANEL_MAX);
}

export function maxCharacterPanelWidth(workflowWidth: number): number {
  return clamp(Math.round(workflowWidth) - WORKBENCH_MIN_DIALOGUE_WIDTH - 18, CHARACTER_MIN, CHARACTER_MAX);
}

export function defaultWorkbenchLayoutState(viewportValue: WorkbenchViewport): WorkbenchLayoutState {
  const viewport = usableViewport(viewportValue);
  const large = viewport.width >= 1700 && viewport.height >= 1050;
  const sidebarWidth = large ? 328 : 280;
  return {
    version: 4,
    sidebarCollapsed: false,
    rightRailCollapsed: true,
    bottomPanelOpen: false,
    sidebarWidth,
    rightRailWidth: Math.min(large ? 414 : 320, maxRightRailWidth(viewport.width, sidebarWidth)),
    bottomPanelHeight: Math.min(large ? 156 : 148, maxBottomPanelHeight(viewport.height)),
    characterWidth: large ? 389 : 300
  };
}

export function sanitizeWorkbenchLayoutState(value: unknown, viewportValue: WorkbenchViewport): WorkbenchLayoutState {
  const viewport = usableViewport(viewportValue);
  const defaults = defaultWorkbenchLayoutState(viewport);
  const rawCandidate = value && typeof value === 'object' ? value as Partial<Omit<WorkbenchLayoutState, 'version'>> & { version?: number } : {};
  const candidate = rawCandidate.version === 3
    ? { ...rawCandidate, version: 4, rightRailCollapsed: true, bottomPanelOpen: false }
    : rawCandidate;
  if (candidate.version !== 4) return defaults;
  const sidebarWidth = clamp(finiteOr(candidate.sidebarWidth, defaults.sidebarWidth), SIDEBAR_MIN, SIDEBAR_MAX);
  return {
    version: 4,
    sidebarCollapsed: typeof candidate.sidebarCollapsed === 'boolean' ? candidate.sidebarCollapsed : defaults.sidebarCollapsed,
    rightRailCollapsed: typeof candidate.rightRailCollapsed === 'boolean' ? candidate.rightRailCollapsed : defaults.rightRailCollapsed,
    bottomPanelOpen: typeof candidate.bottomPanelOpen === 'boolean' ? candidate.bottomPanelOpen : defaults.bottomPanelOpen,
    sidebarWidth,
    rightRailWidth: clamp(
      finiteOr(candidate.rightRailWidth, defaults.rightRailWidth),
      RIGHT_RAIL_MIN,
      RIGHT_RAIL_MAX
    ),
    bottomPanelHeight: clamp(
      finiteOr(candidate.bottomPanelHeight, defaults.bottomPanelHeight),
      BOTTOM_PANEL_MIN,
      BOTTOM_PANEL_MAX
    ),
    characterWidth: clamp(finiteOr(candidate.characterWidth, defaults.characterWidth), CHARACTER_MIN, CHARACTER_MAX)
  };
}

export function mergeWorkbenchLayoutState(
  current: WorkbenchLayoutState,
  patch: Partial<Omit<WorkbenchLayoutState, 'version'>>,
  viewport: WorkbenchViewport
): WorkbenchLayoutState {
  return sanitizeWorkbenchLayoutState({ ...current, ...patch, version: 4 }, viewport);
}

function currentViewport(): WorkbenchViewport {
  if (typeof window === 'undefined') return { width: 1280, height: 900 };
  return { width: window.innerWidth, height: window.innerHeight };
}

export function readWorkbenchLayoutState(viewport = currentViewport()): WorkbenchLayoutState {
  if (typeof window === 'undefined') return defaultWorkbenchLayoutState(viewport);
  try {
    const currentStored = window.localStorage.getItem(WORKBENCH_LAYOUT_STORAGE_KEY);
    const legacyStored = currentStored ? null : window.localStorage.getItem(LEGACY_WORKBENCH_LAYOUT_STORAGE_KEY);
    const migrated = legacyStored ? sanitizeWorkbenchLayoutState(JSON.parse(legacyStored), viewport) : null;
    const next = migrated ?? sanitizeWorkbenchLayoutState(currentStored ? JSON.parse(currentStored) : null, viewport);
    if (legacyStored && !currentStored) {
      window.localStorage.setItem(WORKBENCH_LAYOUT_STORAGE_KEY, JSON.stringify(next));
    }
    return next;
  } catch {
    return defaultWorkbenchLayoutState(viewport);
  }
}

export function writeWorkbenchLayoutPatch(
  patch: Partial<Omit<WorkbenchLayoutState, 'version'>>,
  viewport = currentViewport()
): WorkbenchLayoutState {
  const next = mergeWorkbenchLayoutState(readWorkbenchLayoutState(viewport), patch, viewport);
  if (typeof window !== 'undefined') {
    try { window.localStorage.setItem(WORKBENCH_LAYOUT_STORAGE_KEY, JSON.stringify(next)); } catch { /* storage may be unavailable */ }
  }
  return next;
}
