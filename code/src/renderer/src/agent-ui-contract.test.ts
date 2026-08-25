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
});
