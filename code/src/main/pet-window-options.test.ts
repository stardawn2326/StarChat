import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'index.ts'), 'utf8');

describe('Windows transparent pet shell', () => {
  it('removes the native thick frame and DWM corner from the frameless pet window', () => {
    const creation = source.slice(source.indexOf('function createPetWindow'), source.indexOf('function createSettingsWindow'));
    expect(creation).toContain('thickFrame: false');
    expect(creation).toContain('roundedCorners: false');
    expect(creation).toContain('autoHideMenuBar: false');
    expect(creation).toContain("backgroundMaterial: 'none'");
    expect(creation).not.toContain("titleBarStyle: 'hidden'");
    expect(creation).toContain('accentColor: false');
    expect(creation).toContain('titleBarOverlay: false');
    expect(creation).toContain("petWindow.setBackgroundMaterial('none')");
  });

  it('pins a transparent pet to a full native rectangle so DWM cannot paint an inactive non-client strip', () => {
    const creation = source.slice(source.indexOf('function createPetWindow'), source.indexOf('function createSettingsWindow'));
    expect(source).toContain('function syncPetWindowShape');
    expect(source).toContain('petWindow.setShape([{ x: 0, y: 0, width: bounds.width, height: bounds.height }])');
    expect(creation).toContain('syncPetWindowShape();');
  });

  it('does not opt the transparent pet into the Windows hidden-title-bar path', () => {
    const creation = source.slice(source.indexOf('function createPetWindow'), source.indexOf('function createSettingsWindow'));
    expect(creation).not.toContain('titleBarStyle:');
  });

  it('neutralizes non-client chrome on the settings window as well', () => {
    const creation = source.slice(source.indexOf('function createSettingsWindow'), source.indexOf('function arrangeInteractionTestWindow'));
    expect(creation).toContain("title: ''");
    expect(creation).toContain('thickFrame: false');
    expect(creation).toContain('roundedCorners: false');
    expect(creation).toContain('autoHideMenuBar: false');
    expect(creation).toContain("backgroundMaterial: 'none'");
    expect(creation).toContain('titleBarOverlay: false');
    expect(creation).toContain("settingsWindow.setTitle('')");
    expect(creation).toContain('settingsWindow.setMenuBarVisibility(false)');
    expect(creation).toContain("settingsWindow.setBackgroundColor('#00000000')");
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

  it('keeps the tray visibility action available from the model context menu', () => {
    const petMenu = source.slice(source.indexOf('function showPetContextMenu'), source.indexOf('function normalizeHistory'));
    expect(petMenu).toContain('显示/隐藏桌宠');
  });

  it('uses a Windows tool-window class for the transparent pet shell', () => {
    const creation = source.slice(source.indexOf('function createPetWindow'), source.indexOf('function createSettingsWindow'));
    expect(creation).toContain("type: 'toolbar'");
  });

  it('does not make the transparent pet HWND the native context-menu owner', () => {
    const petMenu = source.slice(source.indexOf('function showPetContextMenu'), source.indexOf('function normalizeHistory'));
    expect(petMenu).not.toContain('.popup({ window: petWindow })');
    expect(petMenu).toContain('.popup()');
  });
});
