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

  it('keeps custom workbench chrome while retaining the native resize frame', () => {
    const creation = source.slice(source.indexOf('function createSettingsWindow'), source.indexOf('function arrangeInteractionTestWindow'));
    expect(creation).toContain("title: ''");
    expect(creation).toContain('thickFrame: true');
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

  it('selects an adaptive first-launch size and restores persisted bounds', () => {
    const creation = source.slice(source.indexOf('function createSettingsWindow'), source.indexOf('function arrangeInteractionTestWindow'));
    expect(creation).toContain('resolveWorkbenchWindowState');
    expect(creation).toContain('readWorkbenchWindowState');
    expect(creation).toContain('...restoredWindowState.bounds');
    expect(creation).toContain('resizable: true');
    expect(creation).toContain('maximizable: true');
    expect(creation).not.toContain('width: 1900');
    expect(creation).not.toContain('height: 1200');
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

  it('keeps the visibility toggle available from the pet context menu', () => {
    const petMenu = source.slice(source.indexOf('function buildPetMenu'), source.indexOf('function normalizeHistory'));
    expect(petMenu).toContain("{ label: '显示/隐藏桌宠'");
    expect(petMenu).not.toContain("visible ? '隐藏桌宠' : '显示桌宠'");
  });

  it('keeps the tray menu identical to the pet menu with fixed slash labels', () => {
    const tray = source.slice(source.indexOf('function createTray'), source.indexOf('function registerSettingsShortcut'));
    const menu = source.slice(source.indexOf('function buildPetMenu'), source.indexOf('function registerSettingsShortcut'));
    const labels = [...menu.matchAll(/\{ label: '([^']+)'/g)].map((match) => match[1]);
    expect(labels).toEqual(['放回工作台', '解锁/锁定桌宠', '显示/隐藏桌宠', '退出应用']);
    expect(menu.match(/type: 'separator'/g)).toHaveLength(1);
    expect(menu).toContain('tray.setContextMenu(buildPetMenu())');
    expect(source).toContain('function togglePetMenuLock()');
    expect(source).toContain('function togglePetMenuVisibility()');
    expect(menu).not.toContain('解锁桌宠窗口');
    expect(menu).not.toContain('显示桌宠');
    expect(menu).not.toContain('退出白音');
    expect(menu.indexOf("type: 'separator'")).toBeLessThan(menu.indexOf("label: '退出应用'"));
    expect(menu).toContain('click: returnPetToWorkbench');
  });

  it('uses the same fixed-label menu and opposite-state actions for pet right click', () => {
    const petMenu = source.slice(source.indexOf('function showPetContextMenu'), source.indexOf('function normalizeHistory'));
    expect(petMenu).toContain('const menu = buildPetMenu();');
    expect(petMenu).toContain('menu.popup({ window: menuOwner ?? undefined });');
    const lockToggle = source.slice(source.indexOf('function togglePetMenuLock'), source.indexOf('function togglePetMenuVisibility'));
    const visibilityToggle = source.slice(source.indexOf('function togglePetMenuVisibility'), source.indexOf('function buildPetMenu'));
    expect(lockToggle).toContain('if (petInteractionEnabled(getStore().readSettings()))');
    expect(lockToggle).toContain('lockPetWindow();');
    expect(lockToggle).toContain('unlockPetWindowForAdjustment();');
    expect(visibilityToggle).toContain('if (petWindow?.isVisible())');
    expect(visibilityToggle).toContain('petWindow.hide();');
    expect(visibilityToggle).toContain('showPetWindowInactive();');
    expect(source).toContain('setWorkbenchCharacterVisible(true);');
  });

  it('keeps explicit lock and visibility actions state-aware', () => {
    const unlockAction = source.slice(source.indexOf('function unlockPetWindowForAdjustment'), source.indexOf('function lockPetWindow'));
    const lockAction = source.slice(source.indexOf('function lockPetWindow'), source.indexOf('function startCursorPolling'));
    expect(unlockAction).toContain('getStore().save(petInteractionSettingsForEnabled(true));');
    expect(unlockAction).toContain('setPetModelEditMode(true);');
    expect(unlockAction).not.toContain('togglePet');
    expect(lockAction).toContain('getStore().save(petInteractionSettingsForEnabled(false));');
    expect(lockAction).toContain('setPetModelEditMode(false);');
    expect(lockAction).not.toContain('togglePet');
  });

  it('does not opt the transparent pet into Electron toolbar appearance', () => {
    const creation = source.slice(source.indexOf('function createPetWindow'), source.indexOf('function createSettingsWindow'));
    expect(creation).not.toContain("type: 'toolbar'");
    expect(creation).toContain('autoHideMenuBar: true');
    expect(creation).toContain('skipTaskbar: true');
  });

  it('uses a non-pet native context-menu owner for outside-click dismissal', () => {
    const petMenu = source.slice(source.indexOf('function showPetContextMenu'), source.indexOf('function normalizeHistory'));
    expect(petMenu).not.toContain('.popup({ window: petWindow })');
    expect(petMenu).toContain('menu.popup({ window: menuOwner ?? undefined });');
  });

  it('tracks the native pet menu and closes it through its lifecycle without focusing the pet', () => {
    const petMenu = source.slice(source.indexOf('function showPetContextMenu'), source.indexOf('function normalizeHistory'));
    expect(source).toContain('let activePetContextMenu: { menu: Menu; owner: BrowserWindow | null } | null = null;');
    expect(source).toContain('function closePetContextMenu(): void');
    expect(source).toContain('active.menu.closePopup(active.owner ?? undefined);');
    expect(petMenu).toContain("menu.once('menu-will-close'");
    expect(petMenu).toContain('menu.popup({ window: menuOwner ?? undefined });');
    expect(petMenu).not.toContain('window: petWindow');
  });

  it('routes window blur and app shutdown through the explicit menu close path', () => {
    const petWindowCreation = source.slice(source.indexOf('function createPetWindow'), source.indexOf('function createSettingsWindow'));
    const settingsWindowCreation = source.slice(source.indexOf('function createSettingsWindow'), source.indexOf('function arrangeInteractionTestWindow'));
    const beforeQuit = source.slice(source.indexOf("app.on('before-quit'"));
    expect(petWindowCreation).toContain('closePetContextMenu();');
    expect(settingsWindowCreation).toContain('closePetContextMenu();');
    expect(source).toContain("app.on('browser-window-blur'");
    expect(beforeQuit).toContain('closePetContextMenu();');
  });
});
