import { BrowserWindow, type WebContents } from 'electron';

export type IpcWindowRole = 'settings' | 'pet';

export interface IpcWindowRegistry {
  settingsWindow: BrowserWindow | null;
  petWindow: BrowserWindow | null;
}

export function windowForSender(sender: WebContents, windows: IpcWindowRegistry): BrowserWindow | null {
  const source = BrowserWindow.fromWebContents(sender);
  if (!source || source.isDestroyed()) return null;
  return source === windows.settingsWindow || source === windows.petWindow ? source : null;
}

export function requireIpcWindow(sender: WebContents, role: IpcWindowRole, windows: IpcWindowRegistry): BrowserWindow {
  const source = windowForSender(sender, windows);
  const expected = role === 'settings' ? windows.settingsWindow : windows.petWindow;
  if (!source || !expected || source !== expected) throw new Error(`只有${role === 'settings' ? '工作台' : '桌宠'}窗口可以执行此操作`);
  return source;
}

export function isIpcWindow(sender: WebContents, role: IpcWindowRole, windows: IpcWindowRegistry): boolean {
  const source = windowForSender(sender, windows);
  return source !== null && source === (role === 'settings' ? windows.settingsWindow : windows.petWindow);
}
