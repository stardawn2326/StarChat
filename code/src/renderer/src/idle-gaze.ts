export interface IdleGazeTarget { x: number; y: number; }

export class IdleGazeController {
  private target: IdleGazeTarget = { x: 0, y: 0 };
  private nextChangeAt = 0;

  constructor(private readonly random: () => number = Math.random) {}

  update(now: number): IdleGazeTarget {
    if (now >= this.nextChangeAt) {
      this.target = {
        x: -0.5 + this.random(),
        y: -0.35 + this.random() * 0.6
      };
      this.nextChangeAt = now + 1500 + this.random() * 3000;
    }
    return this.target;
  }

  reset(): void { this.nextChangeAt = 0; }
}
