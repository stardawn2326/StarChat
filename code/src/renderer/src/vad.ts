export interface BasicVadOptions {
  silenceMs?: number;
}

export class BasicVad {
  private readonly silenceMs: number;
  private active = false;
  private lastVoiceAt = 0;

  constructor(options: BasicVadOptions = {}) {
    this.silenceMs = Math.max(250, Math.round(options.silenceMs ?? 1400));
  }

  start(now = Date.now()): void {
    this.active = true;
    this.lastVoiceAt = now;
  }

  markVoice(now = Date.now()): void {
    if (this.active) this.lastVoiceAt = now;
  }

  tick(now = Date.now()): boolean {
    return this.active && now - this.lastVoiceAt >= this.silenceMs;
  }

  stop(): void {
    this.active = false;
    this.lastVoiceAt = 0;
  }

  isActive(): boolean {
    return this.active;
  }
}
