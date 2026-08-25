import { describe, expect, it } from 'vitest';
import { CursorFollowGate } from './cursor-follow-gate';

describe('cursor follow activity gate', () => {
  it('follows continuously, holds for three seconds, then releases once', () => {
    const gate = new CursorFollowGate(3000);
    expect(gate.update(true, 1000)).toEqual({ mode: 'following', release: false });
    expect(gate.update(false, 3999)).toEqual({ mode: 'holding', release: false });
    expect(gate.update(false, 4000)).toEqual({ mode: 'released', release: true });
    expect(gate.update(false, 5000)).toEqual({ mode: 'released', release: false });
  });

  it('immediately resumes following after a released idle period', () => {
    const gate = new CursorFollowGate(3000);
    gate.update(true, 0);
    gate.update(false, 3000);
    expect(gate.update(true, 3100)).toEqual({ mode: 'following', release: false });
  });

  it('requires five full seconds of stillness before releasing by default', () => {
    const gate = new CursorFollowGate();
    gate.update(true, 1000);

    expect(gate.update(false, 5999)).toEqual({ mode: 'holding', release: false });
    expect(gate.update(false, 6000)).toEqual({ mode: 'released', release: true });
  });

  it('re-arms the full five-second wait after a dialogue reset', () => {
    const gate = new CursorFollowGate();
    gate.update(true, 1000);
    gate.update(false, 6000);
    expect(gate.update(false, 6000).mode).toBe('released');

    gate.reset();
    expect(gate.update(false, 7000)).toEqual({ mode: 'following', release: false });
    expect(gate.update(false, 11999)).toEqual({ mode: 'holding', release: false });
    expect(gate.update(false, 12000)).toEqual({ mode: 'released', release: true });
  });
});
