export type IdlePresentationPhase = 'paused' | 'warmup' | 'ready';

export interface IdlePresentationDecision {
  phase: IdlePresentationPhase;
  startLargeAction: boolean;
}

const paused = (): IdlePresentationDecision => ({ phase: 'paused', startLargeAction: false });

/**
 * Schedules resource-backed idle motion only after a subtle warmup. The gate
 * owns timing, not model parameters, so it cannot compete with Cubism's
 * native update owner or the semantic fallback writer.
 */
export class IdlePresentationGate {
  private armedAt: number | null = null;
  private largeActionStarted = false;

  constructor(private readonly warmupMs = 3000) {}

  arm(timestamp: number): IdlePresentationDecision {
    this.armedAt = Number.isFinite(timestamp) ? timestamp : Date.now();
    this.largeActionStarted = false;
    return { phase: 'warmup', startLargeAction: false };
  }

  update(timestamp: number): IdlePresentationDecision {
    if (this.armedAt === null) return paused();
    const now = Number.isFinite(timestamp) ? timestamp : Date.now();
    if (now - this.armedAt < this.warmupMs) {
      return { phase: 'warmup', startLargeAction: false };
    }
    if (!this.largeActionStarted) {
      this.largeActionStarted = true;
      return { phase: 'ready', startLargeAction: true };
    }
    return { phase: 'ready', startLargeAction: false };
  }

  pause(): void {
    this.armedAt = null;
    this.largeActionStarted = false;
  }

  reset(): void {
    this.pause();
  }
}
