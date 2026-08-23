import { describe, expect, it } from 'vitest';
import { buildCosyVoiceRequest, pcm16ToWav } from './cosyvoice';

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

describe('CosyVoice request modes', () => {
  it('builds the official zero-shot endpoint with prompt text and WAV', () => {
    const request = buildCosyVoiceRequest('你好', {
      mode: 'zero-shot', promptText: '参考文本', promptWav: new Uint8Array([1, 2, 3])
    }, 'http://127.0.0.1:50000');
    expect(request.endpoint.pathname).toBe('/inference_zero_shot');
    expect(request.form.get('tts_text')).toBe('你好');
    expect(request.form.get('prompt_text')).toBe('参考文本');
    expect(request.form.get('prompt_wav')).toBeInstanceOf(Blob);
    expect(request.sampleRate).toBe(24000);
  });
});
