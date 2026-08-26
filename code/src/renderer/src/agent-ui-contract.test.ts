import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Agent settings/chat UI contract', () => {
  it('offers mode switching, status/step summaries, cancellation, approval and input continuation', () => {
    const source = readFileSync(resolve(import.meta.dirname, 'CompanionChat.tsx'), 'utf8');
    for (const token of ['assistantMode', '对话路由模式', 'agentTask', '当前步骤', 'window.baoyin.agent.cancel', 'window.baoyin.agent.approve', 'window.baoyin.agent.respond', 'waiting_for_approval', 'waiting_for_input']) {
      expect(source).toContain(token);
    }
  });

  it('connects the mode control to persisted settings without touching the pet renderer', () => {
    const details = readFileSync(resolve(import.meta.dirname, 'SettingsDetailsV2.tsx'), 'utf8');
    const pet = readFileSync(resolve(import.meta.dirname, 'PetApp.tsx'), 'utf8');
    expect(details).toContain('onModeChange');
    expect(details).toContain('assistantMode');
    expect(pet).not.toMatch(/agent|AgentTask|agent:event|agent:start/i);
  });

  it('uses the themed glass listbox instead of the native white conversation dropdown', () => {
    const source = readFileSync(resolve(import.meta.dirname, 'CompanionChat.tsx'), 'utf8');
    const details = readFileSync(resolve(import.meta.dirname, 'SettingsDetailsV2.tsx'), 'utf8');
    const glassSelect = readFileSync(resolve(import.meta.dirname, 'GlassSelect.tsx'), 'utf8');
    const stylesheet = readFileSync(resolve(import.meta.dirname, 'settings-center.css'), 'utf8');
    expect(source).toContain('<GlassSelect');
    expect(source).toContain('<label htmlFor="assistant-mode">处理模式</label>');
    expect(source).not.toContain('<select');
    expect(source).not.toContain('<option');
    expect(details).toContain("import { GlassSelect } from './GlassSelect'");
    expect(source).toContain("import { GlassSelect } from './GlassSelect'");
    expect(glassSelect).toContain('aria-haspopup="listbox"');
    expect(glassSelect).toContain('id?: string');
    expect(glassSelect).toContain('aria-activedescendant={activeOptionId}');
    for (const key of ['Enter', 'ArrowDown', 'ArrowUp', 'Home', 'End', 'Escape']) {
      expect(glassSelect).toContain(`event.key === '${key}'`);
    }
    expect(stylesheet).toContain('body[data-window="settings"] .companion-route-control { color: var(--theme-text)');
    expect(stylesheet).toContain('body[data-window="settings"] .companion-route-control > label { color: var(--theme-muted)');
    expect(stylesheet).toContain('border: 1px solid var(--theme-border)');
    expect(stylesheet).toContain('background: var(--theme-control-surface)');
  });
});
