import { describe, expect, it } from 'vitest';
import { IdleGazeController } from './idle-gaze';

describe('AIRI-style idle gaze', () => {
  it('holds a bounded random target then chooses another after a random dwell', () => {
    const values = [0, 0.5, 0, 1, 1, 1]; let index = 0;
    const gaze = new IdleGazeController(() => values[index++] ?? 0.5);
    expect(gaze.update(3000)).toEqual({ x: -0.5, y: -0.04999999999999999 });
    expect(gaze.update(4499)).toEqual({ x: -0.5, y: -0.04999999999999999 });
    expect(gaze.update(4500)).toEqual({ x: 0.5, y: 0.25 });
  });
});
