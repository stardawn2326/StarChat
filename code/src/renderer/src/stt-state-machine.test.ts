import { describe, expect, it } from 'vitest';
import { SttStateMachine } from './stt-state-machine';

describe('STT lifecycle state machine', () => {
  it('waits for first speech before applying the silence timeout', () => {
    const machine = new SttStateMachine({ initialSpeechTimeoutMs: 8000, silenceTimeoutMs: 1400 });
    machine.start(100);
    machine.markReady();
    expect(machine.snapshot().state).toBe('waiting_for_speech');
    expect(machine.tick(1499)).toBeNull();
    machine.markSpeech(1600);
    expect(machine.tick(2999)).toBeNull();
    expect(machine.tick(3000)).toBe('silence-timeout');
    expect(machine.snapshot().stopReason).toBe('silence-timeout');
  });

  it('uses an independent initial speech timeout', () => {
    const machine = new SttStateMachine({ initialSpeechTimeoutMs: 8000, silenceTimeoutMs: 1400 });
    machine.start(100);
    machine.markReady();
    expect(machine.tick(8099)).toBeNull();
    expect(machine.tick(8100)).toBe('initial-timeout');
  });

  it('can be stopped and ended safely during teardown', () => {
    const machine = new SttStateMachine();
    machine.start(1);
    machine.fail();
    expect(machine.snapshot().state).toBe('error');
    machine.ended();
    expect(machine.snapshot().state).toBe('idle');
  });
});
