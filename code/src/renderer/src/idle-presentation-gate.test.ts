import { describe, expect, it } from 'vitest';
import { IdlePresentationGate } from './idle-presentation-gate';

describe('idle presentation warmup gate', () => {
  it('holds subtle presentation for three seconds, then starts one large idle action', () => {
    const gate = new IdlePresentationGate(3000);

    expect(gate.arm(1000)).toEqual({ phase: 'warmup', startLargeAction: false });
    expect(gate.update(3999)).toEqual({ phase: 'warmup', startLargeAction: false });
    expect(gate.update(4000)).toEqual({ phase: 'ready', startLargeAction: true });
    expect(gate.update(4500)).toEqual({ phase: 'ready', startLargeAction: false });
  });

  it('cancels the pending large action and requires a new arm after dialogue', () => {
    const gate = new IdlePresentationGate(3000);
    gate.arm(1000);
    gate.pause();

    expect(gate.update(5000)).toEqual({ phase: 'paused', startLargeAction: false });
    expect(gate.arm(6000)).toEqual({ phase: 'warmup', startLargeAction: false });
    expect(gate.update(8999)).toEqual({ phase: 'warmup', startLargeAction: false });
    expect(gate.update(9000)).toEqual({ phase: 'ready', startLargeAction: true });
  });
});
