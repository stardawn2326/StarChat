import { describe, expect, it } from 'vitest';
import { ProceduralGestureTimeline, sampleProceduralGesture } from './procedural-gesture';

describe('adaptive procedural gestures', () => {
  it('produces deterministic nod and shake curves without raw Cubism IDs', () => {
    expect(sampleProceduralGesture('nod', 360, 720)).toEqual({ head_y: -0.35 });
    expect(sampleProceduralGesture('shake_head', 180, 720)).toEqual({ head_x: 0.35 });
    expect(sampleProceduralGesture('tilt_confused', 360, 720)).toEqual({ head_z: 0.22 });
  });

  it('scales semantic fallback gestures for readable nod, shake, tilt and emphasis', () => {
    expect(sampleProceduralGesture('nod', 360, 720, 1.5)).toEqual({ head_y: -0.525 });
    expect(sampleProceduralGesture('shake_head', 180, 720, 1.5)).toEqual({ head_x: 0.525 });
    expect(sampleProceduralGesture('tilt_confused', 360, 720, 1.5)).toEqual({ head_z: 0.33 });
    expect(sampleProceduralGesture('emphasis', 360, 720, 1.5)).toEqual({ body_x: 0.27, head_y: -0.18 });
  });

  it('clamps progress, supports replacement, and cancels expired gestures', () => {
    const timeline = new ProceduralGestureTimeline();
    const first = timeline.start('nod', 100, 720);
    expect(timeline.sample(first, 820)?.done).toBe(true);
    const second = timeline.start('shake_head', 900, 720);
    expect(timeline.sample(first, 920)).toBeNull();
    expect(timeline.sample(second, 900)?.values).toEqual({ head_x: 0 });
    timeline.cancel();
    expect(timeline.sample(second, 940)).toBeNull();
  });
});
