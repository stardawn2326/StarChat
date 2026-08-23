import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { pixiWorldPointFromCursor } from './airi-world-coordinate';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const runtimeSource = readFileSync(resolve(testDirectory, 'live2d-runtime.js'), 'utf8');

function point(screenX: number, screenY: number) {
  return pixiWorldPointFromCursor({
    screenX,
    screenY,
    canvasScreenRect: { left: 10, top: 20 }
  });
}

describe('AIRI focus input boundary', () => {
  it('preserves the four screen directions and center in Pixi CSS logical pixels', () => {
    const center = point(110, 220);
    const right = point(160, 220);
    const left = point(60, 220);
    const above = point(110, 170);
    const below = point(110, 270);

    expect(center).toEqual({ x: 100, y: 200 });
    expect(right.x).toBeGreaterThan(center.x);
    expect(left.x).toBeLessThan(center.x);
    expect(above.y).toBeLessThan(center.y);
    expect(below.y).toBeGreaterThan(center.y);
  });

  it('keeps diagonal ordering without introducing a model-space sign or matrix', () => {
    const topRight = point(160, 170);
    const bottomLeft = point(60, 270);
    expect(topRight.x).toBeGreaterThan(bottomLeft.x);
    expect(topRight.y).toBeLessThan(bottomLeft.y);
    expect(runtimeSource).toContain('model.focus(worldPoint.x, worldPoint.y)');
    expect(runtimeSource).not.toContain('toModelPosition');
    expect(runtimeSource).not.toContain('invertTransform');
    expect(runtimeSource).not.toContain('composeAbsoluteModelMatrix');
  });
});
