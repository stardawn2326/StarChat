import { describe, expect, it } from 'vitest';
import { nextPetDragBounds } from '../main/window-drag';
import { canvasViewport, compensateModelViewportForWindowOrigin, composeAbsoluteModelTransform, composeAbsoluteModelMatrix, featureDistance, focusGeometryFromModelBounds, focusPointForScreenCursor, petPointerOperationContract, preserveModelTransformOnWindowResize, projectModelFeature, stableViewportProjection, type PetPointerOperation } from './window-contract';

describe('absolute window/model coordinate contract', () => {
  it('keeps model transform, whole-window drag, and resize as mutually exclusive operations', () => {
    const operations: PetPointerOperation[] = ['model-transform', 'window-and-model-drag', 'window-resize'];
    expect(operations.map(petPointerOperationContract)).toEqual([
      { changesModelTransform: true, changesWindowBounds: false, compensateModelScreenAnchor: false },
      { changesModelTransform: false, changesWindowBounds: true, compensateModelScreenAnchor: false },
      { changesModelTransform: false, changesWindowBounds: true, compensateModelScreenAnchor: true }
    ]);
  });

  it('keeps model transform and pixel size identical across three viewport sizes', () => {
    const user = { userScale: 1.35, userX: 42, userY: -17 };
    const values = [{ width: 320, height: 420 }, { width: 640, height: 720 }, { width: 1000, height: 1100 }].map((viewport) => composeAbsoluteModelTransform(user, viewport));
    expect(values.map(({ finalScale, userX, userY }) => ({ finalScale, userX, userY }))).toEqual(Array(3).fill({ finalScale: 1.35, userX: 42, userY: -17 }));
  });
  it('is monotonic and drift-free at min/mid/max', () => {
    const sequence = [0.55, 1, 2.4, 1, 0.55, 2.4].map((userScale) => composeAbsoluteModelTransform({ userScale, userX: 7, userY: 9 }, { width: 500, height: 600 }));
    expect(sequence[0].finalScale).toBeLessThan(sequence[1].finalScale);
    expect(sequence[1].finalScale).toBeLessThan(sequence[2].finalScale);
    expect(sequence[2]).toMatchObject(sequence[5]);
  });
  it('keeps scale, X and Y orthogonal', () => {
    const base = { modelOffsetX: 20, modelOffsetY: -30, modelScale: 1.2 };
    const point = { x: 80, y: 120 };
    const p0 = projectModelFeature(point, base);
    expect(projectModelFeature(point, { ...base, modelOffsetX: 50 })).toEqual({ x: p0.x + 30, y: p0.y });
    expect(projectModelFeature(point, { ...base, modelOffsetY: 10 })).toEqual({ x: p0.x, y: p0.y + 40 });
    expect(preserveModelTransformOnWindowResize(base)).toEqual(base);
    const distance = featureDistance(projectModelFeature({ x: 0, y: 0 }, base), p0);
    const scaled = featureDistance(projectModelFeature({ x: 0, y: 0 }, { ...base, modelScale: 2.4 }), projectModelFeature(point, { ...base, modelScale: 2.4 }));
    expect(scaled / distance).toBeCloseTo(2);
  });
  it('keeps the model screen anchor fixed when north or west resize moves the window origin', () => {
    const viewport = { modelOffsetX: 24, modelOffsetY: -18, modelScale: 1.2 };
    expect(compensateModelViewportForWindowOrigin(viewport,
      { x: 500, y: 300, width: 430, height: 600 },
      { x: 420, y: 240, width: 510, height: 660 }
    )).toEqual({ modelOffsetX: 104, modelOffsetY: 42, modelScale: 1.2 });
  });

  it('keeps position-only Alt drag independent from window dimensions', () => {
    expect(nextPetDragBounds(
      { x: 100, y: 100, width: 430, height: 600 },
      { screenX: 530, screenY: 400 },
      { screenX: 630, screenY: 520 }
    )).toEqual({ x: 200, y: 220, width: 430, height: 600 });
  });
  it.each([1, 1.5, 2])('separates CSS logic from backing pixels at DPR %s', (dpr) => {
    expect(canvasViewport({ width: 401, height: 603 }, dpr)).toMatchObject({ width: 401, height: 603, backingWidth: Math.round(401 * dpr), backingHeight: Math.round(603 * dpr) });
    const focus = focusPointForScreenCursor(1220, 580, { canvasScreenRect: { left: 1000, top: 300, width: 401, height: 603 }, eyeAnchor: { x: 200, y: 260 }, visibleHalfExtent: { x: 180, y: 240 } });
    expect(focus).toEqual({ x: 20 / 180, y: -20 / 240 });
  });
  it('maps outside-window cursor relative to transformed eye anchor and clamps', () => {
    const geometry = { canvasScreenRect: { left: 1000, top: 300, width: 400, height: 600 }, eyeAnchor: { x: 230, y: 210 }, visibleHalfExtent: { x: 150, y: 220 } };
    expect(focusPointForScreenCursor(1230, 510, geometry)).toEqual({ x: 0, y: 0 });
    expect(focusPointForScreenCursor(1800, -100, geometry)).toEqual({ x: 1, y: 1 });
    expect(focusPointForScreenCursor(500, 1500, geometry)).toEqual({ x: -1, y: -1 });
  });
  it('rebuilds the view matrix absolutely across repeated resize without changing model pixel scale', () => {
    const first = stableViewportProjection({ width: 430, height: 600 }, 600);
    const resized = [
      stableViewportProjection({ width: 240, height: 240 }, 600),
      stableViewportProjection({ width: 1200, height: 1200 }, 600),
      stableViewportProjection({ width: 720, height: 480 }, 600)
    ];
    expect(first.cssPixelsPerWorldUnit).toBe(300);
    for (const viewport of resized) {
      expect(viewport.cssPixelsPerWorldUnit).toBe(first.cssPixelsPerWorldUnit);
      expect(viewport.viewScale).toBeCloseTo(600 / viewport.height, 8);
    }
  });
  it('uses one fixed transform reference height after resize and keeps pixel offsets stable', () => {
    const base = [2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1, 0, 0.1, -0.2, 0, 1];
    const first = composeAbsoluteModelMatrix(base, { userScale: 1.4, userX: 32, userY: -18 }, 600);
    const afterResize = composeAbsoluteModelMatrix(base, { userScale: 1.4, userX: 32, userY: -18 }, 600);
    expect(afterResize).toEqual(first);
    expect(first[0]).toBe(2.8);
    expect(first[5]).toBe(2.8);
    expect(first[12]).toBeCloseTo(0.1 + 32 * 2 / 600, 8);
    expect(first[13]).toBeCloseTo(-0.2 - (-18) * 2 / 600, 8);
  });
  it('composes base model matrix with monotonic userScale without overwriting base scale', () => {
    const base = [1.7, 0, 0, 0, 0, 2.1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const min = composeAbsoluteModelMatrix(base, { userScale: 0.55, userX: 0, userY: 0 }, 600);
    const mid = composeAbsoluteModelMatrix(base, { userScale: 1, userX: 0, userY: 0 }, 600);
    const max = composeAbsoluteModelMatrix(base, { userScale: 2.4, userX: 0, userY: 0 }, 600);
    expect(min[0]).toBeLessThan(mid[0]);
    expect(mid[0]).toBeLessThan(max[0]);
    expect(min[5]).toBeLessThan(mid[5]);
    expect(mid[5]).toBeLessThan(max[5]);
  });
  it('maps cursor through transformed model bounds rather than a fixed canvas center', () => {
    const geometry = focusGeometryFromModelBounds({ left: -0.8, right: 0.8, top: 1.1, bottom: -1.1 }, [1.2, 0, 0, 0, 0, 1.2, 0, 0, 0, 0, 1, 0, 0.25, -0.1, 0, 1], { width: 430, height: 600, referenceHeight: 600 });
    const center = focusPointForScreenCursor(215 + 0.25 * 300, 300 + 0.1 * 300, geometry);
    expect(center.x).toBeCloseTo(0, 5);
    expect(center.y).toBeCloseTo(0, 5);
  });
});
