export interface PresentationSettings {
  bodyFollowStrength: number;
  bodyLag: number;
  inertiaStrength: number;
  idleSwayStrength: number;
  physicsEnabled: boolean;
}

export type PresentationSliderKey = Exclude<keyof PresentationSettings, 'physicsEnabled'>;

export interface PresentationSliderDefinition {
  key: PresentationSliderKey;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  unit?: string;
}

export const DEFAULT_PRESENTATION_SETTINGS: PresentationSettings = {
  bodyFollowStrength: 0.82,
  bodyLag: 0.32,
  inertiaStrength: 0.72,
  idleSwayStrength: 0.06,
  physicsEnabled: true
};

export const PRESENTATION_SLIDERS: readonly PresentationSliderDefinition[] = [
  { key: 'bodyFollowStrength', label: '全身跟随强度', description: '身体跟随视线/动作意图的幅度；由包级 Focus 链统一写入。', min: 0, max: 1, step: 0.01, defaultValue: 0.82 },
  { key: 'bodyLag', label: '身体跟随延迟', description: '身体相对眼睛和头部的弹性延迟；数值越高越慢。', min: 0.05, max: 1.5, step: 0.01, defaultValue: 0.32 },
  { key: 'inertiaStrength', label: '惯性强度', description: '控制身体弹簧的回弹和超调，继续由包级 Focus/Physics 链处理。', min: 0, max: 5, step: 0.01, defaultValue: 0.72 },
  { key: 'idleSwayStrength', label: '空闲摇摆强度', description: '光标静止释放后仍保留的身体自由摇摆；不会改变窗口位置。', min: 0, max: 0.15, step: 0.005, defaultValue: 0.06 }
];

export function sanitizePresentationSettings(input: Partial<PresentationSettings> | null | undefined): PresentationSettings {
  const result = { ...DEFAULT_PRESENTATION_SETTINGS };
  for (const definition of PRESENTATION_SLIDERS) {
    const value = Number(input?.[definition.key]);
    result[definition.key] = Number.isFinite(value)
      ? Math.min(definition.max, Math.max(definition.min, value))
      : definition.defaultValue;
  }
  result.physicsEnabled = input?.physicsEnabled !== false;
  return result;
}

export function resetPresentationSetting(key: keyof PresentationSettings): Partial<PresentationSettings> {
  if (key === 'physicsEnabled') return { physicsEnabled: DEFAULT_PRESENTATION_SETTINGS.physicsEnabled };
  const definition = PRESENTATION_SLIDERS.find((item) => item.key === key);
  return definition ? { [key]: definition.defaultValue } : {};
}

export function presentationSummary(settings: PresentationSettings): string {
  const parts: string[] = [];
  if (settings.bodyFollowStrength > 0) parts.push('全身跟随');
  if (settings.physicsEnabled) parts.push('物理已启用');
  return parts.length > 0 ? parts.join(' · ') : '全身跟随关闭 · 物理已关闭';
}
