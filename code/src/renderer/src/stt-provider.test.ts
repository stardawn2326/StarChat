import { describe, expect, it } from 'vitest';
import { BrowserSpeechRecognitionProvider, type SpeechRecognitionFactory } from './stt-provider';
import type { SttHandlers } from '../../shared/stt';

class FakeRecognition {
  lang = '';
  continuous = false;
  interimResults = false;
  onresult: ((event: { resultIndex?: number; results: { length: number; [index: number]: { isFinal: boolean; length: number; [index: number]: { transcript: string } } } }) => void) | null = null;
  onerror: ((event: { error?: string }) => void) | null = null;
  onend: (() => void) | null = null;
  started = false;
  stopped = false;
  start(): void { this.started = true; }
  stop(): void { this.stopped = true; this.onend?.(); }
  emit(text: string, isFinal: boolean): void {
    const result = { isFinal, length: 1, 0: { transcript: text } };
    this.onresult?.({ resultIndex: 0, results: { length: 1, 0: result } });
  }
}

describe('manual speech recognition provider', () => {
  it('maps browser results without sending the message automatically', () => {
    const recognition = new FakeRecognition();
    const factory: SpeechRecognitionFactory = () => recognition;
    const events: string[] = [];
    const handlers: SttHandlers = { onText: (text, isFinal) => events.push(`${isFinal ? 'final' : 'interim'}:${text}`), onError: () => events.push('error'), onEnd: () => events.push('end') };
    const provider = new BrowserSpeechRecognitionProvider(factory);
    provider.start(handlers);
    recognition.emit('你好', false);
    recognition.emit('你好，StarChat', true);
    provider.stop();

    expect(provider.isAvailable()).toBe(true);
    expect(recognition.started).toBe(true);
    expect(events).toEqual(['interim:你好', 'final:你好，StarChat', 'end']);
  });

  it('reports unavailable environments through the provider contract', () => {
    const events: string[] = [];
    const provider = new BrowserSpeechRecognitionProvider(null);
    provider.start({ onText: () => events.push('text'), onError: (message) => events.push(message), onEnd: () => events.push('end') });
    expect(provider.isAvailable()).toBe(false);
    expect(events).toEqual(['当前运行环境未提供手动语音识别', 'end']);
  });
});
