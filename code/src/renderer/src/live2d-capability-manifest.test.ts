import { describe, expect, it } from 'vitest';
import { createParameterBindings, type Live2DAdapterConfig } from '../../shared/live2d';
import { buildLive2DCapabilityManifest } from './live2d-capability-manifest';

describe('runtime Live2D capability manifest', () => {
  it('resolves standard IDs and CDI/adapter aliases to runtime-safe ranges', () => {
    const adapter = {
      schemaVersion: 1,
      sourceEntryPath: 'fixture.model3.json',
      modelVersion: 3,
      parameterBindings: createParameterBindings([
        { id: 'HeadYaw', groupId: 'Parameter', name: '头部角度 X' },
        { id: 'ParamMouthOpenY', groupId: 'Parameter', name: '嘴巴开合' }
      ]),
      semanticMappings: {},
      resetValues: {}
    } as Live2DAdapterConfig;

    const manifest = buildLive2DCapabilityManifest('fixture.model3.json', [
      { id: 'HeadYaw', name: '头部角度 X', min: -12, max: 14, default: 2 },
      { id: 'ParamMouthOpenY', name: '嘴巴开合', min: 0, max: 0.8, default: 0 }
    ], adapter);

    expect(manifest.parameters.head_x).toMatchObject({
      available: true,
      targetId: 'HeadYaw',
      min: -12,
      max: 14,
      default: 2
    });
    expect(manifest.parameters.head_x.aliases).toEqual(expect.arrayContaining(['ParamAngleX', 'HeadYaw', '头部角度 X']));
    expect(manifest.parameters.eye_open_l.available).toBe(false);
    expect(manifest.missing).toContain('eye_open_l');
  });

  it('still scans standard runtime IDs when no adapter was persisted', () => {
    const manifest = buildLive2DCapabilityManifest('plain.model3.json', [
      { id: 'ParamAngleY', min: -20, max: 20, default: 0 }
    ], null);
    expect(manifest.parameters.head_y.available).toBe(true);
    expect(manifest.parameters.head_y.source).toBe('runtime');
  });
});
