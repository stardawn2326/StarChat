import { describe, expect, it } from 'vitest';
import { DEFAULT_ROLE_PACKAGE } from './default-role';
import { createPersonalityRequestSnapshot } from './personality-contract';
import { buildCompanionSystemPrompt, companionSummary, createCompanionState, presentationForAssistantText, recordCompanionExchange } from './companion';

describe('companion relationship, memory and presentation contract', () => {
  const snapshot = createPersonalityRequestSnapshot(DEFAULT_ROLE_PACKAGE, 1);

  it('grows the relationship gradually and remembers explicit user facts without duplicates', () => {
    const initial = createCompanionState(snapshot.roleId, 1);
    const first = recordCompanionExchange(initial, snapshot, '我喜欢紫色，也喜欢安静的音乐。', '知道了。', 2);
    const second = recordCompanionExchange(first, snapshot, '我喜欢紫色，也喜欢安静的音乐。', '不会忘。', 3);
    expect(first.interactionCount).toBe(1);
    expect(first.affinity).toBeGreaterThan(0);
    expect(first.affinity).toBeLessThan(10);
    expect(second.memories).toHaveLength(1);
    expect(companionSummary(second, snapshot.relationshipStages).stageIndex).toBe(0);
  });

  it('injects only the current relationship stage and saved memories into a request prompt', () => {
    const state = recordCompanionExchange(createCompanionState(snapshot.roleId), snapshot, '我叫小明。', '记住了。', 4);
    const prompt = buildCompanionSystemPrompt(snapshot, state);
    expect(prompt).toContain(snapshot.systemPrompt);
    expect(prompt).toContain('我叫小明');
    expect(prompt).toContain('不得突然越级');
    expect(prompt).not.toContain('API Key');
  });

  it('maps assistant meaning through the role whitelist instead of arbitrary Cubism parameters', () => {
    const events = presentationForAssistantText('这件事我不能答应。', snapshot.semanticMappings);
    expect(events).toContainEqual({ type: 'expression', name: 'annoyed', source: 'assistant', layer: 'dialogue_emotion' });
    expect(events).toContainEqual({ type: 'action', name: 'shake_head', source: 'assistant', layer: 'reply_state' });
  });

  it('covers shy, tsundere, anxious and sleepy dialogue with semantic fallbacks', () => {
    expect(presentationForAssistantText('才、才不是特意关心你。', snapshot.semanticMappings)[0]).toMatchObject({ name: 'tsundere_pout' });
    expect(presentationForAssistantText('有点不好意思，别一直看我。', snapshot.semanticMappings)[0]).toMatchObject({ name: 'blush' });
    expect(presentationForAssistantText('我有些紧张，不知道会不会出问题。', snapshot.semanticMappings)[0]).toMatchObject({ name: 'anxious' });
    expect(presentationForAssistantText('好困，想稍微休息一下。', snapshot.semanticMappings)[0]).toMatchObject({ name: 'sleepy' });
  });
});
