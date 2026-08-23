import { describe, expect, it } from 'vitest';
import type { Live2DAdapterConfig, Live2DSemanticRoute } from '../../shared/live2d';
import { ExpressionMotionAdapter } from './expression-motion-adapter';
import { MIKU_EXPRESSION_FIXTURE, MIKU_MOTION_FIXTURE } from './fixtures/miku-runtime-fixture';

function route(category: Live2DSemanticRoute['category'], sourceFile: string | null, id: string, value: number): Live2DSemanticRoute {
  return {
    category,
    assetType: sourceFile?.endsWith('motion3.json') ? 'motion' : 'expression',
    supported: true,
    sourceFile,
    effects: [{ id, value, blend: 'Add' }],
    verifiedBy: sourceFile ? [`${sourceFile}:${id}`] : [],
    reason: 'fixture'
  };
}

const adapter = {
  schemaVersion: 1,
  sourceEntryPath: 'D:/external/miku/miku.model3.json',
  modelVersion: 3,
  parameterBindings: {},
  resetValues: {},
  semanticMappings: {
    neutral: route('expression', null, '', 0),
    blush: route('expression', '脸红.exp3.json', 'Param130', 1),
    greeting: route('action', 'Scene1.motion3.json', 'Param126', 1),
    watermark_on: route('system', '水印.exp3.json', 'Param137', 1),
    watermark_off: route('system', '水印.exp3.json', 'Param137', 0)
  }
} as unknown as Live2DAdapterConfig;

describe('AIRI application-layer expression and motion routing', () => {
  it('resolves parsed expression and motion assets without parameter writes', () => {
    const runtime = new ExpressionMotionAdapter(adapter, {
      expressions: Object.keys(MIKU_EXPRESSION_FIXTURE),
      motions: [MIKU_MOTION_FIXTURE.fileName]
    });

    expect(runtime.setExpression('blush')?.sourceFile).toBe('脸红.exp3.json');
    expect(runtime.setAction('greeting')?.sourceFile).toBe('Scene1.motion3.json');
    expect(runtime.getState()).toEqual({ expression: 'blush', action: 'greeting', watermark: 'on' });
  });

  it('keeps watermark as an expression route and tracks only semantic state', () => {
    const runtime = new ExpressionMotionAdapter(adapter, {
      expressions: Object.keys(MIKU_EXPRESSION_FIXTURE),
      motions: []
    });

    expect(runtime.setWatermark(false)?.sourceFile).toBe('水印.exp3.json');
    runtime.clearExpression();
    runtime.clearAction();
    expect(runtime.getState()).toEqual({ expression: null, action: null, watermark: 'off' });
  });

  it('does not claim an unavailable asset is runnable', () => {
    const runtime = new ExpressionMotionAdapter(adapter, { expressions: [], motions: [] });
    expect(runtime.setExpression('blush')).toMatchObject({ sourceFile: null, supported: false });
    expect(runtime.setAction('greeting')).toMatchObject({ sourceFile: null, supported: false });
    expect(runtime.getState()).toEqual({ expression: null, action: null, watermark: 'on' });
  });

  it('retains the parser fixture contract while the runtime delegates playback', () => {
    expect(Object.keys(MIKU_EXPRESSION_FIXTURE)).toHaveLength(8);
    expect(MIKU_EXPRESSION_FIXTURE['水印.exp3.json']).toEqual([{ id: 'Param137', value: 1 }]);
    expect(MIKU_MOTION_FIXTURE).toMatchObject({ fileName: 'Scene1.motion3.json', duration: 2.667, loop: true });
  });
});
