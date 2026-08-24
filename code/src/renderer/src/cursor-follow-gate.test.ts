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
});
