import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const rendererDirectory = resolve(import.meta.dirname);
const stylesheet = readFileSync(resolve(rendererDirectory, 'workbench/workbench.css'), 'utf8');
const consoleSource = readFileSync(resolve(rendererDirectory, 'AgentConsole.tsx'), 'utf8');
const chatSource = readFileSync(resolve(rendererDirectory, 'CompanionChat.tsx'), 'utf8');
const screenshotSource = readFileSync(resolve(rendererDirectory, 'WorkbenchScreenshot.tsx'), 'utf8');

describe('StarChat final reference polish contract', () => {
  it('keeps typography light and precise at the reference scale', () => {
    expect(stylesheet).toContain('--wb-body-weight: 430');
    expect(stylesheet).toContain('--wb-heading-weight: 520');
    expect(stylesheet).toContain('.wb-brand-name { color: var(--theme-heading); font-size: 16px; font-weight: 520');
    expect(stylesheet).toContain('.wb-tool-card strong { color: var(--theme-heading); font-size: 16px; font-weight: 500');
    expect(stylesheet).toContain('.wb-terminal-prompt { display: flex; align-items: center; gap: 8px; color: var(--theme-heading); font: 15px/1.4 Consolas, monospace;');
  });

  it('uses fine dense stars and theme-specific light constellation decoration', () => {
    expect(stylesheet).toContain('0 .6px, transparent 1px');
    expect(stylesheet).toContain('background-size: 121px 97px');
    expect(stylesheet).toContain('[data-theme="dark"] .wb-sidebar::before { display: none;');
    expect(stylesheet).toContain('[data-theme="light"] .wb-sidebar::before {');
    expect(stylesheet).toContain('radial-gradient(520px circle at 88% 0%');
  });

  it('treats the character as a softened background and keeps the composer reference structure', () => {
    expect(stylesheet).toContain('[data-theme="dark"] .wb-character-art img { opacity: .38;');
    expect(stylesheet).toContain('[data-theme="light"] .wb-character-art img { opacity: .58;');
    expect(stylesheet).toContain('.wb-trajectory p { max-width: 330px;');
    expect(stylesheet).toContain('.agent-composer { min-height: 210px;');
    expect(chatSource).toContain('agent-attachment-code-preview');
    expect(chatSource).toContain('分销45秒');
    expect(chatSource).toContain('contextUsageOverride');
    expect(screenshotSource).toContain('contextUsageOverride={32}');
    expect(chatSource).toContain('剩余上下文');
  });

  it('keeps the rail and terminal glass layers legible without changing the passed animation contract', () => {
    expect(stylesheet).toContain('.wb-tool-card.is-disabled { cursor: not-allowed; opacity: .72;');
    expect(stylesheet).toContain('.wb-tool-card { display: flex; min-width: 0; min-height: 174px;');
    expect(stylesheet).toContain('.wb-terminal-tab, .wb-terminal-add, .wb-terminal-close { display: inline-flex; height: 30px;');
    expect(stylesheet).toContain('transition: --wb-sidebar-width 360ms cubic-bezier(.48, .38, .2, .98)');
  });
});
