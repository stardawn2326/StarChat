import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'index.ts'), 'utf8');
const packageJson = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../package.json'), 'utf8')) as {
  devDependencies?: { electron?: string };
};

describe('Windows transparent pet shell', () => {
  it('pins the transparent-shell runtime to the isolated Electron regression baseline', () => {
    expect(packageJson.devDependencies?.electron).toBe('34.3.3');
  });

  it('keeps the transparent shell rectangular without a stale native shape region', () => {
    const creation = source.slice(source.indexOf('function createPetWindow'), source.indexOf('function createSettingsWindow'));
    expect(creation).toContain('thickFrame: false');
    expect(creation).toContain('roundedCorners: false');
    expect(creation).toContain('autoHideMenuBar: true');
    expect(creation).not.toContain("backgroundMaterial: 'none'");
    expect(creation).not.toContain("titleBarStyle: 'hidden'");
    expect(creation).not.toContain('accentColor: false');
    expect(creation).toContain('titleBarOverlay: false');
    expect(creation).toContain('restorePetBounds();');
    expect(source).not.toContain('function syncPetWindowShape');
    expect(source).not.toContain('setShape(');
  });

  it('keeps native shape synchronization out of the resize hot path', () => {
    const resizeListener = source.slice(source.indexOf("petWindow.on('resize'"), source.indexOf("petWindow.on('blur'"));
    const resizeMove = source.slice(source.indexOf("ipcMain.on('pet:resize-move'"), source.indexOf("ipcMain.on('pet:resize-end'"));
    expect(source).not.toContain('function schedulePetWindowShapeSync');
    expect(resizeListener).not.toContain('setShape');
    expect(resizeMove).not.toContain('setShape');
    expect(resizeMove).toContain('sameWindowBounds');
    expect(source).toContain("ipcMain.on('pet:resize-end'");
    expect(source).not.toContain('function syncPetWindowShape');
    expect(source).not.toContain('setShape(');
  });

  it('does not use opacity or backdrop mutation as a blur workaround', () => {
    const blurHandler = source.slice(source.indexOf("petWindow.on('blur'"), source.indexOf("petWindow.on('close'"));
    expect(blurHandler).not.toContain('petWindow.setOpacity');
    expect(blurHandler).not.toContain('setTimeout');
    expect(blurHandler).not.toContain('setBackgroundMaterial');
    expect(blurHandler).not.toContain('setAlwaysOnTop');
    expect(blurHandler).not.toContain('focus()');
  });

  it('neutralizes non-client chrome on the settings window as well', () => {
    const creation = source.slice(source.indexOf('function createSettingsWindow'), source.indexOf('function arrangeInteractionTestWindow'));
    expect(creation).toContain("title: ''");
    expect(creation).toContain('thickFrame: false');
    expect(creation).toContain('roundedCorners: false');
    expect(creation).toContain('autoHideMenuBar: true');
    expect(creation).not.toContain("backgroundMaterial: 'none'");
    expect(creation).toContain('titleBarOverlay: false');
    expect(creation).toContain("settingsWindow.setTitle('')");
    expect(creation).toContain('settingsWindow.setMenuBarVisibility(false)');
    expect(creation).toContain("settingsWindow.setBackgroundColor('#00000000')");
    expect(creation).not.toContain("settingsWindow.setBackgroundMaterial('none')");
    expect(creation).not.toContain("titleBarStyle: 'hidden'");
  });

  it('keeps the pet hidden until the renderer reports a stable runtime frame', () => {
    const readyHandler = source.slice(source.indexOf("petWindow.once('ready-to-show'"), source.indexOf("petWindow.on('move'"));
    expect(readyHandler).toContain('maybeShowPetWindow');
    expect(readyHandler).not.toContain('petWindow?.show()');
    expect(source).toContain("ipcMain.on('pet:runtime-ready'");
    expect(source).toContain('showPetWindowInactive');
  });

  it('does not reapply always-on-top from a blur handler or focus the transparent pet', () => {
    const blurHandler = source.slice(source.indexOf("petWindow.on('blur'"), source.indexOf("petWindow.on('close'"));
    expect(blurHandler).not.toContain('setAlwaysOnTop');
    expect(source).not.toContain('petWindow?.focus()');
    expect(source).toContain('petWindow?.showInactive()');
  });

  it('does not repeat native activation and shape work for an interaction-only settings save', () => {
    const applySettings = source.slice(source.indexOf('function applyPetWindowSettings'), source.indexOf('function showPetWindowInactive'));
    expect(applySettings).toContain('previousSettings');
    expect(applySettings).not.toContain('syncPetWindowResizable();');
    expect(applySettings).toContain('settings.alwaysOnTop !== previousSettings.alwaysOnTop');
    expect(applySettings).toContain('settings.petWindowOpacity !== previousSettings.petWindowOpacity');
  });

  it('does not reshape the transparent pet merely because it lost focus', () => {
    const blurCancellation = source.slice(source.indexOf('function cancelPetPointerTransactions'), source.indexOf('function createPetWindow'));
    expect(blurCancellation).not.toContain('syncPetWindowResizable();');
  });

  it('does not forward passthrough mouse messages through the native pet window', () => {
    expect(source).not.toContain('{ forward: true }');
  });

  it('keeps the pet non-focusable while leaving the settings window focusable', () => {
    const petCreation = source.slice(source.indexOf('function createPetWindow'), source.indexOf('function createSettingsWindow'));
    const settingsCreation = source.slice(source.indexOf('function createSettingsWindow'), source.indexOf('function arrangeInteractionTestWindow'));
    expect(petCreation).toContain('focusable: false');
    expect(settingsCreation).not.toContain('focusable: false');
  });

  it('does not expose recentering from the tray or pet context menu', () => {
    const tray = source.slice(source.indexOf('function createTray'), source.indexOf('function registerSettingsShortcut'));
    const petMenu = source.slice(source.indexOf('function showPetContextMenu'), source.indexOf('function normalizeHistory'));
    expect(tray).not.toContain('桌宠回中');
    expect(petMenu).not.toContain('桌宠回中');
  });

  it('keeps the pet visibility action available from the model context menu', () => {
    const petMenu = source.slice(source.indexOf('function showPetContextMenu'), source.indexOf('function normalizeHistory'));
    expect(petMenu).toContain("visible ? '隐藏桌宠' : '显示桌宠'");
  });

  it('keeps the tray menu limited to the four requested actions', () => {
    const tray = source.slice(source.indexOf('function createTray'), source.indexOf('function registerSettingsShortcut'));
    expect(tray).toContain("{ label: '打开设置'");
    expect(tray).toContain("{ label: '调整窗口'");
    expect(tray).toContain("{ label: '显示桌宠'");
    expect(tray).toContain("{ label: '退出应用'");
    expect(tray).not.toContain('开启/关闭桌宠交互');
    expect(tray).not.toContain('显示/隐藏桌宠');
    expect(tray).not.toContain('退出白音');
    expect(tray).not.toContain("type: 'separator'");
  });

  it('keeps the pet context menu on the requested lock, visibility, and exit actions', () => {
    const petMenu = source.slice(source.indexOf('function showPetContextMenu'), source.indexOf('function normalizeHistory'));
    expect(petMenu).toContain("locked ? '解锁窗口' : '锁定窗口'");
    expect(petMenu).toContain("visible ? '隐藏桌宠' : '显示桌宠'");
    expect(petMenu).toContain("{ label: '退出应用'");
    expect(petMenu).not.toContain('开启桌宠交互');
    expect(petMenu).not.toContain('关闭交互并锁定');
    expect(petMenu).not.toContain('显示/隐藏桌宠');
    expect(petMenu).not.toContain('退出白音');
    expect(petMenu).not.toContain("type: 'separator'");
  });

  it('does not opt the transparent pet into Electron toolbar appearance', () => {
    const creation = source.slice(source.indexOf('function createPetWindow'), source.indexOf('function createSettingsWindow'));
    expect(creation).not.toContain("type: 'toolbar'");
    expect(creation).toContain('autoHideMenuBar: true');
    expect(creation).toContain('skipTaskbar: true');
  });

  it('does not make the transparent pet HWND the native context-menu owner', () => {
    const petMenu = source.slice(source.indexOf('function showPetContextMenu'), source.indexOf('function normalizeHistory'));
    expect(petMenu).not.toContain('.popup({ window: petWindow })');
    expect(petMenu).toContain('.popup()');
  });
});
