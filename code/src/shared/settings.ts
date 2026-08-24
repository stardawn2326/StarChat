import { DEFAULT_PRESENTATION_SETTINGS, sanitizePresentationSettings, type PresentationSettings } from './presentation-contract';
import { normalizePetInteractionSettings } from './pet-interaction';

export interface AppSettings {
  apiBaseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  alwaysOnTop: boolean;
  live2dModelPath: string | null;
  petLocked: boolean;
  petScale: number;
  petOffsetX: number;
  petOffsetY: number;
  petDisplayId: number | null;
  settingsShortcut: string;
  petBounds: { x: number; y: number; width: number; height: number } | null;
  cursorTrackingEnabled: boolean;
  cursorEyeWeight: number;
  cursorHeadWeight: number;
  cursorBodyWeight: number;
  petInteractionMode: boolean;
  live2dShowWatermark: boolean;
  modelViewportByModel: Record<string, ModelViewportSettings>;
  activeRoleId: string;
  petWindowOpacity: number;
  petHoverBorderOpacity: number;
  petHoverShowDelayMs: number;
  petHoverFadeMs: number;
  cursorSmoothing: number;
  cursorMaxStep: number;
  cursorRangeX: number;
  cursorRangeY: number;
  cursorIdleMotion: number;
  presentation: PresentationSettings;
  ttsProvider: 'cosyvoice';
  ttsRate: number;
  ttsVolume: number;
  cosyVoiceBaseUrl: string;
  cosyVoiceSpeaker: string;
  cosyVoiceMode: 'sft' | 'zero-shot';
  activeVoiceProfileId: string | null;
}

export interface ModelViewportSettings {
  modelOffsetX: number;
  modelOffsetY: number;
  modelScale: number;
  modelOpacity: number;
  clipWidth: number;
  clipHeight: number;
  rotation: 0;
}

export const DEFAULT_MODEL_VIEWPORT: ModelViewportSettings = {
  modelOffsetX: 0,
  modelOffsetY: 0,
  modelScale: 1,
  modelOpacity: 1,
  clipWidth: 1,
  clipHeight: 1,
  rotation: 0
};

export interface SensitiveSettings {
  apiKey: string;
}

export const LEGACY_DEFAULT_CURSOR_BODY_WEIGHT = 0.08;
export const INTERMEDIATE_CURSOR_BODY_WEIGHT = 0.32;
export const DEFAULT_CURSOR_BODY_WEIGHT = 0.72;

export const DEFAULT_APP_SETTINGS: AppSettings = {
  apiBaseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  temperature: 0.7,
  maxTokens: 800,
  systemPrompt: '',
  alwaysOnTop: true,
  live2dModelPath: null,
  petLocked: false,
  petScale: 1,
  petOffsetX: 0,
  petOffsetY: 0,
  petDisplayId: null,
  settingsShortcut: 'CommandOrControl+Shift+B',
  petBounds: null,
  cursorTrackingEnabled: true,
  cursorEyeWeight: 1,
  cursorHeadWeight: 0.35,
  cursorBodyWeight: DEFAULT_CURSOR_BODY_WEIGHT,
  petInteractionMode: true,
  live2dShowWatermark: true,
  modelViewportByModel: {},
  activeRoleId: 'baoyin.default',
  petWindowOpacity: 1,
  petHoverBorderOpacity: 0.8,
  petHoverShowDelayMs: 80,
  petHoverFadeMs: 420,
  cursorSmoothing: 0.22,
  cursorMaxStep: 0.08,
  cursorRangeX: 1,
  cursorRangeY: 1,
  cursorIdleMotion: 0.035,
  presentation: DEFAULT_PRESENTATION_SETTINGS,
  ttsProvider: 'cosyvoice',
  ttsRate: 1,
  ttsVolume: 1,
  cosyVoiceBaseUrl: 'http://127.0.0.1:50000',
  cosyVoiceSpeaker: '中文女',
  cosyVoiceMode: 'sft',
  activeVoiceProfileId: null
};

function isKnownPrivateMikuPath(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  const normalized = value.trim().replaceAll('\\', '/').toLocaleLowerCase();
  return normalized.endsWith('/miku/miku.model3.json') || normalized.endsWith('/miku');
}

export function normalizeModelViewportKey(path: string | null | undefined): string | null {
  if (!path || !path.trim()) {
    return null;
  }
  return path.trim().replaceAll('\\', '/').toLocaleLowerCase();
}

export function sanitizeModelViewport(input: Partial<ModelViewportSettings> | null | undefined): ModelViewportSettings {
  const modelOffsetX = Number(input?.modelOffsetX);
  const modelOffsetY = Number(input?.modelOffsetY);
  const modelScale = Number(input?.modelScale);
  return {
    modelOffsetX: Number.isFinite(modelOffsetX) ? Math.min(2400, Math.max(-2400, Math.round(modelOffsetX))) : DEFAULT_MODEL_VIEWPORT.modelOffsetX,
    modelOffsetY: Number.isFinite(modelOffsetY) ? Math.min(2400, Math.max(-2400, Math.round(modelOffsetY))) : DEFAULT_MODEL_VIEWPORT.modelOffsetY,
    modelScale: Number.isFinite(modelScale) ? Math.min(2.4, Math.max(0.55, modelScale)) : DEFAULT_MODEL_VIEWPORT.modelScale,
    modelOpacity: Number.isFinite(Number(input?.modelOpacity)) ? Math.min(1, Math.max(0.1, Number(input?.modelOpacity))) : DEFAULT_MODEL_VIEWPORT.modelOpacity,
    clipWidth: Number.isFinite(Number(input?.clipWidth)) ? Math.min(1, Math.max(0.2, Number(input?.clipWidth))) : DEFAULT_MODEL_VIEWPORT.clipWidth,
    clipHeight: Number.isFinite(Number(input?.clipHeight)) ? Math.min(1, Math.max(0.2, Number(input?.clipHeight))) : DEFAULT_MODEL_VIEWPORT.clipHeight,
    rotation: 0
  };
}

export function modelViewportForPath(settings: AppSettings, path: string | null | undefined): ModelViewportSettings {
  const key = normalizeModelViewportKey(path);
  return key ? settings.modelViewportByModel[key] ?? DEFAULT_MODEL_VIEWPORT : DEFAULT_MODEL_VIEWPORT;
}

function sanitizeModelViewportMap(input: unknown): Record<string, ModelViewportSettings> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }
  const result: Record<string, ModelViewportSettings> = {};
  for (const [key, value] of Object.entries(input)) {
    const normalizedKey = normalizeModelViewportKey(key);
    if (normalizedKey && value && typeof value === 'object' && !Array.isArray(value)) {
      result[normalizedKey] = sanitizeModelViewport(value as Partial<ModelViewportSettings>);
    }
  }
  return result;
}

export function sanitizeAppSettings(input: Partial<AppSettings>): AppSettings {
  const temperature = Number(input.temperature);
  const maxTokens = Number(input.maxTokens);
  const petScale = Number(input.petScale);
  const petOffsetX = Number(input.petOffsetX);
  const petOffsetY = Number(input.petOffsetY);
  const cursorEyeWeight = Number(input.cursorEyeWeight);
  const cursorHeadWeight = Number(input.cursorHeadWeight);
  const cursorBodyWeight = Number(input.cursorBodyWeight);
  const cursorSmoothing = Number(input.cursorSmoothing);
  const cursorMaxStep = Number(input.cursorMaxStep);
  const cursorRangeX = Number(input.cursorRangeX);
  const cursorRangeY = Number(input.cursorRangeY);
  const cursorIdleMotion = Number(input.cursorIdleMotion);
  const petWindowOpacity = Number(input.petWindowOpacity);
  const petHoverBorderOpacity = Number(input.petHoverBorderOpacity);
  const petHoverShowDelayMs = Number(input.petHoverShowDelayMs);
  const petHoverFadeMs = Number(input.petHoverFadeMs);
  const ttsRate = Number(input.ttsRate);
  const ttsVolume = Number(input.ttsVolume);
  const defaultShowWatermark = isKnownPrivateMikuPath(input.live2dModelPath) ? false : DEFAULT_APP_SETTINGS.live2dShowWatermark;
  const interaction = normalizePetInteractionSettings(input);
  const modelViewportByModel = sanitizeModelViewportMap(input.modelViewportByModel);
  const bounds = input.petBounds;
  const petBounds =
    bounds &&
    Number.isFinite(bounds.x) &&
    Number.isFinite(bounds.y) &&
    Number.isFinite(bounds.width) &&
    Number.isFinite(bounds.height)
      ? {
          x: Math.round(bounds.x),
          y: Math.round(bounds.y),
          // The main process clamps these to the selected display work area.
          // Keep storage display-agnostic so slider and native bounds cannot
          // disagree on high-resolution displays.
          width: Math.round(Math.min(8192, Math.max(240, bounds.width))),
          height: Math.round(Math.min(8192, Math.max(240, bounds.height)))
        }
      : DEFAULT_APP_SETTINGS.petBounds;
  return {
    apiBaseUrl:
      typeof input.apiBaseUrl === 'string' && input.apiBaseUrl.trim()
        ? input.apiBaseUrl.trim().replace(/\/+$/, '')
        : DEFAULT_APP_SETTINGS.apiBaseUrl,
    model:
      typeof input.model === 'string' && input.model.trim()
        ? input.model.trim()
        : DEFAULT_APP_SETTINGS.model,
    temperature: Number.isFinite(temperature)
      ? Math.min(2, Math.max(0, temperature))
      : DEFAULT_APP_SETTINGS.temperature,
    maxTokens: Number.isFinite(maxTokens)
      ? Math.min(8192, Math.max(64, Math.round(maxTokens)))
      : DEFAULT_APP_SETTINGS.maxTokens,
    systemPrompt: typeof input.systemPrompt === 'string' ? input.systemPrompt.trim() : '',
    alwaysOnTop: input.alwaysOnTop !== false,
    live2dModelPath:
      typeof input.live2dModelPath === 'string' && input.live2dModelPath.trim()
        ? input.live2dModelPath.trim()
        : null,
    petLocked: interaction.petLocked,
    petScale: Number.isFinite(petScale) ? Math.min(1.8, Math.max(0.6, petScale)) : DEFAULT_APP_SETTINGS.petScale,
    petOffsetX: Number.isFinite(petOffsetX) ? Math.min(240, Math.max(-240, Math.round(petOffsetX))) : DEFAULT_APP_SETTINGS.petOffsetX,
    petOffsetY: Number.isFinite(petOffsetY) ? Math.min(240, Math.max(-240, Math.round(petOffsetY))) : DEFAULT_APP_SETTINGS.petOffsetY,
    petDisplayId: Number.isInteger(input.petDisplayId) ? input.petDisplayId ?? null : null,
    settingsShortcut:
      typeof input.settingsShortcut === 'string' && input.settingsShortcut.trim()
        ? input.settingsShortcut.trim()
        : DEFAULT_APP_SETTINGS.settingsShortcut,
    petBounds,
    cursorTrackingEnabled: input.cursorTrackingEnabled !== false,
    cursorEyeWeight: Number.isFinite(cursorEyeWeight) ? Math.min(1, Math.max(0, cursorEyeWeight)) : DEFAULT_APP_SETTINGS.cursorEyeWeight,
    cursorHeadWeight: Number.isFinite(cursorHeadWeight) ? Math.min(1, Math.max(0, cursorHeadWeight)) : DEFAULT_APP_SETTINGS.cursorHeadWeight,
    cursorBodyWeight: Number.isFinite(cursorBodyWeight) ? Math.min(1, Math.max(0, cursorBodyWeight)) : DEFAULT_APP_SETTINGS.cursorBodyWeight,
    petInteractionMode: interaction.petInteractionMode,
    live2dShowWatermark:
      typeof input.live2dShowWatermark === 'boolean' ? input.live2dShowWatermark : defaultShowWatermark,
    modelViewportByModel,
    activeRoleId:
      typeof input.activeRoleId === 'string' && input.activeRoleId.trim()
        ? input.activeRoleId.trim()
        : DEFAULT_APP_SETTINGS.activeRoleId,
    petWindowOpacity: Number.isFinite(petWindowOpacity) ? Math.min(1, Math.max(0.25, petWindowOpacity)) : DEFAULT_APP_SETTINGS.petWindowOpacity,
    petHoverBorderOpacity: Number.isFinite(petHoverBorderOpacity) ? Math.min(1, Math.max(0, petHoverBorderOpacity)) : DEFAULT_APP_SETTINGS.petHoverBorderOpacity,
    petHoverShowDelayMs: Number.isFinite(petHoverShowDelayMs) ? Math.min(2000, Math.max(0, Math.round(petHoverShowDelayMs))) : DEFAULT_APP_SETTINGS.petHoverShowDelayMs,
    petHoverFadeMs: Number.isFinite(petHoverFadeMs) ? Math.min(4000, Math.max(100, Math.round(petHoverFadeMs))) : DEFAULT_APP_SETTINGS.petHoverFadeMs,
    cursorSmoothing: Number.isFinite(cursorSmoothing) ? Math.min(1, Math.max(0.02, cursorSmoothing)) : DEFAULT_APP_SETTINGS.cursorSmoothing,
    cursorMaxStep: Number.isFinite(cursorMaxStep) ? Math.min(0.4, Math.max(0.005, cursorMaxStep)) : DEFAULT_APP_SETTINGS.cursorMaxStep,
    cursorRangeX: Number.isFinite(cursorRangeX) ? Math.min(1, Math.max(0.1, cursorRangeX)) : DEFAULT_APP_SETTINGS.cursorRangeX,
    cursorRangeY: Number.isFinite(cursorRangeY) ? Math.min(1, Math.max(0.1, cursorRangeY)) : DEFAULT_APP_SETTINGS.cursorRangeY,
    cursorIdleMotion: Number.isFinite(cursorIdleMotion) ? Math.min(0.15, Math.max(0, cursorIdleMotion)) : DEFAULT_APP_SETTINGS.cursorIdleMotion,
    presentation: sanitizePresentationSettings(input.presentation),
    ttsProvider: 'cosyvoice',
    ttsRate: Number.isFinite(ttsRate) ? Math.min(2, Math.max(0.5, ttsRate)) : DEFAULT_APP_SETTINGS.ttsRate,
    ttsVolume: Number.isFinite(ttsVolume) ? Math.min(1, Math.max(0, ttsVolume)) : DEFAULT_APP_SETTINGS.ttsVolume,
    cosyVoiceBaseUrl:
      typeof input.cosyVoiceBaseUrl === 'string' && input.cosyVoiceBaseUrl.trim()
        ? input.cosyVoiceBaseUrl.trim().replace(/\/+$/, '')
        : DEFAULT_APP_SETTINGS.cosyVoiceBaseUrl,
    cosyVoiceSpeaker:
      typeof input.cosyVoiceSpeaker === 'string' && input.cosyVoiceSpeaker.trim()
        ? input.cosyVoiceSpeaker.trim()
        : DEFAULT_APP_SETTINGS.cosyVoiceSpeaker,
    cosyVoiceMode: input.cosyVoiceMode === 'zero-shot' ? 'zero-shot' : 'sft',
    activeVoiceProfileId:
      typeof input.activeVoiceProfileId === 'string' && input.activeVoiceProfileId.trim()
        ? input.activeVoiceProfileId.trim()
        : null
  };
}

export function maskApiKey(hasApiKey: boolean): string {
  return hasApiKey ? '已保存（密钥不会回传到界面）' : '未设置';
}
