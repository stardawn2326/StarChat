import { describe, expect, it } from 'vitest';
import { clampPetWindowBounds, isPetResizeEdge } from './window-contract';

describe('pet interaction hit regions', () => {
  it('reserves only the eight-pixel frame for native resize', () => {
    expect(isPetResizeEdge(4, 300, 430, 600)).toBe(true);
    expect(isPetResizeEdge(215, 596, 430, 600)).toBe(true);
    expect(isPetResizeEdge(215, 300, 430, 600)).toBe(false);
  });

  it('clamps persisted dimensions to the selected display instead of a stale slider maximum', () => {
    expect(clampPetWindowBounds(
      { x: 0, y: 0, width: 4000, height: 3000 },
      { x: 0, y: 0, width: 2560, height: 1560 }
    )).toEqual({ x: 0, y: 0, width: 2560, height: 1560 });
  });
});
