export type CursorFollowMode = 'following' | 'holding' | 'released';

export interface CursorFollowDecision {
  mode: CursorFollowMode;
  release: boolean;
}

export class CursorFollowGate {
  private lastMovementAt: number | null = null;
  private released = false;

  constructor(private readonly idleAfterMs = 3000) {}

  update(moving: boolean, timestamp: number): CursorFollowDecision {
    const now = Number.isFinite(timestamp) ? timestamp : Date.now();
    if (moving || this.lastMovementAt === null) {
      this.lastMovementAt = now;
      this.released = false;
      return { mode: 'following', release: false };
    }
    if (now - this.lastMovementAt < this.idleAfterMs) {
      return { mode: 'holding', release: false };
    }
    if (!this.released) {
      this.released = true;
      return { mode: 'released', release: true };
    }
    return { mode: 'released', release: false };
  }

  reset(): void {
    this.lastMovementAt = null;
    this.released = false;
  }
}
