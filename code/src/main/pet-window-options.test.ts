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
    expect(creation).toContain('titleBarOverlay: false');
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
});
