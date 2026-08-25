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

  it('samples meaningful upward and downward idle gaze angles', () => {
    const values = [0.5, 1, 0, 0, 0.5, 0, 0, 0]; let index = 0;
    const gaze = new IdleGazeController(() => values[index++] ?? 0.5);
    gaze.update(1000, 1);
    const downward = gaze.update(1900, 1);
    gaze.update(6600, 1);
    const upward = gaze.update(7600, 1);
    expect(downward.y).toBeGreaterThan(0.55);
    expect(upward.y).toBeLessThan(-0.55);
  });

  it('keeps a subtle warmup before allowing larger random gaze transitions', () => {
    const values = [1, 1, 0, 0, 0.5, 0, 0, 0]; let index = 0;
    const gaze = new IdleGazeController(() => values[index++] ?? 0.5);

    gaze.begin(1000);
    const warmup = gaze.update(2500, 1);
    expect(gaze.phaseAt(2500)).toBe('warmup');
    expect(Math.abs(warmup.x)).toBeLessThanOrEqual(0.12);
    expect(Math.abs(warmup.y)).toBeLessThanOrEqual(0.12);
    expect(gaze.phaseAt(3999)).toBe('warmup');

    gaze.update(4000, 1);
    expect(gaze.phaseAt(4000)).toBe('random');
  });
});
