import { describe, expect, it } from 'vitest';
import {
  EmotionCueGate,
  LipSyncEnvelope,
  StreamingSentenceBuffer,
  splitRealtimePresentation,
  mouthFormAtProgress
} from './speech-performance';
import type { PresentationEvent } from '../../shared/presentation';

describe('streaming speech performance', () => {
  it('releases complete clauses immediately and flushes the final fragment once', () => {
    const buffer = new StreamingSentenceBuffer();
    expect(buffer.push('你好，今天')).toEqual([]);
    expect(buffer.push('很高兴见到你。下一')).toEqual(['你好，今天很高兴见到你。']);
    expect(buffer.push('句还没完')).toEqual([]);
    expect(buffer.flush()).toEqual(['下一句还没完']);
    expect(buffer.flush()).toEqual([]);
  });

  it('splits an overlong comma clause without producing tiny speech fragments', () => {
    const buffer = new StreamingSentenceBuffer(12);
    expect(buffer.push('这是一段已经足够长的内容，可以先说出来，后面继续。')).toEqual([
      '这是一段已经足够长的内容，',
      '可以先说出来，',
      '后面继续。'
    ]);
  });

  it('uses attack and release smoothing while closing fully in silence', () => {
    const envelope = new LipSyncEnvelope({ silenceFloor: 0.02, gain: 6, attackMs: 45, releaseMs: 110 });
    expect(envelope.update(0.01, 16)).toBe(0);
    const opening = envelope.update(0.18, 16);
    expect(opening).toBeGreaterThan(0);
    expect(opening).toBeLessThan(1);
    const closing = envelope.update(0, 16);
    expect(closing).toBeLessThan(opening);
    for (let index = 0; index < 30; index += 1) envelope.update(0, 16);
    expect(envelope.value).toBe(0);
  });

  it('estimates a compatible mouth form and closes at punctuation', () => {
    expect(mouthFormAtProgress('so cute!', 0.2)).toBeGreaterThan(0);
    expect(mouthFormAtProgress('nice!', 0.1)).toBeLessThan(0);
    expect(mouthFormAtProgress('好。', 1)).toBe(0);
  });

  it('prevents rapid expression flicker while allowing a later change', () => {
    const gate = new EmotionCueGate(1600);
    expect(gate.accept('caring_smile', 1000)).toBe(true);
    expect(gate.accept('surprised', 1800)).toBe(false);
    expect(gate.accept('surprised', 2700)).toBe(true);
    expect(gate.accept('surprised', 4000)).toBe(false);
  });

  it('keeps only the newest hold-blocked emotion and applies it after the minimum hold', () => {
    const gate = new EmotionCueGate(1600);
    expect(gate.accept('caring_smile', 1000)).toBe(true);
    expect(gate.accept('surprised', 1500)).toBe(false);
    expect(gate.accept('angry', 1600)).toBe(false);
    expect(gate.flush(2500)).toBeNull();
    expect(gate.flush(2600)).toBe('angry');
    expect(gate.flush(4000)).toBeNull();
  });

  it('separates completed-sentence emotion from playback actions for immediate expression updates', () => {
    const events: PresentationEvent[] = [
      { type: 'expression', name: 'surprised', source: 'assistant', layer: 'dialogue_emotion' },
      { type: 'action', name: 'lean_forward', source: 'assistant', layer: 'reply_state' }
    ];

    expect(splitRealtimePresentation(events)).toEqual({
      realtime: [events[0]],
      playback: [events[1]]
    });
  });
});
