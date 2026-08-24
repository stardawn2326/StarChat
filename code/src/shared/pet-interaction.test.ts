import { describe, expect, it } from 'vitest';
import { clampPetWindowBounds, isPetResizeEdge, nextPetResizeBounds, petResizeEdge } from './window-contract';

describe('pet interaction hit regions', () => {
  it('reserves only the eight-pixel frame for native resize', () => {
    expect(isPetResizeEdge(4, 300, 430, 600)).toBe(true);
    expect(isPetResizeEdge(215, 596, 430, 600)).toBe(true);
    expect(isPetResizeEdge(215, 300, 430, 600)).toBe(false);
  });

  it('resizes one captured edge without turning a window move into scaling', () => {
    expect(petResizeEdge(429, 300, 430, 600)).toBe('e');
    expect(nextPetResizeBounds(
      { x: 100, y: 100, width: 430, height: 600 },
      { screenX: 530, screenY: 400 }, { screenX: 580, screenY: 430 }, 'e'
    )).toEqual({ x: 100, y: 100, width: 480, height: 600 });
  });

  it('clamps persisted dimensions to the selected display instead of a stale slider maximum', () => {
    expect(clampPetWindowBounds(
      { x: 0, y: 0, width: 4000, height: 3000 },
      { x: 0, y: 0, width: 2560, height: 1560 }
    )).toEqual({ x: 0, y: 0, width: 2560, height: 1560 });
  });
});
