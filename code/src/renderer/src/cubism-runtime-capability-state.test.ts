import { describe, expect, it } from 'vitest';
import type { CubismRuntimeCapabilities } from '../../shared/cubism';
import { classifyRuntimeAsset } from './cubism-runtime-capability-state';

const capabilities: CubismRuntimeCapabilities = {
  modelIdentity: 'C:/models/baoyin.model3.json',
  expressions: [{ id: 'exp.native', displayName: 'Native', index: 0, fileName: 'exp.native.exp3.json' }],
  motions: [{ group: 'Idle', index: 0, displayName: 'Idle 0', fileName: 'idle.motion3.json' }],
  idleGroup: 'Idle'
};

describe('static and runtime capability state', () => {
  it('distinguishes available, static-but-runtime-failed, and not-provided assets', () => {
    expect(classifyRuntimeAsset('exp.native.exp3.json', { ready: true, capabilities, result: null })).toBe('available');
    expect(classifyRuntimeAsset('broken.exp3.json', { ready: true, capabilities, result: null })).toBe('runtime_failed');
    expect(classifyRuntimeAsset('', { ready: true, capabilities, result: null })).toBe('not_provided');
  });

  it('keeps static labels waiting while the matching runtime is connecting', () => {
    expect(classifyRuntimeAsset('exp.native.exp3.json', { ready: false, capabilities: null, result: null })).toBe('waiting');
  });

  it('does not enable a capability list belonging to another model identity', () => {
    expect(classifyRuntimeAsset('exp.native.exp3.json', { ready: true, capabilities, result: null }, 'C:/models/other.model3.json')).toBe('waiting');
  });
});
