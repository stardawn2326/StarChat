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
  bodyFollowStrength: 0.45,
  bodyLag: 0.22,
  inertiaStrength: 0.18,
  idleSwayStrength: 0.035,
  physicsEnabled: true
};

export const PRESENTATION_SLIDERS: readonly PresentationSliderDefinition[] = [
  { key: 'bodyFollowStrength', label: '全身跟随强度', description: '身体跟随视线/动作意图的幅度；不直接写入 Cubism 参数。', min: 0, max: 1, step: 0.01, defaultValue: 0.45 },
  { key: 'bodyLag', label: '身体跟随延迟', description: '身体跟随目标时的缓动延迟；数值越高越慢。', min: 0.05, max: 1.5, step: 0.01, defaultValue: 0.22 },
  { key: 'inertiaStrength', label: '惯性强度', description: '传入 Focus/Physics 链路的惯性意图；不直接写入 Physics 输出。', min: 0, max: 5, step: 0.01, defaultValue: 0.18 },
  { key: 'idleSwayStrength', label: '空闲摇摆强度', description: '无输入时的轻微身体摇摆；不会改变窗口位置。', min: 0, max: 0.15, step: 0.005, defaultValue: 0.035 }
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
