import { describe, expect, it } from 'vitest';
import type { CubismRuntimeCapabilities, CubismRuntimeController, CubismRuntimeResult, CubismRuntimeStatus } from '../../shared/cubism';
import { dispatchCubismRuntimeCommand } from './cubism-runtime-dispatch';

function createController() {
  const calls: Array<unknown> = [];
  const capabilities: CubismRuntimeCapabilities = { modelIdentity: 'model-a', expressions: [{ id: 'smile-id', displayName: 'Smile', index: 0, fileName: 'smile.exp3.json' }], motions: [{ group: 'Gesture', index: 2, displayName: 'Wave', fileName: 'wave.motion3.json' }], idleGroup: null };
  const status: CubismRuntimeStatus = { modelIdentity: 'model-a', activeExpression: null, activeMotion: null };
  const success = (phase: CubismRuntimeResult['phase']): CubismRuntimeResult => ({ ok: true, phase, message: 'ok', status, capabilities });
  const controller = {
    getCapabilities: () => capabilities,
    getRuntimeStatus: () => status,
    playExpression: async (id: string | null) => { calls.push(['expression', id]); return success('expression'); },
    playMotion: async (group: string, index: number, priority: 'idle' | 'normal' | 'force') => { calls.push(['motion', group, index, priority]); return success('motion'); },
    stopExpression: () => { calls.push(['stop_expression']); return success('stop_expression'); },
    stopMotion: () => { calls.push(['stop_motion']); return success('stop_motion'); },
    reset: () => { calls.push(['reset']); return success('reset'); }
  } as unknown as CubismRuntimeController;
  return { controller, calls };
}

describe('Cubism runtime renderer dispatch', () => {
  it('routes IPC commands to the controller consumer with original ids and coordinates', async () => {
    const { controller, calls } = createController();
    await dispatchCubismRuntimeCommand(controller, { type: 'play_expression', expressionId: 'smile-id' }, 'model-a');
    await dispatchCubismRuntimeCommand(controller, { type: 'play_motion', group: 'Gesture', index: 2, priority: 'force' }, 'model-a');
    await dispatchCubismRuntimeCommand(controller, { type: 'stop_motion' }, 'model-a');
    expect(calls).toEqual([
      ['expression', 'smile-id'],
      ['motion', 'Gesture', 2, 'force'],
      ['stop_motion']
    ]);
  });

  it('returns not_ready during model replacement instead of calling the old controller', async () => {
    const { controller, calls } = createController();
    const result = await dispatchCubismRuntimeCommand(controller, { type: 'reset' }, 'new-model');
    expect(result).toMatchObject({ ok: false, code: 'not_ready', phase: 'reset' });
    expect(calls).toEqual([]);
  });
});
