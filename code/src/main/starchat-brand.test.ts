import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const codeDirectory = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(resolve(codeDirectory, '../../package.json'), 'utf8')) as {
  name: string;
  version: string;
  description: string;
  build: { appId: string; productName: string };
};
const mainSource = readFileSync(resolve(codeDirectory, 'index.ts'), 'utf8');
const rendererSource = readFileSync(resolve(codeDirectory, '../renderer/src/main.tsx'), 'utf8');
const appSource = readFileSync(resolve(codeDirectory, '../renderer/src/App.tsx'), 'utf8');
const homeSource = readFileSync(resolve(codeDirectory, '../renderer/src/SettingsHome.tsx'), 'utf8');
const preloadSource = readFileSync(resolve(codeDirectory, '../preload/index.ts'), 'utf8');
const rendererTypesSource = readFileSync(resolve(codeDirectory, '../renderer/src/window.d.ts'), 'utf8');
const presentationStorageSource = readFileSync(resolve(codeDirectory, '../renderer/src/presentation-storage.ts'), 'utf8');
const defaultRoleSource = readFileSync(resolve(codeDirectory, '../shared/default-role.ts'), 'utf8');

describe('StarChat visible brand boundary', () => {
  it('uses StarChat in package metadata and the Windows-facing product name', () => {
    expect(packageJson.name).toBe('starchat');
    expect(packageJson.description).toContain('StarChat');
    expect(packageJson.build.productName).toBe('StarChat');
    expect(packageJson.build.appId).toBe('com.starchat.desktop');
    expect(`StarChat ${packageJson.version}.exe`).toBe('StarChat 0.2.1.exe');
  });

  it('uses StarChat as the active application namespace', () => {
    for (const source of [rendererSource, appSource, homeSource]) {
      expect(source).not.toContain('白音 AI 助手');
      expect(source).not.toContain('白音AI助手');
      expect(source).not.toContain('配置中心');
    }
    expect(mainSource.match(/白音 AI 助手/g) ?? []).toHaveLength(1);
    expect(mainSource.match(/白音AI助手/g) ?? []).toHaveLength(1);
    expect(mainSource).toContain('migrateLegacyStarChatData');
    expect(mainSource).toContain('tray.setToolTip(\'StarChat');
    expect(mainSource).toContain("label: '放回工作台'");
    expect(rendererSource).toContain("document.title = role === 'pet' ? '' : 'StarChat'");
    expect(appSource).toContain('StarChat');
    expect(mainSource).toContain('com.starchat.desktop');
    expect(mainSource).toContain("'starchat:settings-preview'");
    expect(mainSource).not.toContain('BAOYIN_');
    expect(preloadSource).toContain("exposeInMainWorld('starchat'");
    expect(preloadSource).toContain('export type StarChatBridge');
    expect(preloadSource).not.toContain("exposeInMainWorld('baoyin'");
    expect(rendererTypesSource).toContain('starchat: {');
    expect(appSource).toContain('window.starchat');
    expect(appSource).not.toContain('window.baoyin');
    expect(rendererSource).toContain('dataset.starchatWindow');
    expect(rendererSource).not.toContain('dataset.baoyinWindow');
  });

  it('uses a neutral StarChat default role while keeping Baoyin as a selectable role package', () => {
    expect(defaultRoleSource).toContain("starchat.role.json");
    expect(defaultRoleSource).toContain("baoyin.role.json");
    expect(defaultRoleSource).toContain('BUILTIN_ROLE_PACKAGES');
    expect(appSource).toContain('isBuiltinRoleId(role.id)');
  });

  it('migrates the old renderer storage key without keeping it as the active key', () => {
    expect(presentationStorageSource).toContain("'starchat.presentation-settings.v1'");
    expect(presentationStorageSource).toContain("'baoyin.presentation-settings.v1'");
    expect(presentationStorageSource).toContain('removeItem');
  });

  it('keeps startup failure copy on the StarChat brand while preserving role identity elsewhere', () => {
    expect(rendererSource).toContain("role === 'pet' ? 'StarChat 桌宠模型启动失败' : 'StarChat 界面启动失败'");
    expect(rendererSource).not.toContain('白音模型启动失败');
    expect(rendererSource).not.toContain('白音界面启动失败');
  });
});
