import { describe, expect, it } from 'vitest';
import { IdleGazeController } from './idle-gaze';

describe('AIRI-style idle gaze', () => {
  it('eases continuously toward each bounded target instead of jumping', () => {
    const values = [1, 1, 0, 0, 0, 0]; let index = 0;
    const gaze = new IdleGazeController(() => values[index++] ?? 0.5);
    const start = gaze.update(3000, 1);
    const middle = gaze.update(3400, 1);
    const end = gaze.update(3800, 1);
    expect(start).toEqual({ x: 0, y: 0 });
    expect(middle.x).toBeGreaterThan(0);
    expect(middle.x).toBeLessThan(0.75);
    expect(end.x).toBeGreaterThan(middle.x);
  });
});
