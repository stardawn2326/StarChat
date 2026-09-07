import { describe, expect, it } from 'vitest';
import { evaluateLive2DCompatibility } from './live2d-compatibility';

describe('Live2D compatibility matrix', () => {
  it('reports useful fallbacks for a model without physics or CDI metadata', () => {
    const report = evaluateLive2DCompatibility({
      entryPath: 'C:/model/avatar.model3.json',
      parameters: [{ id: 'ParamAngleX', groupId: '', name: 'Angle X' }, { id: 'ParamMouthOpenY', groupId: '', name: 'Mouth' }],
      expressions: [{ fileName: 'expression_custom.exp3.json', absolutePath: 'C:/model/expression_custom.exp3.json', parseStatus: 'ok', parameterEffects: [] }],
      motions: [],
      physics: null,
      adapter: null
    }, 'file');
    expect(report.cases.find((item) => item.id === 'missing-physics')?.supported).toBe(true);
    expect(report.cases.find((item) => item.id === 'nonstandard-expressions')?.supported).toBe(true);
    expect(report.cases.find((item) => item.id === 'limited-motions')?.supported).toBe(false);
  });
});
