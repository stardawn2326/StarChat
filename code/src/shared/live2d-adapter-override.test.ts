import { describe, expect, it } from 'vitest';
import { applyLive2DAdapterOverride, createParameterBindings, type Live2DAdapterConfig, type Live2DParameterInfo } from './live2d';

function adapter(): Live2DAdapterConfig {
  const parameters: Live2DParameterInfo[] = [{ id: 'ParamAngleX', groupId: '', name: '头部X' }, { id: 'CustomMouth', groupId: '', name: '嘴巴' }];
  return {
    schemaVersion: 1,
    sourceEntryPath: 'C:/model/avatar.model3.json',
    modelVersion: 3,
    parameterBindings: createParameterBindings(parameters),
    semanticMappings: {
      neutral: { category: 'expression', assetType: 'none', supported: true, sourceFile: null, effects: [], verifiedBy: [], reason: 'base' },
      happy: { category: 'expression', assetType: 'expression', supported: false, sourceFile: null, effects: [], verifiedBy: [], reason: 'base' }
    },
    resetValues: {}
  };
}

describe('Live2D adapter override', () => {
  it('applies only overrides for the same model identity', () => {
    const base = adapter();
    const changed = applyLive2DAdapterOverride(base, {
      schemaVersion: 1,
      sourceEntryPath: base.sourceEntryPath,
      parameterBindings: { mouth_open: 'CustomMouth' },
      semanticMappings: { happy: { sourceFile: 'happy.exp3.json' } },
      updatedAt: 1
    });
    expect(changed.parameterBindings.mouth_open.targetId).toBe('CustomMouth');
    expect(changed.parameterBindings.mouth_open.source).toBe('user-override');
    expect(changed.semanticMappings.happy.sourceFile).toBe('happy.exp3.json');
    expect(applyLive2DAdapterOverride(base, { schemaVersion: 1, sourceEntryPath: 'C:/other.model3.json', updatedAt: 1 })).toBe(base);
  });

  it('supports an explicit disabled semantic route', () => {
    const base = adapter();
    const changed = applyLive2DAdapterOverride(base, {
      schemaVersion: 1,
      sourceEntryPath: base.sourceEntryPath,
      semanticMappings: { happy: { sourceFile: null, supported: false } },
      updatedAt: 1
    });
    expect(changed.semanticMappings.happy.supported).toBe(false);
    expect(changed.semanticMappings.happy.sourceFile).toBeNull();
  });
});
