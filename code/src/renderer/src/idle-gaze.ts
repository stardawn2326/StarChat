export interface IdleGazeTarget { x: number; y: number; }
export type IdleGazePhase = 'warmup' | 'random';

const smoothstep = (value: number): number => {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
};

export class IdleGazeController {
  private current: IdleGazeTarget = { x: 0, y: 0 };
  private from: IdleGazeTarget = { x: 0, y: 0 };
  private target: IdleGazeTarget = { x: 0, y: 0 };
  private transitionStartedAt = 0;
  private transitionDurationMs = 900;
  private nextChangeAt = 0;
  private warmupStartedAt: number | null = null;
  private warmupBase: IdleGazeTarget = { x: 0, y: 0 };
  private readonly warmupDurationMs = 3000;

  constructor(private readonly random: () => number = Math.random) {}

  begin(now: number): void {
    this.warmupStartedAt = Number.isFinite(now) ? now : Date.now();
    this.nextChangeAt = 0;
    this.warmupBase = { ...this.current };
    this.from = { ...this.current };
    this.target = { ...this.current };
  }

  phaseAt(now: number): IdleGazePhase {
    if (this.warmupStartedAt === null) return 'random';
    return now - this.warmupStartedAt < this.warmupDurationMs ? 'warmup' : 'random';
  }

  update(now: number, strength = 1): IdleGazeTarget {
    if (this.warmupStartedAt !== null && this.phaseAt(now) === 'warmup') {
      const elapsed = Math.max(0, now - this.warmupStartedAt);
      const fadeIn = Math.min(1, elapsed / 900);
      const warmupStrength = Math.min(1, Math.max(0.5, strength));
      const subtleX = Math.sin(elapsed / 850) * 0.08 * fadeIn * warmupStrength;
      const subtleY = Math.sin(elapsed / 1200 + 0.7) * 0.06 * fadeIn * warmupStrength;
      this.current = { x: this.warmupBase.x + subtleX, y: this.warmupBase.y + subtleY };
      return { ...this.current };
    }
    if (this.nextChangeAt === 0 || now >= this.nextChangeAt) {
      this.from = { ...this.current };
      this.target = {
        x: (-0.75 + this.random() * 1.5) * strength,
        y: (-0.75 + this.random() * 1.5) * strength
      };
      this.transitionStartedAt = now;
      this.transitionDurationMs = 800 + this.random() * 1000;
      this.nextChangeAt = now + this.transitionDurationMs + 900 + this.random() * 2600;
    }
    const t = smoothstep((now - this.transitionStartedAt) / this.transitionDurationMs);
    this.current = {
      x: this.from.x + (this.target.x - this.from.x) * t,
      y: this.from.y + (this.target.y - this.from.y) * t
    };
    return { ...this.current };
  }

  reset(): void {
    this.current = { x: 0, y: 0 };
    this.from = { x: 0, y: 0 };
    this.target = { x: 0, y: 0 };
    this.nextChangeAt = 0;
    this.warmupStartedAt = null;
    this.warmupBase = { x: 0, y: 0 };
  }
}
