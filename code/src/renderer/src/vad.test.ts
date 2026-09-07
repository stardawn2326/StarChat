import { describe, expect, it } from 'vitest';
import { BasicVad } from './vad';

describe('basic VAD after STT', () => {
  it('ends only after configured silence and can be refreshed by speech', () => {
    const vad = new BasicVad({ silenceMs: 1000 });
    vad.start(100);
    expect(vad.tick(999)).toBe(false);
    vad.markVoice(900);
    expect(vad.tick(1800)).toBe(false);
    expect(vad.tick(1900)).toBe(true);
    vad.stop();
    expect(vad.isActive()).toBe(false);
  });
});
