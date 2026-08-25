import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { nextPetDragBounds } from '../../main/window-drag';
import { canvasViewport, sameModelTransform } from '../../shared/window-contract';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const canvasSource = readFileSync(resolve(testDirectory, 'Live2DCanvas.tsx'), 'utf8');
const petSource = readFileSync(resolve(testDirectory, 'PetApp.tsx'), 'utf8');
const runtimeSource = readFileSync(resolve(testDirectory, 'live2d-runtime.js'), 'utf8');

interface DragViewportSnapshot {
  bounds: { x: number; y: number; width: number; height: number };
  canvasCss: { width: number; height: number };
  backing: { width: number; height: number };
  renderScale: number;
  model: {
    baseScale: number;
    finalScale: number;
    offsetX: number;
    offsetY: number;
  };
}

function moveWindow(snapshot: DragViewportSnapshot, screenX: number, screenY: number): DragViewportSnapshot {
  return {
    ...snapshot,
    bounds: nextPetDragBounds(
      snapshot.bounds,
      { screenX: 854, screenY: 350 },
      { screenX, screenY }
    )
  };
}

function changeDpi(snapshot: DragViewportSnapshot, renderScale: number): DragViewportSnapshot {
  const nextCanvas = canvasViewport(snapshot.canvasCss, renderScale);
  return {
    ...snapshot,
    backing: { width: nextCanvas.backingWidth, height: nextCanvas.backingHeight },
    renderScale: nextCanvas.renderScale
  };
}

function expectOnlyWindowPositionChanged(before: DragViewportSnapshot, after: DragViewportSnapshot): void {
  expect(after.bounds.width).toBe(before.bounds.width);
  expect(after.bounds.height).toBe(before.bounds.height);
  expect(after.canvasCss).toEqual(before.canvasCss);
  expect(after.backing).toEqual(before.backing);
  expect(after.renderScale).toBe(before.renderScale);
  expect(after.model).toEqual(before.model);
  expect({ width: after.bounds.width, height: after.bounds.height }).toEqual({
    width: before.bounds.width,
    height: before.bounds.height
  });
  expect({ x: after.bounds.x, y: after.bounds.y }).not.toEqual({ x: before.bounds.x, y: before.bounds.y });
}

function expectOnlyBackingResolutionChanged(before: DragViewportSnapshot, after: DragViewportSnapshot): void {
  expect(after.bounds).toEqual(before.bounds);
  expect(after.canvasCss).toEqual(before.canvasCss);
  expect(after.model).toEqual(before.model);
  expect(after.renderScale).not.toBe(before.renderScale);
  expect(after.backing.width).not.toBe(before.backing.width);
  expect(after.backing.height).not.toBe(before.backing.height);
  expect(sameModelTransform(
    {
      modelOffsetX: before.model.offsetX,
      modelOffsetY: before.model.offsetY,
      modelScale: before.model.finalScale
    },
    {
      modelOffsetX: after.model.offsetX,
      modelOffsetY: after.model.offsetY,
      modelScale: after.model.finalScale
    }
  )).toBe(true);
}

describe('PetWindow drag and DPI viewport invariants', () => {
  const initial: DragViewportSnapshot = {
    bounds: { x: 638, y: 210, width: 432, height: 600 },
    canvasCss: { width: 432, height: 600 },
    backing: { width: 432, height: 600 },
    renderScale: 1,
    model: { baseScale: 0.84, finalScale: 0.966, offsetX: 12, offsetY: -18 }
  };

  it('keeps native size, model transform, and CSS canvas size fixed throughout a normal drag', () => {
    const middle = moveWindow(initial, 934, 390);
    const end = moveWindow(middle, 1014, 430);

    expectOnlyWindowPositionChanged(initial, middle);
    expectOnlyWindowPositionChanged(initial, end);
  });

  it('keeps CSS pixels and model transform fixed while a cross-display move changes only backing resolution', () => {
    const middle = moveWindow(initial, 1384, 390);
    const crossDisplay = changeDpi(middle, 2);
    const end = moveWindow(crossDisplay, 1464, 430);

    expectOnlyWindowPositionChanged(initial, middle);
    expectOnlyBackingResolutionChanged(middle, crossDisplay);
    expectOnlyWindowPositionChanged(crossDisplay, end);
    expect(end.model).toEqual(initial.model);
    expect(end.canvasCss).toEqual(initial.canvasCss);
  });

  it('gives Pixi the sole ownership of the canvas backing store and renderer resolution', () => {
    expect(canvasSource).not.toMatch(/canvas\.width\s*=/);
    expect(canvasSource).not.toMatch(/canvas\.height\s*=/);
    expect(runtimeSource).toContain('resolution: nextViewport.renderScale');
    expect(runtimeSource).toContain('app.renderer.resolution = nextViewport.renderScale');
    expect(runtimeSource).not.toContain('app.stage.scale.set');
    expect(runtimeSource).not.toMatch(/nextViewport\.width\s*\*\s*nextViewport\.renderScale/);
    expect(runtimeSource).not.toMatch(/nextViewport\.height\s*\*\s*nextViewport\.renderScale/);
    expect(runtimeSource).not.toMatch(/model\.position\.[xy]\s*\*\s*viewport\.renderScale/);
    expect(runtimeSource).not.toMatch(/viewport\.(width|height)\s*\*\s*viewport\.renderScale/);
  });

  it('keeps window resize independent from the persisted model viewport', () => {
    const finalizeStart = petSource.indexOf('const finalizeActivePointer');
    const resizeMove = petSource.slice(petSource.indexOf("if (gesture.operation === 'window-resize')"), finalizeStart);
    const resizeFinish = petSource.slice(petSource.indexOf("if (gesture.operation === 'window-resize')", finalizeStart), petSource.indexOf('const cancelActivePointer'));
    for (const resizePath of [resizeMove, resizeFinish]) {
      expect(resizePath).not.toContain('persistModelViewport');
      expect(resizePath).not.toContain('updateModelViewport');
    }
    expect(petSource).not.toContain('compensateModelViewportForWindowOrigin');
  });
});
