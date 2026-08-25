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

function gestureIntensity(value: number): number {
  return Math.min(2, Math.max(0.5, Number.isFinite(value) ? value : 1));
}

function roundGestureValue(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function sampleProceduralGesture(
  name: ProceduralGestureName | string,
  elapsedMs: number,
  durationMs = 720,
  intensity = 1
): ProceduralGestureValues {
  const progress = progressAt(elapsedMs, durationMs);
  const pulse = Math.sin(Math.PI * progress);
  const oscillation = Math.sin(Math.PI * 2 * progress);
  const scale = gestureIntensity(intensity);
  let values: ProceduralGestureValues;
  switch (name) {
    case 'nod':
    case 'thinking':
      values = { head_y: -0.35 * pulse };
      break;
    case 'nod_twice':
      values = { head_y: -0.28 * Math.sin(Math.PI * 4 * progress) * pulse };
      break;
    case 'shake_head':
    case 'look_away':
      values = { head_x: 0.35 * oscillation };
      break;
    case 'tilt_confused':
    case 'confused_blank':
      values = { head_z: 0.22 * pulse };
      break;
    case 'emphasis':
    case 'greet':
    case 'lean_forward':
      values = { body_x: 0.18 * pulse, head_y: -0.12 * pulse };
      break;
    case 'stretch':
      values = { body_y: -0.2 * pulse, head_z: 0.1 * pulse };
      break;
    case 'surprised':
      values = { eye_open_l: pulse, eye_open_r: pulse, head_y: -0.08 * pulse };
      break;
    case 'caring_smile':
    case 'bright_smile':
      values = { mouth_form: 0.35 * pulse };
      break;
    case 'worried':
    case 'anxious':
      values = { head_z: -0.12 * pulse, mouth_form: -0.18 * pulse };
      break;
    case 'annoyed':
    case 'tsundere_pout':
      values = { head_x: -0.16 * pulse, mouth_form: -0.3 * pulse };
      break;
    case 'sleepy':
      values = { eye_open_l: 0.35 * pulse, eye_open_r: 0.35 * pulse };
      break;
    case 'blush':
      values = { mouth_form: 0.12 * pulse };
      break;
    default:
      values = {};
  }
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, roundGestureValue(value * scale)]));
}

export interface ProceduralGestureSample {
  values: ProceduralGestureValues;
  done: boolean;
}

export class ProceduralGestureTimeline {
  private token = 0;
  private active: { token: number; name: string; startedAt: number; durationMs: number; intensity: number } | null = null;

  start(name: string, startedAt: number, durationMs = 720, intensity = 1): number {
    this.token += 1;
    this.active = {
      token: this.token,
      name,
      startedAt: Number.isFinite(startedAt) ? startedAt : 0,
      durationMs: Math.max(1, Number.isFinite(durationMs) ? durationMs : 720),
      intensity: gestureIntensity(intensity)
    };
    return this.token;
  }

  sample(token: number, now: number): ProceduralGestureSample | null {
    if (!this.active || token !== this.active.token) return null;
    const elapsed = Math.max(0, (Number.isFinite(now) ? now : this.active.startedAt) - this.active.startedAt);
    const done = elapsed >= this.active.durationMs;
    return {
      values: sampleProceduralGesture(this.active.name, elapsed, this.active.durationMs, this.active.intensity),
      done
    };
  }

  cancel(): void {
    this.token += 1;
    this.active = null;
  }
}
