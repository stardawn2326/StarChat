import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const rendererDirectory = resolve(import.meta.dirname);
const appSource = readFileSync(resolve(rendererDirectory, 'App.tsx'), 'utf8');
const consoleSource = readFileSync(resolve(rendererDirectory, 'AgentConsole.tsx'), 'utf8');
const chatSource = readFileSync(resolve(rendererDirectory, 'CompanionChat.tsx'), 'utf8');
const detailsSource = readFileSync(resolve(rendererDirectory, 'SettingsDetailsV2.tsx'), 'utf8');
const mainSource = readFileSync(resolve(rendererDirectory, '../../main/index.ts'), 'utf8');
const rendererBootstrapSource = readFileSync(resolve(rendererDirectory, 'main.tsx'), 'utf8');
const glassSelectSource = readFileSync(resolve(rendererDirectory, 'GlassSelect.tsx'), 'utf8');
const sharedRendererStyles = readFileSync(resolve(rendererDirectory, 'styles.css'), 'utf8');
const stylesheet = readFileSync(resolve(rendererDirectory, 'settings-center.css'), 'utf8');

function settingsCssWithoutDataUri(): string {
  return stylesheet.replace(/url\("data:[^"]+"\)/giu, 'url("data-uri")');
}

describe('StarChat Agent workbench integration boundary', () => {
  it('owns the Agent task subscription in App and passes one synchronized projection to every console route', () => {
    expect(appSource.match(/window\.baoyin\.agent\.onEvent/g) ?? []).toHaveLength(1);
    expect(chatSource).not.toContain('window.baoyin.agent.onEvent');
    expect(chatSource).not.toContain('window.baoyin.agent.list()');
    expect(chatSource).not.toContain('window.baoyin.agent.get(');
    expect(consoleSource).toContain('agentTasks');
    expect(consoleSource).toContain('agentEvent');
    expect(detailsSource).toContain('agentTasks');
    expect(detailsSource).toContain('agentEvent');
  });

  it('keeps the embedded workbench on the shared Live2D and presentation boundary', () => {
    expect(consoleSource).toContain("import { Live2DCanvas } from './Live2DCanvas';");
    expect(consoleSource).toContain('window.baoyin.presentation.onEvent');
    expect(rendererBootstrapSource).toContain("if (role === 'pet' || role === 'settings')");
    expect(mainSource).toContain("if (sourceWindow !== settingsWindow || !isSafePresentationEvent(payload))");
    expect(mainSource).toContain("settingsWindow.webContents.send('presentation:event', payload)");
  });

  it('keeps every SettingsWindow color declaration on shared theme tokens', () => {
    const rawColorDeclaration = /(?:color|background(?:-color)?|border(?:-[a-z-]+)?|outline(?:-color)?|box-shadow|text-shadow|accent-color|scrollbar-color)\s*:[^;{}]*(?:#[0-9a-f]{3,8}|rgba?\(|hsla?\()/iu;
    expect(settingsCssWithoutDataUri()).not.toMatch(rawColorDeclaration);
    expect(stylesheet).toContain('body[data-window="settings"] .boot-error-root { background: var(--theme-window-bg);');
    expect(stylesheet).toContain('body[data-window="settings"] .boot-error-panel span { color: var(--theme-muted);');
  });

  it('returns keyboard focus to the GlassSelect trigger when Tab closes its listbox', () => {
    expect(glassSelectSource).toMatch(/if \(event\.key === 'Tab'\) \{\s+closeMenu\(true\);/u);
  });

  it('keeps retired configuration-center selectors out of the shared PetWindow stylesheet', () => {
    for (const selector of ['chat-card', 'settings-panel', 'settings-overlay', 'settings-runtime-state', 'settings-subheading', 'live2d-import-status', 'priority-list', 'metric-json']) {
      expect(sharedRendererStyles).not.toMatch(new RegExp(`\\.${selector}(?:[\\s.{:#\\[])`, 'u'));
    }
  });
});
