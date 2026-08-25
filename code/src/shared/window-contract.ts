export interface WindowBounds { x: number; y: number; width: number; height: number; }
export interface WorkArea { x: number; y: number; width: number; height: number; }
export interface ModelViewportContract { modelOffsetX: number; modelOffsetY: number; modelScale: number; }
export interface CanvasCssSize { width: number; height: number; }
export interface CanvasViewport extends CanvasCssSize { backingWidth: number; backingHeight: number; renderScale: number; }
export interface UserModelTransform { userScale: number; userX: number; userY: number; }
export interface AbsoluteModelTransform extends UserModelTransform { finalScale: number; viewport: CanvasCssSize; }
export interface ModelFeaturePoint { x: number; y: number; }
export interface FocusGeometry { canvasScreenRect: { left: number; top: number; width: number; height: number }; eyeAnchor: ModelFeaturePoint; visibleHalfExtent: ModelFeaturePoint; }
export interface StableViewportProjection extends CanvasCssSize { referenceHeight: number; viewScale: number; cssPixelsPerWorldUnit: number; }
export interface ModelBounds { left: number; right: number; top: number; bottom: number; }
export type PetPointerOperation = 'model-transform' | 'window-and-model-drag' | 'window-resize';
export interface PetBoundsChange { bounds: WindowBounds; operation: PetPointerOperation | null; }
export type PetResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
export const PET_RESIZE_EDGE_PX = 8;

export function petPointerOperationContract(operation: PetPointerOperation): {
  changesModelTransform: boolean;
  changesWindowBounds: boolean;
  compensateModelScreenAnchor: boolean;
} {
  if (operation === 'model-transform') {
    return { changesModelTransform: true, changesWindowBounds: false, compensateModelScreenAnchor: false };
  }
  if (operation === 'window-and-model-drag') {
    return { changesModelTransform: false, changesWindowBounds: true, compensateModelScreenAnchor: false };
  }
  return { changesModelTransform: false, changesWindowBounds: true, compensateModelScreenAnchor: true };
}

export function isPetResizeEdge(localX: number, localY: number, width: number, height: number, edge = PET_RESIZE_EDGE_PX): boolean {
  if (![localX, localY, width, height, edge].every(Number.isFinite) || width <= 0 || height <= 0) return false;
  return localX <= edge || localY <= edge || localX >= width - edge || localY >= height - edge;
}

export function petResizeEdge(localX: number, localY: number, width: number, height: number, edge = PET_RESIZE_EDGE_PX): PetResizeEdge | null {
  if (!isPetResizeEdge(localX, localY, width, height, edge)) return null;
  const north = localY <= edge; const south = localY >= height - edge;
  const west = localX <= edge; const east = localX >= width - edge;
  if (north && west) return 'nw'; if (north && east) return 'ne';
  if (south && west) return 'sw'; if (south && east) return 'se';
  if (north) return 'n'; if (south) return 's';
  return west ? 'w' : 'e';
}

export function nextPetResizeBounds(start: WindowBounds, startPoint: { screenX: number; screenY: number }, point: { screenX: number; screenY: number }, edge: PetResizeEdge): WindowBounds {
  const dx = point.screenX - startPoint.screenX; const dy = point.screenY - startPoint.screenY;
  const east = edge.includes('e'); const west = edge.includes('w');
  const north = edge.includes('n'); const south = edge.includes('s');
  const width = Math.max(PET_WINDOW_BOUNDS.minWidth, start.width + (east ? dx : west ? -dx : 0));
  const height = Math.max(PET_WINDOW_BOUNDS.minHeight, start.height + (south ? dy : north ? -dy : 0));
  return { x: west ? start.x + start.width - width : start.x, y: north ? start.y + start.height - height : start.y, width, height };
}
export function sameWindowBounds(a: WindowBounds, b: WindowBounds): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}
export const PET_WINDOW_BOUNDS = { minWidth: 240, minHeight: 240, maxWidth: 1200, maxHeight: 1200 } as const;
const finite = (value: number, fallback: number): number => Number.isFinite(value) ? value : fallback;
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** CSS pixels are the only logical coordinate unit. DPR changes backing resolution only. */
export function canvasViewport(css: CanvasCssSize, renderScale: number): CanvasViewport {
  const width = Math.max(1, finite(css.width, 1));
  const height = Math.max(1, finite(css.height, 1));
  const scale = clamp(finite(renderScale, 1), 0.5, 4);
  return { width, height, backingWidth: Math.round(width * scale), backingHeight: Math.round(height * scale), renderScale: scale };
}

/**
 * Absolute view projection used by the renderer.  Cubism's projection maps a
 * world unit to half the current CSS height; the view scale compensates that
 * ratio against one fixed first-load reference height.  Resize therefore only
 * changes the visible logical rectangle, never the model's CSS-pixel scale.
 */
export function stableViewportProjection(css: CanvasCssSize, referenceHeight: number): StableViewportProjection {
  const width = Math.max(1, finite(css.width, 1));
  const height = Math.max(1, finite(css.height, 1));
  const reference = Math.max(1, finite(referenceHeight, height));
  return { width, height, referenceHeight: reference, viewScale: reference / height, cssPixelsPerWorldUnit: reference / 2 };
}

/** Absolute composition: runtime applies this to the untouched original model matrix. */
export function composeAbsoluteModelTransform(user: UserModelTransform, viewport: CanvasCssSize): AbsoluteModelTransform {
  const userScale = clamp(finite(user.userScale, 1), 0.55, 2.4);
  return { userScale, userX: finite(user.userX, 0), userY: finite(user.userY, 0), finalScale: userScale, viewport: { width: Math.max(1, finite(viewport.width, 1)), height: Math.max(1, finite(viewport.height, 1)) } };
}

/** Compose raw model matrix × user transform without accumulating the current matrix. */
export function composeAbsoluteModelMatrix(base: readonly number[], user: UserModelTransform, referenceHeight: number): number[] {
  const result = Array.from({ length: 16 }, (_, index) => finite(Number(base[index]), index % 5 === 0 ? 1 : 0));
  const scale = clamp(finite(user.userScale, 1), 0.55, 2.4);
  const reference = Math.max(1, finite(referenceHeight, 600));
  // Preserve the model's original basis (including any rotation/skew) and
  // apply userScale as a separate, monotonic multiplier.
  for (const index of [0, 1, 4, 5, 8, 9]) result[index] *= scale;
  // Offsets are CSS pixels in an independent channel; they are not scaled by
  // userScale and use the fixed first-load reference height.
  result[12] = finite(Number(base[12]), 0) + finite(user.userX, 0) * 2 / reference;
  result[13] = finite(Number(base[13]), 0) - finite(user.userY, 0) * 2 / reference;
  return result;
}

/** Build focus geometry from actual model-space bounds and its absolute matrix. */
export function focusGeometryFromModelBounds(bounds: ModelBounds, matrix: readonly number[], viewport: CanvasCssSize & { referenceHeight: number }): FocusGeometry {
  const width = Math.max(1, finite(viewport.width, 1));
  const height = Math.max(1, finite(viewport.height, 1));
  const pixelsPerWorld = Math.max(0.5, finite(viewport.referenceHeight, height) / 2);
  const scaleX = Math.max(0.0001, Math.abs(finite(Number(matrix[0]), 1)));
  const scaleY = Math.max(0.0001, Math.abs(finite(Number(matrix[5]), 1)));
  const tx = finite(Number(matrix[12]), 0);
  const ty = finite(Number(matrix[13]), 0);
  const modelCenterX = (finite(bounds.left, -1) + finite(bounds.right, 1)) / 2;
  const modelCenterY = (finite(bounds.top, 1) + finite(bounds.bottom, -1)) / 2;
  return {
    canvasScreenRect: { left: 0, top: 0, width, height },
    eyeAnchor: { x: width / 2 + (tx + modelCenterX * scaleX) * pixelsPerWorld, y: height / 2 - (ty + modelCenterY * scaleY) * pixelsPerWorld },
    visibleHalfExtent: { x: Math.max(1, Math.abs(finite(bounds.right, 1) - finite(bounds.left, -1)) * scaleX * pixelsPerWorld / 2), y: Math.max(1, Math.abs(finite(bounds.top, 1) - finite(bounds.bottom, -1)) * scaleY * pixelsPerWorld / 2) }
  };
}

/** Global desktop cursor -> canvas CSS pixels -> eye-centred normalized focus. */
export function focusPointForScreenCursor(screenX: number, screenY: number, geometry: FocusGeometry): ModelFeaturePoint {
  const localX = screenX - geometry.canvasScreenRect.left;
  const localY = screenY - geometry.canvasScreenRect.top;
  return { x: clamp((localX - geometry.eyeAnchor.x) / Math.max(1, Math.abs(geometry.visibleHalfExtent.x)), -1, 1), y: clamp((geometry.eyeAnchor.y - localY) / Math.max(1, Math.abs(geometry.visibleHalfExtent.y)), -1, 1) };
}

export function clampPetWindowBounds(input: WindowBounds, workArea: WorkArea): WindowBounds {
  const width = clamp(Math.round(input.width), PET_WINDOW_BOUNDS.minWidth, Math.max(PET_WINDOW_BOUNDS.minWidth, workArea.width));
  const height = clamp(Math.round(input.height), PET_WINDOW_BOUNDS.minHeight, Math.max(PET_WINDOW_BOUNDS.minHeight, workArea.height));
  const maxX = workArea.x + Math.max(0, workArea.width - width);
  const maxY = workArea.y + Math.max(0, workArea.height - height);
  return { x: clamp(Math.round(input.x), workArea.x, maxX), y: clamp(Math.round(input.y), workArea.y, maxY), width, height };
}

export function projectModelFeature(feature: ModelFeaturePoint, viewport: ModelViewportContract): ModelFeaturePoint { return { x: viewport.modelOffsetX + feature.x * viewport.modelScale, y: viewport.modelOffsetY + feature.y * viewport.modelScale }; }
export function featureDistance(a: ModelFeaturePoint, b: ModelFeaturePoint): number { return Math.hypot(b.x - a.x, b.y - a.y); }
export function preserveModelTransformOnWindowResize(viewport: ModelViewportContract): ModelViewportContract { return { ...viewport }; }
export function compensateModelViewportForWindowOrigin(viewport: ModelViewportContract, before: WindowBounds, after: WindowBounds): ModelViewportContract {
  return {
    ...viewport,
    modelOffsetX: viewport.modelOffsetX + before.x - after.x,
    modelOffsetY: viewport.modelOffsetY + before.y - after.y
  };
}
export function sameModelTransform(a: ModelViewportContract, b: ModelViewportContract): boolean { return a.modelOffsetX === b.modelOffsetX && a.modelOffsetY === b.modelOffsetY && a.modelScale === b.modelScale; }
