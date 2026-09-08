import { describe, expect, it } from 'vitest';
import { RelationshipEngine, createRelationshipState, relationshipStage } from './relationship-engine';
import { classifyRelationshipEvent } from './relationship-event-classifier';

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

  it('classifies meaningful relationship cues with explicit priority', () => {
    expect(classifyRelationshipEvent('我叫星晓。')).toMatchObject({ type: 'personal_disclosure' });
    expect(classifyRelationshipEvent('不要再这样了。')).toMatchObject({ type: 'boundary' });
    expect(classifyRelationshipEvent('没关系，我接受你的道歉。', '抱歉，我刚才说错了。')).toMatchObject({ type: 'repair' });
    expect(classifyRelationshipEvent('你刚才说错了。', '抱歉，我会改正。')).not.toMatchObject({ type: 'repair' });
    expect(classifyRelationshipEvent('气死我了，这太糟糕。')).toMatchObject({ type: 'conflict' });
    expect(classifyRelationshipEvent('谢谢你帮忙。')).toMatchObject({ type: 'positive_interaction' });
  });
});
