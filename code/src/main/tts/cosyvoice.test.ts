import { describe, expect, it } from 'vitest';
import { pcm16ToWav } from './cosyvoice';

describe('CosyVoice PCM response adapter', () => {
  it('wraps official FastAPI PCM16 output in a playable mono WAV container', () => {
    const wav = pcm16ToWav(new Uint8Array([0, 0, 255, 127]), 22050);
    expect(Buffer.from(wav.subarray(0, 4)).toString('ascii')).toBe('RIFF');
    expect(Buffer.from(wav.subarray(8, 12)).toString('ascii')).toBe('WAVE');
    expect(Buffer.from(wav.subarray(36, 40)).toString('ascii')).toBe('data');
    expect(new DataView(wav.buffer).getUint32(40, true)).toBe(4);
    expect([...wav.subarray(44)]).toEqual([0, 0, 255, 127]);
  });
});
