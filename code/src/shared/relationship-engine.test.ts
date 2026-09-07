import { describe, expect, it } from 'vitest';
import { RelationshipEngine, createRelationshipState, relationshipStage } from './relationship-engine';

describe('relationship engine', () => {
  it('grows through gradual conversation stages instead of jumping directly', () => {
    const engine = new RelationshipEngine('role-a', () => 100);
    let state = createRelationshipState('role-a', 100);
    expect(relationshipStage(state)).toBe('初识');
    state = engine.apply(state, { type: 'conversation', now: 200, userMessage: '你好', assistantMessage: '你好' });
    expect(relationshipStage(state)).toBe('初识');
    for (let index = 0; index < 20; index += 1) state = engine.apply(state, { type: 'conversation', now: 300 + index, userMessage: '继续交流', assistantMessage: '好的' });
    expect(relationshipStage(state)).toBe('熟悉');
    expect(state.interactionCount).toBe(21);
  });

  it('repairs conflict without exceeding bounded trust values', () => {
    const engine = new RelationshipEngine('role-a', () => 100);
    let state = createRelationshipState('role-a', 100);
    for (let index = 0; index < 8; index += 1) state = engine.apply(state, { type: 'conversation', now: 200 + index, userMessage: '我很生气，结果失败了', assistantMessage: '我理解你的焦虑' });
    const conflictBefore = state.conflict;
    state = engine.apply(state, { type: 'repair', now: 500 });
    expect(state.conflict).toBeLessThan(conflictBefore);
    expect(state.trust).toBeLessThanOrEqual(100);
    expect(state.continuity).toBeLessThanOrEqual(100);
  });
});
