import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PublicAppState } from '../../shared/ipc';
import { DEFAULT_ROLE_PACKAGE } from '../../shared/default-role';
import { DEFAULT_APP_SETTINGS, DEFAULT_MODEL_VIEWPORT, sanitizeAppSettings } from '../../shared/settings';
import { DEFAULT_PRESENTATION_SETTINGS } from '../../shared/presentation-contract';
import { SettingsHome } from './SettingsHome';
import { formatSemanticMappings, parseSemanticMappings, runtimeExpressionCommand, runtimeMotionCommand } from './SettingsDetailsV2';
import { SettingsDetailsV2 } from './SettingsDetailsV2';
import { isWindowIntent } from './settings-preview';
import { syncPetBoundsIntoSettings } from './settings-state';
import { SETTINGS_CARDS, type SettingsPageId } from './settings-schema';
import { THEME_TOKEN_KEYS, THEME_TOKENS } from '../../shared/theme';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const settingsCenterCss = readFileSync(resolve(testDirectory, 'settings-center.css'), 'utf8');
const rendererBootstrapSource = readFileSync(resolve(testDirectory, 'main.tsx'), 'utf8');
const settingsAppSource = readFileSync(resolve(testDirectory, 'App.tsx'), 'utf8');
const petAppSource = readFileSync(resolve(testDirectory, 'PetApp.tsx'), 'utf8');
const petStylesSource = readFileSync(resolve(testDirectory, 'styles.css'), 'utf8');
const live2dRuntimeSource = readFileSync(resolve(testDirectory, 'live2d-runtime.js'), 'utf8');
const mainProcessSource = readFileSync(resolve(testDirectory, '../../main/index.ts'), 'utf8');
const preloadSource = readFileSync(resolve(testDirectory, '../../preload/index.ts'), 'utf8');
const themeContractSource = readFileSync(resolve(testDirectory, '../../shared/theme.ts'), 'utf8');

const settingsState = {
  settings: DEFAULT_APP_SETTINGS,
  hasApiKey: true,
  role: DEFAULT_ROLE_PACKAGE,
  roles: [DEFAULT_ROLE_PACKAGE],
  live2d: {
    entryPath: null,
    directoryPath: null,
    selectionKind: null,
    status: 'not_configured',
    message: '尚未配置外部 Live2D 模型。',
    version: null,
    files: [],
    expressions: [],
    motions: [],
    editorAnimations: [],
    parameters: [],
    groups: [],
    physics: null,
    adapter: null,
    license: null,
    issues: [],
    warnings: []
  },
  live2dModels: [],
  companion: {
    roleId: DEFAULT_ROLE_PACKAGE.id,
    interactionCount: 4,
    affinity: 12,
    stageIndex: 0,
    stageLabel: '初识',
    memoryCount: 1
  },
  voices: []
} as unknown as PublicAppState;

function detailsProps(page: SettingsPageId): Parameters<typeof SettingsDetailsV2>[0] {
  return {
    state: settingsState,
    page,
    settingsDraft: DEFAULT_APP_SETTINGS,
    presentationDraft: DEFAULT_PRESENTATION_SETTINGS,
    roleDraft: DEFAULT_ROLE_PACKAGE,
    live2dPreview: null,
    debugMetrics: null,
    runtimeCapabilities: null,
    runtimeResult: null,
    displays: [],
    error: '',
    modelViewport: DEFAULT_MODEL_VIEWPORT,
    onBack: () => undefined,
    onResetPage: () => undefined,
    onSettingsChange: () => undefined,
    onPresentationChange: () => undefined,
    onRoleChange: () => undefined,
    onSaveRole: () => undefined,
    onActivateRole: () => undefined,
    onCreateBlankRole: () => undefined,
    onCloneRole: () => undefined,
    onDeleteRole: () => undefined,
    onImportRole: () => undefined,
    onExportRole: () => undefined,
    onChooseModel: () => undefined,
    onInspectModel: () => undefined,
    onSaveSettings: () => undefined,
    onSwitchModel: () => undefined,
    onRemoveModel: () => undefined,
    onViewportChange: () => undefined,
    onResetViewport: () => undefined,
    onCenterViewport: () => undefined,
    onFitViewport: () => undefined,
    onSendPresentation: () => undefined,
    onDebug: () => undefined,
    onRuntimeCommand: () => undefined,
    apiKeyDraft: '',
    onApiKeyChange: () => undefined,
    onSaveService: () => undefined,
    onClearApiKey: () => undefined
  };
}

describe('settings center components', () => {
  it('exposes exactly six focused top-level settings entries', () => {
    expect(SETTINGS_CARDS.map((card) => card.title)).toEqual([
      '陪伴对话',
      '人格与记忆',
      '角色模型',
      '语音',
      '服务与连接',
      '应用行为'
    ]);
  });

  it('renders the category-card home without a legacy menu or low-value controls', () => {
    const markup = renderToStaticMarkup(createElement(SettingsHome, { state: settingsState, presentation: DEFAULT_PRESENTATION_SETTINGS, onOpen: () => undefined }));
    expect(markup).toContain('aria-labelledby="settings-home-title"');
    expect(markup).toContain('人格与记忆');
    expect(markup).not.toContain('模型构图');
    expect(markup).not.toContain('窗口与交互');
    expect(markup).not.toContain('<nav');
  });

  it('keeps necessary model actions while hiding removed sliders and license confirmation', () => {
    const markup = renderToStaticMarkup(createElement(SettingsDetailsV2, detailsProps('model')));
    expect(markup).toContain('选文件');
    expect(markup).toContain('选目录');
    expect(markup).toContain('一键适配模型');
    expect(markup).toContain('一键恢复位置');
    expect(markup).toContain('运行清单与调试');
    expect(markup).not.toContain('表情与动作测试');
    expect(markup).not.toContain('data-testid="cubism-runtime-controls"');
    expect(markup).not.toContain('debug-button-grid');
    expect(markup.match(/运行清单与调试/g)?.length).toBe(1);
    expect(markup).not.toContain('模型缩放');
    expect(markup).not.toContain('模型 X 偏移');
    expect(markup).not.toContain('截取宽度');
    expect(markup).not.toContain('我确认拥有该外部模型');
  });

  it('builds test-area commands that preserve real model ids and motion coordinates', () => {
    expect(runtimeExpressionCommand('expression.native')).toEqual({ type: 'play_expression', expressionId: 'expression.native' });
    expect(runtimeMotionCommand('Gesture', 3, 'force')).toEqual({ type: 'play_motion', group: 'Gesture', index: 3, priority: 'force' });
  });

  it('keeps service controls and exposes a connection test with advanced settings collapsed', () => {
    const markup = renderToStaticMarkup(createElement(SettingsDetailsV2, detailsProps('service')));
    expect(markup).toContain('保存在线服务');
    expect(markup).toContain('测试连接');
    expect(markup).toContain('高级设置');
    expect(markup).toContain('<details');
    expect(markup).not.toContain('许可确认');
  });

  it('uses a glass listbox trigger instead of the native white dropdown surface', () => {
    const markup = renderToStaticMarkup(createElement(SettingsDetailsV2, detailsProps('personality')));
    expect(markup).toContain('class="glass-select-trigger"');
    expect(markup).toContain('aria-haspopup="listbox"');
    expect(markup).not.toContain('<select');
  });

  it('exposes follow-system, light and dark appearance choices in the behavior page', () => {
    const markup = renderToStaticMarkup(createElement(SettingsDetailsV2, detailsProps('behavior')));
    expect(markup).toContain('主题外观');
    expect(themeContractSource).toContain("'system'");
    expect(themeContractSource).toContain("'light'");
    expect(themeContractSource).toContain("'dark'");
    expect(settingsAppSource).toContain('applyThemeToDocument');
    expect(settingsAppSource).toContain('prefers-color-scheme: dark');
  });

  it('owns complete light/dark surface tokens and gives the dropdown an opaque layer', () => {
    expect(Object.keys(THEME_TOKENS.light)).toEqual(THEME_TOKEN_KEYS);
    expect(Object.keys(THEME_TOKENS.dark)).toEqual(THEME_TOKEN_KEYS);
    expect(settingsCenterCss).toContain('[data-theme="light"]');
    expect(settingsCenterCss).toContain('[data-theme="dark"]');
    expect(settingsCenterCss).toContain('background: var(--theme-menu-surface)');
    expect(settingsCenterCss).toContain('background: var(--theme-surface-selected)');
    expect(settingsCenterCss).toContain('scrollbar-color: var(--theme-scrollbar-thumb) var(--theme-scrollbar-track)');
    expect(settingsCenterCss).not.toContain('scrollbar-width: none');
    expect(settingsCenterCss).not.toContain('::-webkit-scrollbar { width: 0; height: 0; }');
    expect(settingsCenterCss).not.toContain('background: transparent;');
  });

  it('applies one token contract to every SettingsWindow surface, including future semantic controls', () => {
    const homeMarkup = renderToStaticMarkup(createElement(SettingsHome, { state: settingsState, presentation: DEFAULT_PRESENTATION_SETTINGS, onOpen: () => undefined }));
    expect(homeMarkup).toContain('class="settings-home"');
    for (const card of SETTINGS_CARDS) {
      const markup = renderToStaticMarkup(createElement(SettingsDetailsV2, detailsProps(card.id)));
      expect(markup).toContain('class="settings-details"');
    }

    expect(settingsCenterCss).toContain('body[data-window="settings"] .settings-center-shell :where(*)');
    expect(settingsCenterCss).toContain('body[data-window="settings"] .settings-center-shell :where(button, input, textarea, select, summary, [role="button"], [role="option"], [role="listbox"])');
    expect(settingsCenterCss).toContain('body[data-window="settings"] .settings-center-shell :where(input, textarea, select, [contenteditable="true"])');
    expect(settingsCenterCss).toContain('body[data-window="settings"] .settings-center-shell :where([role="dialog"], [role="listbox"], .glass-select-menu, .settings-panel, .settings-overlay)');
    expect(settingsCenterCss).toContain('body[data-window="settings"] .settings-center-shell :where(button:disabled, input:disabled, textarea:disabled, select:disabled, [aria-disabled="true"])');
    expect(settingsCenterCss).toContain('body[data-window="settings"] .settings-center-shell :where(*::-webkit-scrollbar-thumb)');
    for (const token of ['--theme-text', '--theme-muted', '--theme-control-surface', '--theme-menu-surface', '--theme-surface-selected', '--theme-disabled', '--theme-danger']) {
      expect(settingsCenterCss).toContain(token);
    }
  });

  it('keeps theme application and opaque surfaces strictly inside SettingsWindow', () => {
    const tokenBlock = settingsCenterCss.slice(settingsCenterCss.indexOf('/* Theme contract:'));
    expect(tokenBlock).not.toContain('.pet-shell');
    expect(tokenBlock).not.toContain('.live2d');
    expect(petAppSource).not.toContain('applyThemeToDocument');
    expect(petAppSource).not.toContain('data-theme');
    expect(petStylesSource).toContain('.pet-shell');
    expect(petStylesSource).toContain('background: transparent;');
    expect(mainProcessSource).toContain('transparent: true');
    expect(mainProcessSource).toContain("backgroundColor: '#00000000'");
    expect(mainProcessSource).toContain("petWindow.setBackgroundColor('#00000000')");
    expect(mainProcessSource).toContain('petWindow.setIgnoreMouseEvents(true)');
    expect(mainProcessSource).toContain('applyPetInputMode');
  });

  it('keeps the lock-to-adjust chain and Alt whole-window drag semantics intact', () => {
    const behaviorMarkup = renderToStaticMarkup(createElement(SettingsDetailsV2, detailsProps('behavior')));
    const behaviorReset = settingsAppSource.slice(settingsAppSource.indexOf("if (page === 'behavior')"), settingsAppSource.indexOf("if (page === 'service')"));
    expect(behaviorMarkup).not.toContain('锁定桌宠窗口');
    expect(behaviorMarkup).toContain('桌宠状态');
    expect(behaviorReset).not.toContain('petLocked');
    expect(behaviorReset).not.toContain('petInteractionMode');
    expect(mainProcessSource).toContain('if (next.petLocked && petModelEditMode)');
    expect(mainProcessSource).toContain('setPetModelEditMode(false);');
    expect(mainProcessSource).toContain('function togglePetModelEditMode()');
    expect(mainProcessSource).toContain("ipcMain.on('pet:toggle-model-edit'");
    expect(mainProcessSource).toContain("ipcMain.on('pet:drag-start'");
    expect(mainProcessSource).toContain("ipcMain.on('pet:resize-start'");
    expect(preloadSource).toContain('toggleModelEdit');
    expect(preloadSource).toContain('dragStart');
    expect(preloadSource).toContain('resizeStart');
    expect(petAppSource).toContain("operation: 'window-and-model-drag'");
    expect(petAppSource).toContain("operation: 'window-resize'");
    expect(petAppSource).toContain("operation: 'model-transform'");
    expect(petAppSource).toContain('if (event.altKey)');
    expect(petAppSource).toContain('window.baoyin.pet.dragStart');
    expect(petAppSource).toContain('window.baoyin.pet.resizeStart');
    expect(petAppSource).toContain('window.baoyin.pet.pointerCancel');
    expect(petStylesSource).toContain('.pet-shell .live2d-canvas');
    expect(petStylesSource).toContain('background: transparent;');
  });

  it('drives the continuous root outline from real SettingsWindow focus state', () => {
    expect(mainProcessSource).toContain("settingsWindow.on('focus'");
    expect(mainProcessSource).toContain("settingsWindow.on('blur'");
    expect(mainProcessSource).toContain("settingsWindow.on('show'");
    expect(mainProcessSource).toContain("settingsWindow.on('hide'");
    expect(mainProcessSource).toContain("settingsWindow.webContents.on('did-finish-load'");
    expect(mainProcessSource).toContain('isFocused() === true');
    expect(mainProcessSource).toContain("'settings:window-focus'");
    expect(preloadSource).toContain('onWindowFocusState');
    expect(preloadSource).toContain("'settings:window-focus'");
    expect(rendererBootstrapSource).toContain('dataset.windowActive');
    expect(settingsCenterCss).toContain('body[data-window="settings"] .app-shell.settings-center-shell');
    expect(settingsCenterCss).toContain('body[data-window-active="true"] .app-shell.settings-center-shell');
    expect(settingsCenterCss).toContain('body[data-window-active="false"] .app-shell.settings-center-shell');
    expect(settingsCenterCss).toContain('inset 0 0 0 1px rgba(124, 156, 196, .52)');
    expect(settingsCenterCss).toContain('border-radius: 22px');
    expect(settingsCenterCss).toContain('inset 0 0 0 1px rgba(124, 156, 196, .78)');
    expect(settingsCenterCss).not.toContain(':focus-within');
  });

  it('keeps capability requests on the current runtime identity and applies gaze preview to the consumer', () => {
    expect(mainProcessSource).toContain('cubismRuntimeSession.isReady');
    expect(mainProcessSource).toContain("settingsWindow?.webContents.send('cubism:runtime-ready'");
    expect(mainProcessSource).toContain("ipcMain.on('pet:runtime-command-ready'");
    expect(preloadSource).toContain('onRuntimeReady');
    expect(preloadSource).toContain('runtimeCommandReady');
    expect(settingsAppSource).toContain("runRuntimeCommand({ type: 'capabilities' })");
    expect(petAppSource).toContain('const effectiveSettings = { ...appState.settings, ...settingsPreview }');
    expect(petAppSource).toContain('window.baoyin.app.runtimeCommandReady()');
    expect(live2dRuntimeSource).toContain('installPhysicsGate');
    expect(live2dRuntimeSource).toContain('setPhysicsEnabled');
  });

  it('keeps legacy viewport and persisted settings readable after the UI hides them', () => {
    const restored = sanitizeAppSettings({
      ...DEFAULT_APP_SETTINGS,
      petScale: 1.3,
      petOffsetX: 18,
      petOffsetY: -12,
      modelViewportByModel: {
        'd:/models/baoyin.model3.json': {
          modelScale: 1.4,
          modelOffsetX: 24,
          modelOffsetY: -8,
          modelOpacity: 0.9,
          clipWidth: 0.75,
          clipHeight: 0.8,
          rotation: 0
        }
      }
    });
    expect(restored.petScale).toBe(1.3);
    expect(restored.petOffsetX).toBe(18);
    expect(restored.petOffsetY).toBe(-12);
    expect(restored.modelViewportByModel['d:/models/baoyin.model3.json']).toMatchObject({ modelScale: 1.4, modelOffsetX: 24, clipWidth: 0.75 });
  });

  it('round-trips editable semantic mappings', () => {
    const text = formatSemanticMappings(DEFAULT_ROLE_PACKAGE.presentation.semanticMappings);
    expect(parseSemanticMappings(text)).toEqual(DEFAULT_ROLE_PACKAGE.presentation.semanticMappings);
  });

  it('keeps window slider intent separate from model viewport changes', () => {
    expect(isWindowIntent({ petWindowOpacity: 0.7 })).toBe(true);
    expect(isWindowIntent({ modelViewportByModel: {} })).toBe(false);
  });

  it('syncs native window bounds before a clean settings save', () => {
    const next = syncPetBoundsIntoSettings({ ...DEFAULT_APP_SETTINGS, petBounds: { x: 1200, y: 200, width: 432, height: 600 } }, { x: 638, y: 210, width: 432, height: 600 });
    expect(next.petBounds).toEqual({ x: 638, y: 210, width: 432, height: 600 });
  });
});
