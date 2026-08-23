import { describe, expect, it } from 'vitest';
import { nextPetDragBounds } from './window-drag';

describe('pet window drag bounds', () => {
  it('moves only x/y and preserves the captured window size', () => {
    expect(nextPetDragBounds(
      { x: 638, y: 210, width: 432, height: 600 },
      { screenX: 854, screenY: 350 },
      { screenX: 934, screenY: 390 }
    )).toEqual({ x: 718, y: 250, width: 432, height: 600 });
  });
});
