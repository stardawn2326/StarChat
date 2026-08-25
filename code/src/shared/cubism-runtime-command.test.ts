import { describe, expect, it } from 'vitest';
import { isSafeCubismRuntimeCommand } from './cubism-runtime-command';

describe('Cubism runtime IPC command contract', () => {
  it('accepts only bounded runtime commands', () => {
    expect(isSafeCubismRuntimeCommand({ type: 'capabilities' })).toBe(true);
    expect(isSafeCubismRuntimeCommand({ type: 'play_expression', expressionId: 'Smile A' })).toBe(true);
    expect(isSafeCubismRuntimeCommand({ type: 'play_motion', group: 'Gesture', index: 2, priority: 'force' })).toBe(true);
    expect(isSafeCubismRuntimeCommand({ type: 'play_motion', group: 'Gesture', index: 1.5, priority: 'normal' })).toBe(false);
    expect(isSafeCubismRuntimeCommand({ type: 'play_expression', expressionId: '' })).toBe(false);
    expect(isSafeCubismRuntimeCommand({ type: 'play_motion', group: 'Gesture', index: 0, priority: 'urgent' })).toBe(false);
  });
});
