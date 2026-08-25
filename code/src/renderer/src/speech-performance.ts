import type { PresentationEvent } from '../../shared/presentation';

export class StreamingSentenceBuffer {
  private buffer = '';

  constructor(private readonly commaSplitAfter = 28) {}

  push(delta: string): string[] {
    this.buffer += delta;
    const ready: string[] = [];
    while (this.buffer) {
      const strongIndex = this.buffer.search(/[。！？!?；;\n]/u);
      const commaIndex = this.buffer.search(/[，,、]/u);
      const maySplitComma = this.buffer.length >= this.commaSplitAfter && commaIndex >= 0;
      const boundary = maySplitComma && (strongIndex < 0 || commaIndex < strongIndex)
        ? commaIndex
        : strongIndex;
      if (boundary < 0) break;
      const sentence = this.buffer.slice(0, boundary + 1).trim();
      this.buffer = this.buffer.slice(boundary + 1);
      if (sentence) ready.push(sentence);
    }
    return ready;
  }

  flush(): string[] {
    const sentence = this.buffer.trim();
    this.buffer = '';
    return sentence ? [sentence] : [];
  }

  reset(): void {
    this.buffer = '';
  }
}

export function splitRealtimePresentation(events: readonly PresentationEvent[]): {
  realtime: PresentationEvent[];
  playback: PresentationEvent[];
} {
  return {
    realtime: events.filter((event) => event.type === 'expression'),
    playback: events.filter((event) => event.type !== 'expression')
  };
}

export interface LipSyncEnvelopeOptions {
  silenceFloor?: number;
  gain?: number;
  attackMs?: number;
  releaseMs?: number;
}

export class LipSyncEnvelope {
  value = 0;
  private readonly silenceFloor: number;
  private readonly gain: number;
  private readonly attackMs: number;
  private readonly releaseMs: number;

  constructor(options: LipSyncEnvelopeOptions = {}) {
    this.silenceFloor = options.silenceFloor ?? 0.018;
    this.gain = options.gain ?? 6.5;
    this.attackMs = options.attackMs ?? 42;
    this.releaseMs = options.releaseMs ?? 105;
  }

  update(rms: number, elapsedMs: number): number {
    const input = Number.isFinite(rms) ? Math.max(0, rms) : 0;
    const target = input <= this.silenceFloor
      ? 0
      : Math.min(1, (input - this.silenceFloor) * this.gain);
    const duration = target > this.value ? this.attackMs : this.releaseMs;
    const alpha = 1 - Math.exp(-Math.max(1, elapsedMs) / duration);
    this.value += (target - this.value) * alpha;
    if (target === 0 && this.value < 0.01) this.value = 0;
    return this.value;
  }

  reset(): void {
    this.value = 0;
  }
}

const ROUND_VOWELS = /[ouü]/iu;
const WIDE_VOWELS = /[ie]/iu;

export function mouthFormAtProgress(text: string, progress: number): number {
  if (!text) return 0;
  const ratio = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  const index = Math.min(text.length - 1, Math.floor(ratio * text.length));
  const current = text[index] ?? '';
  if (/[。！？!?；;，,、\s]/u.test(current)) return 0;
  for (let radius = 0; radius <= 2; radius += 1) {
    for (const candidateIndex of radius === 0 ? [index] : [index - radius, index + radius]) {
      const candidate = text[candidateIndex] ?? '';
      if (ROUND_VOWELS.test(candidate)) return 0.55;
      if (WIDE_VOWELS.test(candidate)) return -0.38;
      if (/[a]/iu.test(candidate)) return -0.12;
    }
  }
  return 0;
}

export class EmotionCueGate {
  private active: string | null = null;
  private changedAt = Number.NEGATIVE_INFINITY;
  private pending: string | null = null;

  constructor(private readonly minimumHoldMs = 1600) {}

  accept(expression: string, timestamp: number): boolean {
    if (!expression || expression === this.active) return false;
    const now = Number.isFinite(timestamp) ? timestamp : Date.now();
    if (this.active !== null && now - this.changedAt < this.minimumHoldMs) {
      this.pending = expression;
      return false;
    }
    this.active = expression;
    this.changedAt = now;
    this.pending = null;
    return true;
  }

  flush(timestamp: number): string | null {
    if (!this.pending) return null;
    const now = Number.isFinite(timestamp) ? timestamp : Date.now();
    if (this.active !== null && now - this.changedAt < this.minimumHoldMs) return null;
    const next = this.pending;
    this.pending = null;
    this.active = next;
    this.changedAt = now;
    return next;
  }

  hasPending(): boolean {
    return this.pending !== null;
  }

  reset(): void {
    this.active = null;
    this.changedAt = Number.NEGATIVE_INFINITY;
    this.pending = null;
  }
}

export interface PhraseCue {
  expression?: string | null;
  action?: string | null;
}

export interface ScheduledPhraseCue {
  id: number;
  emitAt: number;
  expression: string | null;
  action: string | null;
}

export class PhraseCueScheduler {
  private nextId = 0;
  private currentId: number | null = null;
  private lastEnqueuedAt = Number.NEGATIVE_INFINITY;

  constructor(private readonly options: { leadMs?: number; cooldownMs?: number } = {}) {}

  enqueue(cue: PhraseCue, timestamp: number): ScheduledPhraseCue | null {
    const expression = cue.expression || null;
    const action = cue.action || null;
    if (!expression && !action) return null;
    const now = Number.isFinite(timestamp) ? timestamp : Date.now();
    const cooldownMs = Math.max(0, this.options.cooldownMs ?? 650);
    if (now - this.lastEnqueuedAt < cooldownMs) return null;
    this.lastEnqueuedAt = now;
    const result = {
      id: ++this.nextId,
      emitAt: now + Math.max(0, this.options.leadMs ?? 420),
      expression,
      action
    };
    this.currentId = result.id;
    return result;
  }

  isCurrent(id: number): boolean {
    return this.currentId === id;
  }

  cancel(id?: number): void {
    if (id === undefined || this.currentId === id) this.currentId = null;
  }

  reset(): void {
    this.currentId = null;
    this.lastEnqueuedAt = Number.NEGATIVE_INFINITY;
  }
}

export function timeDomainRms(samples: Uint8Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const sample of samples) {
    const normalized = (sample - 128) / 128;
    sum += normalized * normalized;
  }
  return Math.sqrt(sum / samples.length);
}
