export type ProceduralGestureName =
  | 'nod'
  | 'nod_twice'
  | 'shake_head'
  | 'tilt_confused'
  | 'emphasis'
  | 'thinking'
  | 'lean_forward'
  | 'greet'
  | 'look_away'
  | 'stretch'
  | 'surprised'
  | 'caring_smile'
  | 'bright_smile'
  | 'confused_blank'
  | 'worried'
  | 'annoyed'
  | 'anxious'
  | 'sleepy'
  | 'blush'
  | 'tsundere_pout';

export type ProceduralGestureValues = Record<string, number>;

function progressAt(elapsedMs: number, durationMs: number): number {
  if (!Number.isFinite(elapsedMs) || !Number.isFinite(durationMs) || durationMs <= 0) return 1;
  return Math.min(1, Math.max(0, elapsedMs / durationMs));
}

export function sampleProceduralGesture(
  name: ProceduralGestureName | string,
  elapsedMs: number,
  durationMs = 720
): ProceduralGestureValues {
  const progress = progressAt(elapsedMs, durationMs);
  const pulse = Math.sin(Math.PI * progress);
  const oscillation = Math.sin(Math.PI * 2 * progress);
  switch (name) {
    case 'nod':
    case 'thinking':
      return { head_y: -0.35 * pulse };
    case 'nod_twice':
      return { head_y: -0.28 * Math.sin(Math.PI * 4 * progress) * pulse };
    case 'shake_head':
    case 'look_away':
      return { head_x: 0.35 * oscillation };
    case 'tilt_confused':
    case 'confused_blank':
      return { head_z: 0.22 * pulse };
    case 'emphasis':
    case 'greet':
    case 'lean_forward':
      return { body_x: 0.18 * pulse, head_y: -0.12 * pulse };
    case 'stretch':
      return { body_y: -0.2 * pulse, head_z: 0.1 * pulse };
    case 'surprised':
      return { eye_open_l: pulse, eye_open_r: pulse, head_y: -0.08 * pulse };
    case 'caring_smile':
    case 'bright_smile':
      return { mouth_form: 0.35 * pulse };
    case 'worried':
    case 'anxious':
      return { head_z: -0.12 * pulse, mouth_form: -0.18 * pulse };
    case 'annoyed':
    case 'tsundere_pout':
      return { head_x: -0.16 * pulse, mouth_form: -0.3 * pulse };
    case 'sleepy':
      return { eye_open_l: 0.35 * pulse, eye_open_r: 0.35 * pulse };
    case 'blush':
      return { mouth_form: 0.12 * pulse };
    default:
      return {};
  }
}

export interface ProceduralGestureSample {
  values: ProceduralGestureValues;
  done: boolean;
}

export class ProceduralGestureTimeline {
  private token = 0;
  private active: { token: number; name: string; startedAt: number; durationMs: number } | null = null;

  start(name: string, startedAt: number, durationMs = 720): number {
    this.token += 1;
    this.active = {
      token: this.token,
      name,
      startedAt: Number.isFinite(startedAt) ? startedAt : 0,
      durationMs: Math.max(1, Number.isFinite(durationMs) ? durationMs : 720)
    };
    return this.token;
  }

  sample(token: number, now: number): ProceduralGestureSample | null {
    if (!this.active || token !== this.active.token) return null;
    const elapsed = Math.max(0, (Number.isFinite(now) ? now : this.active.startedAt) - this.active.startedAt);
    const done = elapsed >= this.active.durationMs;
    return {
      values: sampleProceduralGesture(this.active.name, elapsed, this.active.durationMs),
      done
    };
  }

  cancel(): void {
    this.token += 1;
    this.active = null;
  }
}
