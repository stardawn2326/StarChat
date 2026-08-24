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
  });

  it('neutralizes non-client chrome on the settings window as well', () => {
    const creation = source.slice(source.indexOf('function createSettingsWindow'), source.indexOf('function arrangeInteractionTestWindow'));
    expect(creation).toContain("title: ''");
    expect(creation).toContain('thickFrame: false');
    expect(creation).toContain('roundedCorners: false');
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

  it('only changes always-on-top when the persisted setting differs from the current shell state', () => {
    const applySettings = source.slice(source.indexOf('function applyPetWindowSettings'), source.indexOf('function showPetWindowInactive'));
    expect(applySettings).toContain('petWindow.isAlwaysOnTop()');
  });

  it('uses the pet context menu to restore pet defaults instead of recentering', () => {
    const contextMenu = source.slice(source.indexOf('function showPetContextMenu'), source.indexOf('function normalizeHistory'));
    expect(contextMenu).toContain("label: '全部回到默认'");
    expect(contextMenu).toContain('resetPetDefaults');
    expect(contextMenu).not.toContain('桌宠回中');
  });

  it('keeps the tray context menu aligned with the pet default reset action', () => {
    const trayMenu = source.slice(source.indexOf('function createTray'), source.indexOf('function registerSettingsShortcut'));
    expect(trayMenu).toContain("label: '全部回到默认'");
    expect(trayMenu).toContain('resetPetDefaults');
    expect(trayMenu).not.toContain('桌宠回中');
  });

  it('does not reapply always-on-top from the pet show IPC path', () => {
    const showHandler = source.slice(source.indexOf("ipcMain.on('pet:show'"), source.indexOf("ipcMain.on('pet:center'"));
    expect(showHandler).toContain('showPetWindowInactive');
    expect(showHandler).not.toContain('setAlwaysOnTop');
  });
});
