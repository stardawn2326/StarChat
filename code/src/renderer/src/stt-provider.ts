import type { SttHandlers, SttProvider } from '../../shared/stt';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex?: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
}

export type SpeechRecognitionFactory = () => SpeechRecognitionLike;

function browserFactory(): SpeechRecognitionFactory | null {
  const candidate = globalThis as typeof globalThis & {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const Constructor = candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition;
  return Constructor ? () => new Constructor() : null;
}

export class BrowserSpeechRecognitionProvider implements SttProvider {
  readonly name = 'Browser SpeechRecognition';
  private readonly factory: SpeechRecognitionFactory | null;
  private recognition: SpeechRecognitionLike | null = null;
  private handlers: SttHandlers | null = null;

  constructor(factory: SpeechRecognitionFactory | null = browserFactory()) {
    this.factory = factory;
  }

  isAvailable(): boolean {
    return this.factory !== null;
  }

  start(handlers: SttHandlers): void {
    if (!this.factory) {
      handlers.onError('当前运行环境未提供手动语音识别');
      handlers.onEnd();
      return;
    }
    this.stop();
    const recognition = this.factory();
    this.recognition = recognition;
    this.handlers = handlers;
    recognition.lang = 'zh-CN';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      const start = Math.max(0, Math.min(event.resultIndex ?? 0, event.results.length));
      for (let index = start; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = result?.[0]?.transcript?.trim();
        if (text) this.handlers?.onText(text, Boolean(result.isFinal));
      }
    };
    recognition.onerror = (event) => {
      this.handlers?.onError(event.error ? `语音识别失败：${event.error}` : '语音识别失败');
    };
    recognition.onend = () => {
      const current = this.handlers;
      this.handlers = null;
      this.recognition = null;
      current?.onEnd();
    };
    try {
      recognition.start();
    } catch (error) {
      this.handlers = null;
      this.recognition = null;
      handlers.onError(error instanceof Error ? error.message : '语音识别无法启动');
      handlers.onEnd();
    }
  }

  stop(): void {
    const recognition = this.recognition;
    if (!recognition) return;
    try {
      recognition.stop();
    } catch {
      recognition.abort?.();
    }
  }
}
