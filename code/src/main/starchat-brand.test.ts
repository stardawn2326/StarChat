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

describe('StarChat visible brand boundary', () => {
  it('uses StarChat in package metadata and the Windows-facing product name', () => {
    expect(packageJson.name).toBe('starchat');
    expect(packageJson.description).toContain('StarChat');
    expect(packageJson.build.productName).toBe('StarChat');
    expect(packageJson.build.appId).toBe('com.baoyin.aiassistant');
    expect(`StarChat ${packageJson.version}.exe`).toBe('StarChat 0.2.1.exe');
  });

  it('removes the old application brand from user-visible shell sources without renaming compatibility identifiers', () => {
    for (const source of [mainSource, rendererSource, appSource, homeSource]) {
      expect(source).not.toContain('白音 AI 助手');
      expect(source).not.toContain('白音AI助手');
      expect(source).not.toContain('配置中心');
    }
    expect(mainSource).toContain('tray.setToolTip(\'StarChat');
    expect(mainSource).toContain("label: '打开 StarChat 工作台'");
    expect(rendererSource).toContain("document.title = role === 'pet' ? '' : 'StarChat'");
    expect(appSource).toContain('StarChat');
    expect(mainSource).toContain('com.baoyin.aiassistant');
    expect(mainSource).toContain("'baoyin:settings-preview'");
    expect(appSource).toContain('window.baoyin');
    expect(appSource).toContain("role.id === 'baoyin.default'");
  });
});
