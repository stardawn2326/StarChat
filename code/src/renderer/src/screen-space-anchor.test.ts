import { describe, expect, it } from 'vitest';
import { localPointForScreenAnchor, screenPointForLocalPoint } from './screen-space-anchor';

describe('screen-space model anchor during pet-window resize', () => {
  it.each([
    ['left', { x: 80, y: 100 }],
    ['top', { x: 100, y: 70 }],
    ['top-left', { x: 80, y: 70 }],
    ['right', { x: 100, y: 100 }],
    ['bottom', { x: 100, y: 100 }]
  ])('keeps the model at the same desktop point while resizing from %s', (_edge, nextOrigin) => {
    const originalOrigin = { x: 100, y: 100 };
    const originalLocal = { x: 216, y: 300 };
    const anchor = screenPointForLocalPoint(originalLocal, originalOrigin);
    const nextLocal = localPointForScreenAnchor(anchor, nextOrigin);

    expect(screenPointForLocalPoint(nextLocal, nextOrigin)).toEqual(anchor);
  });
});
