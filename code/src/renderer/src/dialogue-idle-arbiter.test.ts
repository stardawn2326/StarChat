import { describe, expect, it } from 'vitest';
import { DialogueIdleArbiter } from './dialogue-idle-arbiter';

describe('dialogue idle action arbitration', () => {
  it('stops and later restores an idle action interrupted by dialogue', () => {
    const arbiter = new DialogueIdleArbiter();

    expect(arbiter.pause('idle')).toEqual({ stopIdleAction: true });
    expect(arbiter.resume()).toEqual({ restartIdleAction: true });
    expect(arbiter.resume()).toEqual({ restartIdleAction: false });
  });

  it('does not manufacture an idle action when dialogue interrupted another priority', () => {
    const arbiter = new DialogueIdleArbiter();

    expect(arbiter.pause('normal')).toEqual({ stopIdleAction: false });
    expect(arbiter.resume()).toEqual({ restartIdleAction: false });
  });
});
