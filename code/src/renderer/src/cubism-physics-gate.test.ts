import { describe, expect, it } from 'vitest';
import { installPhysicsGate, type PhysicsRuntimeHost } from './cubism-physics-gate';

describe('Cubism physics gate', () => {
  it('actually skips and resumes physics.evaluate without touching Focus dynamics', () => {
    const calls: unknown[] = [];
    const host: PhysicsRuntimeHost = {
      physics: {
        evaluate: (...args) => calls.push(args)
      }
    };
    installPhysicsGate(host);
    host.physics?.evaluate('core', 1 / 60);
    host.setPhysicsEnabled?.(false);
    host.physics?.evaluate('core', 1 / 60);
    host.setPhysicsEnabled?.(true);
    host.physics?.evaluate('core', 1 / 60);
    expect(calls).toHaveLength(2);
  });
});
