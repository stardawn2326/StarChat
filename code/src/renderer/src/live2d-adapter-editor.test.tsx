import { describe, expect, it } from 'vitest';
import { createParameterBindings, type Live2DAdapterConfig } from '../../shared/live2d';
import { clearAllOverrides, clearParameterOverride, clearSemanticOverride, setParameterOverride, setSemanticOverride } from '../../shared/live2d-adapter-overrides';
import { capabilityStateLabel } from './Live2DAdapterEditor';

function adapter(sourceEntryPath = 'fixture.model3.json'): Live2DAdapterConfig {
  return {
    schemaVersion: 1,
    sourceEntryPath,
    modelVersion: 3,
    parameterBindings: createParameterBindings([{ id: 'ParamMouthOpenY', groupId: 'Parameter', name: '嘴巴开合' }]),
    semanticMappings: {
      blush: { category: 'expression', assetType: 'expression', supported: true, sourceFile: 'auto.exp3.json', effects: [], verifiedBy: ['static'], reason: '自动检测' }
    },
    resetValues: {}
  };
}

describe('Live2D adapter editor capability states', () => {
  it('uses explicit textual evidence states instead of color-only or emoji status', () => {
    expect(capabilityStateLabel('detected')).toBe('已检测');
    expect(capabilityStateLabel('verified')).toBe('已验证');
    expect(capabilityStateLabel('failed')).toBe('失败');
    expect(capabilityStateLabel('not_tested')).toBe('未测试');
  });
});

describe('Live2D adapter override editing', () => {
  it('supports semantic Auto -> Override -> Auto and removes an empty delta', () => {
    const baseline = adapter();
    const overridden = setSemanticOverride(baseline, baseline, 'blush', 'manual.exp3.json');
    expect(overridden.semanticMappings.blush.sourceFile).toBe('manual.exp3.json');
    expect(overridden.overrides?.semanticMappings?.blush?.sourceFile).toBe('manual.exp3.json');

    const restored = clearSemanticOverride(overridden, baseline, 'blush');
    expect(restored.semanticMappings.blush.sourceFile).toBe('auto.exp3.json');
    expect(restored.overrides).toBeUndefined();
  });

  it('supports parameter Override -> Auto while preserving another semantic delta', () => {
    const baseline = adapter();
    const semantic = setSemanticOverride(baseline, baseline, 'blush', 'manual.exp3.json');
    const parameter = setParameterOverride(semantic, baseline, 'mouth_open', 'ParamCustomMouth');
    expect(parameter.parameterBindings.mouth_open.targetId).toBe('ParamCustomMouth');
    expect(parameter.overrides?.semanticMappings?.blush?.sourceFile).toBe('manual.exp3.json');

    const restored = clearParameterOverride(parameter, baseline, 'mouth_open');
    expect(restored.parameterBindings.mouth_open.targetId).toBe(baseline.parameterBindings.mouth_open.targetId);
    expect(restored.overrides?.parameterBindings).toBeUndefined();
    expect(restored.overrides?.semanticMappings?.blush?.sourceFile).toBe('manual.exp3.json');
  });

  it('resets all overrides and keeps model A/B state isolated', () => {
    const baseA = adapter('a.model3.json');
    const baseB = adapter('b.model3.json');
    const changedA = setParameterOverride(baseA, baseA, 'mouth_open', 'A-mouth');
    const changedB = setParameterOverride(baseB, baseB, 'mouth_open', 'B-mouth');
    expect(clearAllOverrides(changedA).overrides).toBeUndefined();
    expect(changedA.overrides?.parameterBindings?.mouth_open).toBe('A-mouth');
    expect(changedB.overrides?.parameterBindings?.mouth_open).toBe('B-mouth');
  });
});
