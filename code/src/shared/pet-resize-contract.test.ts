import { describe, expect, it } from 'vitest';
import { sameWindowBounds } from './window-contract';

describe('PetWindow native resize contract', () => {
  it('ignores duplicate bounds before calling BrowserWindow.setBounds', () => {
    const bounds = { x: 100, y: 200, width: 430, height: 600 };
    expect(sameWindowBounds(bounds, { ...bounds })).toBe(true);
    expect(sameWindowBounds(bounds, { ...bounds, width: 431 })).toBe(false);
  });
});
