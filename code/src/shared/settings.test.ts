import { describe, expect, it } from 'vitest';
import { DEFAULT_MODEL_VIEWPORT, modelViewportForPath, sanitizeAppSettings } from './settings';

describe('settings sanitization', () => {
  it('clamps numeric settings and normalizes the endpoint', () => {
    const settings = sanitizeAppSettings({
      apiBaseUrl: 'https://example.test/v1///',
      temperature: 4,
      maxTokens: 10,
      alwaysOnTop: false
    });
    expect(settings.apiBaseUrl).toBe('https://example.test/v1');
    expect(settings.temperature).toBe(2);
    expect(settings.maxTokens).toBe(64);
    expect(settings.alwaysOnTop).toBe(false);
  });

  it('keeps cursor gaze defaults configurable but bounded', () => {
    const settings = sanitizeAppSettings({
      cursorTrackingEnabled: false,
      cursorEyeWeight: 2,
      cursorHeadWeight: -1,
      cursorBodyWeight: 0.25
    });
    expect(settings.cursorTrackingEnabled).toBe(false);
    expect(settings.cursorEyeWeight).toBe(1);
    expect(settings.cursorHeadWeight).toBe(0);
    expect(settings.cursorBodyWeight).toBe(0.25);
  });

  it('keeps explicit pet interaction opt-in by default', () => {
    expect(sanitizeAppSettings({}).petInteractionMode).toBe(false);
    expect(sanitizeAppSettings({ petInteractionMode: true }).petInteractionMode).toBe(true);
  });

  it('uses CosyVoice as the only speech provider', () => {
    const defaults = sanitizeAppSettings({});
    expect(defaults.ttsProvider).toBe('cosyvoice');
    expect(defaults.cosyVoiceBaseUrl).toBe('http://127.0.0.1:50000');
    expect(defaults.cosyVoiceSpeaker).toBe('中文女');
    expect(defaults.cosyVoiceMode).toBe('sft');
    expect(defaults.activeVoiceProfileId).toBeNull();

    const legacySystem = sanitizeAppSettings({ ttsProvider: 'system' } as never);
    expect(legacySystem.ttsProvider).toBe('cosyvoice');

    const cosy = sanitizeAppSettings({
      ttsProvider: 'cosyvoice',
      ttsRate: 9,
      ttsVolume: -1,
      cosyVoiceBaseUrl: 'http://127.0.0.1:50000///',
      cosyVoiceSpeaker: '  中文女  '
    });
    expect(cosy.ttsProvider).toBe('cosyvoice');
    expect(cosy.ttsRate).toBe(2);
    expect(cosy.ttsVolume).toBe(0);
    expect(cosy.cosyVoiceBaseUrl).toBe('http://127.0.0.1:50000');
    expect(cosy.cosyVoiceSpeaker).toBe('中文女');
  });

  it('keeps CosyVoice2 custom voice selection explicit and persistent', () => {
    const settings = sanitizeAppSettings({
      cosyVoiceMode: 'zero-shot',
      activeVoiceProfileId: ' voice.demo '
    });
    expect(settings.cosyVoiceMode).toBe('zero-shot');
    expect(settings.activeVoiceProfileId).toBe('voice.demo');
    expect(sanitizeAppSettings({ cosyVoiceMode: 'unknown' as never }).cosyVoiceMode).toBe('sft');
  });

  it('uses a private Miku-only watermark default while keeping the setting reversible', () => {
    expect(sanitizeAppSettings({}).live2dShowWatermark).toBe(true);
    expect(sanitizeAppSettings({ live2dModelPath: 'D:\\BaiduNetdiskDownload\\miku\\miku\\miku.model3.json' }).live2dShowWatermark).toBe(false);
    expect(
      sanitizeAppSettings({
        live2dModelPath: 'D:\\BaiduNetdiskDownload\\miku\\miku\\miku.model3.json',
        live2dShowWatermark: true
      }).live2dShowWatermark
    ).toBe(true);
  });

  it('keeps model viewport transforms isolated by normalized external model path', () => {
    const settings = sanitizeAppSettings({
      live2dModelPath: 'D:\\BaiduNetdiskDownload\\miku\\miku\\miku.model3.json',
      modelViewportByModel: {
        'D:\\BaiduNetdiskDownload\\miku\\miku\\miku.model3.json': {
          modelOffsetX: 999,
          modelOffsetY: -999,
          modelScale: 4,
          modelOpacity: 1,
          clipWidth: 1,
          clipHeight: 1,
          rotation: 0
        }
      }
    });
    expect(modelViewportForPath(settings, 'd:/baidunetdiskdownload/miku/miku/miku.model3.json')).toEqual({
        modelOffsetX: 999,
        modelOffsetY: -999,
        modelScale: 2.4,
        modelOpacity: 1,
        clipWidth: 1,
        clipHeight: 1,
        rotation: 0
    });
    expect(modelViewportForPath(settings, 'C:/other/model.model3.json')).toEqual(DEFAULT_MODEL_VIEWPORT);
  });
});
