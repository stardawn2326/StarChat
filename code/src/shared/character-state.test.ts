import { describe, expect, it } from 'vitest';
import { CharacterStateResolver } from './character-state';

describe('character state lifecycle', () => {
  it('removes the currently active action when its model motion finishes', () => {
    const resolver = new CharacterStateResolver();
    resolver.apply({ type: 'action', name: 'nod', source: 'assistant', layer: 'reply_state' });
    expect(resolver.snapshot().activeAction).toBe('nod');
    resolver.finishAction();
    expect(resolver.snapshot().activeAction).toBeNull();
  });
});
