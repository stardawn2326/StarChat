import { describe, expect, it } from 'vitest';
import { buildRuntimeLive2DCapabilityReport, buildStaticLive2DCapabilityReport } from './live2d-capability-report';
import type { CubismRuntimeCapabilities } from './cubism';
import type { Live2DModelState } from './live2d';

const model: Pick<Live2DModelState, 'entryPath' | 'files' | 'expressions' | 'motions' | 'parameters' | 'physics'> = {
  entryPath: 'C:/model/model3.json',
  files: [
    { kind: 'texture', fileName: 'texture_00.png', relativePath: 'texture_00.png', absolutePath: 'C:/model/texture_00.png', exists: true, readable: true, bytes: 10, parseStatus: 'ok' },
    { kind: 'display_info', fileName: 'model.cdi3.json', relativePath: 'model.cdi3.json', absolutePath: 'C:/model/model.cdi3.json', exists: true, readable: true, bytes: 10, parseStatus: 'ok' }
  ],
  expressions: [{ fileName: 'happy.exp3.json', absolutePath: 'C:/model/happy.exp3.json', parseStatus: 'ok', parameterEffects: [] }],
  motions: [{ fileName: 'idle.motion3.json', absolutePath: 'C:/model/idle.motion3.json', parseStatus: 'ok', duration: 1, fps: 30, loop: true, curveCount: 1, curveIds: ['ParamAngleX'] }],
  parameters: [{ id: 'ParamAngleX', groupId: 'ParamGroup', name: 'Angle X' }],
  physics: { settingCount: 1, inputCount: 1, outputCount: 1, vertexCount: 1, fps: 30 }
};

const capabilities: CubismRuntimeCapabilities = {
  modelIdentity: 'C:/model/model3.json',
  expressions: [{ id: 'happy', displayName: 'happy', index: 0, fileName: 'happy.exp3.json' }],
  motions: [{ group: 'Idle', index: 0, displayName: 'idle', fileName: 'idle.motion3.json' }],
  idleGroup: 'Idle',
  manifest: { modelIdentity: 'C:/model/model3.json', parameters: {} as unknown as NonNullable<CubismRuntimeCapabilities['manifest']>['parameters'], missing: [] }
};

describe('Live2D capability report', () => {
  it('separates static detection from runtime verification', () => {
    const staticReport = buildStaticLive2DCapabilityReport(model);
    expect(staticReport.evidence.find((item) => item.id === 'expressions')?.state).toBe('detected');
    const runtimeReport = buildRuntimeLive2DCapabilityReport(staticReport, capabilities, {
      ok: true,
      phase: 'capabilities',
      message: 'ok',
      status: { modelIdentity: 'C:/model/model3.json', activeExpression: null, activeMotion: null },
      capabilities
    }, 'C:/model/model3.json');
    expect(runtimeReport.evidence.find((item) => item.id === 'runtime-expressions')?.state).toBe('verified');
    expect(runtimeReport.evidence.find((item) => item.id === 'runtime-lipsync')?.state).toBe('not_tested');
  });

  it('does not verify a runtime from another model', () => {
    const report = buildRuntimeLive2DCapabilityReport(buildStaticLive2DCapabilityReport(model), capabilities, null, 'C:/other/model3.json');
    expect(report.evidence.find((item) => item.id === 'runtime-motions')?.state).toBe('not_tested');
  });
});
