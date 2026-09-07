export type SttState = 'idle' | 'starting' | 'waiting_for_speech' | 'speech_active' | 'silence' | 'stopping' | 'error';

export type SttStopReason = 'manual' | 'initial-timeout' | 'silence-timeout' | 'provider-end' | 'error';

export interface SttStateSnapshot {
  state: SttState;
  startedAt: number | null;
  firstSpeechAt: number | null;
  lastSpeechAt: number | null;
  stopReason: SttStopReason | null;
}

export interface SttStateMachineOptions {
  initialSpeechTimeoutMs?: number;
  silenceTimeoutMs?: number;
}

export class SttStateMachine {
  private readonly initialSpeechTimeoutMs: number;
  private readonly silenceTimeoutMs: number;
  private snapshotValue: SttStateSnapshot = {
    state: 'idle',
    startedAt: null,
    firstSpeechAt: null,
    lastSpeechAt: null,
    stopReason: null
  };

  constructor(options: SttStateMachineOptions = {}) {
    this.initialSpeechTimeoutMs = Math.max(1000, Math.round(options.initialSpeechTimeoutMs ?? 8000));
    this.silenceTimeoutMs = Math.max(250, Math.round(options.silenceTimeoutMs ?? 1400));
  }

  start(now = Date.now()): SttStateSnapshot {
    this.snapshotValue = { state: 'starting', startedAt: now, firstSpeechAt: null, lastSpeechAt: null, stopReason: null };
    return this.snapshot();
  }

  markReady(): SttStateSnapshot {
    if (this.snapshotValue.state === 'starting') this.snapshotValue.state = 'waiting_for_speech';
    return this.snapshot();
  }

  markSpeech(now = Date.now()): SttStateSnapshot {
    if (this.snapshotValue.state === 'idle' || this.snapshotValue.state === 'stopping' || this.snapshotValue.state === 'error') return this.snapshot();
    this.snapshotValue.state = 'speech_active';
    this.snapshotValue.firstSpeechAt ??= now;
    this.snapshotValue.lastSpeechAt = now;
    return this.snapshot();
  }

  tick(now = Date.now()): SttStopReason | null {
    const current = this.snapshotValue;
    if ((current.state === 'starting' || current.state === 'waiting_for_speech') && current.startedAt !== null && now - current.startedAt >= this.initialSpeechTimeoutMs) {
      this.stop('initial-timeout');
      return 'initial-timeout';
    }
    if ((current.state === 'speech_active' || current.state === 'silence') && current.lastSpeechAt !== null && now - current.lastSpeechAt >= this.silenceTimeoutMs) {
      this.stop('silence-timeout');
      return 'silence-timeout';
    }
    if (current.state === 'speech_active' && current.lastSpeechAt !== null && now - current.lastSpeechAt >= Math.min(300, this.silenceTimeoutMs)) current.state = 'silence';
    return null;
  }

  stop(reason: SttStopReason = 'manual'): SttStateSnapshot {
    this.snapshotValue = { ...this.snapshotValue, state: reason === 'error' ? 'error' : 'stopping', stopReason: reason };
    return this.snapshot();
  }

  ended(): SttStateSnapshot {
    this.snapshotValue = { ...this.snapshotValue, state: 'idle' };
    return this.snapshot();
  }

  fail(): SttStateSnapshot {
    return this.stop('error');
  }

  snapshot(): SttStateSnapshot {
    return { ...this.snapshotValue };
  }

  isActive(): boolean {
    return this.snapshotValue.state !== 'idle' && this.snapshotValue.state !== 'error';
  }
}
