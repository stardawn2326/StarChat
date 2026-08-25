import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { registerRuntimeAssets } from './runtime-asset-registration';

const runtimeSource = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'live2d-runtime.js'), 'utf8');

describe('runtime asset registration', () => {
  it('registers valid loose exp3 and motion3 files in memory without touching source files', () => {
    const settings: { expressions?: Array<Record<string, unknown>>; motions?: Record<string, Array<Record<string, unknown>>> } = {};
    const expressionManager = { definitions: [] as Array<Record<string, unknown>>, expressions: [] as unknown[] };
    const motionManager = {
      definitions: {} as Record<string, Array<Record<string, unknown>>>,
      motionGroups: {} as Record<string, unknown[]>,
      expressionManager
    };
    const result = registerRuntimeAssets({ settings, motionManager }, {
      expressions: [
        { fileName: 'expressions/Smile.exp3.json', parseStatus: 'ok' },
        { fileName: 'expressions/Broken.exp3.json', parseStatus: 'error' }
      ],
      motions: [{ fileName: 'motions/Wave.motion3.json', parseStatus: 'ok' }]
    });

    expect(result).toEqual({ expressionsAdded: 1, motionsAdded: 1, needsExpressionManager: false });
    expect(settings.expressions).toEqual([{ Name: 'Smile', File: 'expressions/Smile.exp3.json' }]);
    expect(expressionManager.definitions).toEqual(settings.expressions);
    expect(settings.motions).toEqual({ Imported: [{ File: 'motions/Wave.motion3.json' }] });
    expect(motionManager.definitions).toEqual(settings.motions);
    expect(motionManager.motionGroups).toEqual({ Imported: [] });
  });

  it('reports that a Cubism expression manager must be created when the model declared none', () => {
    const settings: { expressions?: Array<Record<string, unknown>>; motions?: Record<string, Array<Record<string, unknown>>> } = {};
    const motionManager = { definitions: {} as Record<string, Array<Record<string, unknown>>>, motionGroups: {} as Record<string, unknown[]> };
    const result = registerRuntimeAssets({ settings, motionManager }, {
      expressions: [{ fileName: 'face.exp3.json', parseStatus: 'ok' }],
      motions: []
    });
    expect(result.needsExpressionManager).toBe(true);
    expect(settings.expressions).toEqual([{ Name: 'face', File: 'face.exp3.json' }]);
  });

  it('does not crash when an external model has no motion manager at all', () => {
    const settings: { expressions?: Array<Record<string, unknown>>; motions?: Record<string, Array<Record<string, unknown>>> } = {};
    expect(registerRuntimeAssets({ settings }, {
      expressions: [{ fileName: 'face.exp3.json', parseStatus: 'ok' }],
      motions: [{ fileName: 'nod.motion3.json', parseStatus: 'ok' }]
    })).toEqual({ expressionsAdded: 0, motionsAdded: 0, needsExpressionManager: false });
  });

  it('registers scanned assets before binding runtime controls and creates a missing expression manager', () => {
    const registration = runtimeSource.indexOf('registerRuntimeAssets(candidateModel.internalModel');
    const bind = runtimeSource.indexOf('candidateControl.bind(candidateModel');
    expect(registration).toBeGreaterThan(0);
    expect(registration).toBeLessThan(bind);
    expect(runtimeSource).toContain('new Cubism4ExpressionManager(');
    expect(runtimeSource).toContain('expressions: nextOptions.expressions');
    expect(runtimeSource).toContain('motions: nextOptions.motions');
  });
});
