import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VoiceProfileStore } from './voice-profile-store';

function wav(seconds: number, sampleRate = 16000): Buffer {
  const pcmBytes = Math.round(seconds * sampleRate) * 2;
  const data = Buffer.alloc(44 + pcmBytes);
  data.write('RIFF', 0); data.writeUInt32LE(36 + pcmBytes, 4); data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(sampleRate, 24); data.writeUInt32LE(sampleRate * 2, 28);
  data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34); data.write('data', 36);
  data.writeUInt32LE(pcmBytes, 40);
  return data;
}

describe('custom voice profile store', () => {
  it('imports an app-owned WAV copy and preserves metadata across reloads', () => {
    const root = mkdtempSync(join(tmpdir(), 'baoyin-voice-'));
    const source = join(root, 'reference.wav');
    writeFileSync(source, wav(4));
    const before = readFileSync(source);
    const store = new VoiceProfileStore(join(root, 'userdata'));
    const profile = store.importWav(source, { name: '白音轻柔', promptText: '你好，我是白音。' });
    expect(profile.durationSeconds).toBeCloseTo(4, 2);
    expect(profile.sourceFileName).toBe('reference.wav');
    expect(readFileSync(source)).toEqual(before);
    expect(new VoiceProfileStore(join(root, 'userdata')).list()).toEqual([profile]);
    expect(readFileSync(store.audioPath(profile.id)).length).toBeGreaterThan(44);
  });

  it('rejects unsafe reference duration and mismatched file containers', () => {
    const root = mkdtempSync(join(tmpdir(), 'baoyin-voice-'));
    const store = new VoiceProfileStore(join(root, 'userdata'));
    const short = join(root, 'short.wav'); writeFileSync(short, wav(2));
    const fake = join(root, 'fake.wav'); writeFileSync(fake, 'not a wave');
    expect(() => store.importWav(short, { name: '短', promptText: '文本' })).toThrow('3–30');
    expect(() => store.importWav(fake, { name: '假', promptText: '文本' })).toThrow('WAV');
  });
});
