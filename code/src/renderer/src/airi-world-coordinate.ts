export interface PixiWorldCursorInput {
  screenX: number;
  screenY: number;
  canvasScreenRect: {
    left: number;
    top: number;
  };
}

export interface PixiWorldPoint {
  x: number;
  y: number;
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * AIRI's eye-tracking coordinate boundary.
 *
 * The input is a screen/client point and a canvas rect in that same space.
 * The output is a Pixi world point in CSS logical pixels. Renderer resolution
 * owns the backing-pixel conversion; model-space inverse
 * transforms and Cubism signs deliberately belong to pixi-live2d-display's
 * Live2DModel.focus() implementation, not to this product adapter.
 */
export function pixiWorldPointFromCursor(input: PixiWorldCursorInput): PixiWorldPoint {
  return {
    x: finite(input.screenX, 0) - finite(input.canvasScreenRect.left, 0),
    y: finite(input.screenY, 0) - finite(input.canvasScreenRect.top, 0)
  };
}
