import { describe, expect, it } from 'vitest';
import { CubismRuntimeControl, type CubismRuntimeConsumerModel } from './cubism-runtime-control';

interface FakeCalls {
  expressions: string[];
  motions: Array<{ group: string; index: number; priority: number }>;
  resetExpressions: number;
  stopMotions: number;
}

function createFakeModel(
  identity: string,
  options: {
    expressions?: Array<Record<string, unknown>>;
    motions?: Record<string, Array<Record<string, unknown>>>;
    managerExpressions?: Array<Record<string, unknown>> | null;
    managerMotions?: Record<string, Array<Record<string, unknown>>> | null;
    settingsExpressions?: Array<Record<string, unknown>>;
    settingsMotions?: Record<string, Array<Record<string, unknown>>>;
    expressionResult?: boolean;
    motionResult?: boolean;
    expressionError?: Error;
    motionError?: Error;
  } = {}
): { model: CubismRuntimeConsumerModel; calls: FakeCalls; emitMotionFinish: () => void } {
  const calls: FakeCalls = {
    expressions: [],
    motions: [],
    resetExpressions: 0,
    stopMotions: 0
  };
  const listeners = new Map<string, Set<() => void>>();
  const model: CubismRuntimeConsumerModel = {
    modelIdentity: identity,
    expression: async (id) => {
      calls.expressions.push(id);
      if (options.expressionError) throw options.expressionError;
      return options.expressionResult ?? true;
    },
    motion: async (group, index, priority) => {
      calls.motions.push({ group, index, priority });
      if (options.motionError) throw options.motionError;
      return options.motionResult ?? true;
    },
    internalModel: {
      motionManager: {
        expressionManager: {
          definitions: options.managerExpressions === null ? undefined : options.managerExpressions ?? options.expressions ?? [
            { Name: 'smile-id', File: 'smile.exp3.json' },
            { Name: 'blink-id', File: 'blink.exp3.json' }
          ],
          resetExpression: () => {
            calls.resetExpressions += 1;
          }
        },
        definitions: options.managerMotions === null ? undefined : options.managerMotions ?? options.motions ?? {
          IdleGroup: [{ File: 'idle.motion3.json', Name: 'Idle display' }],
          GestureGroup: [
            { File: 'wave.motion3.json', Name: 'Wave display' },
            { File: 'bow.motion3.json' }
          ]
        },
        stopAllMotions: () => {
          calls.stopMotions += 1;
        },
        on: (event, listener) => {
          const set = listeners.get(event) ?? new Set();
          set.add(listener);
          listeners.set(event, set);
        },
        off: (event, listener) => {
          listeners.get(event)?.delete(listener);
        }
      },
      settings: {
        expressions: options.settingsExpressions,
        motions: options.settingsMotions
      }
    }
  };
  return {
    model,
    calls,
    emitMotionFinish: () => {
      for (const listener of listeners.get('motionFinish') ?? []) listener();
    }
  };
}

describe('CubismRuntimeControl', () => {
  it('enumerates actual expression ids and motion group/index capabilities', () => {
    const { model } = createFakeModel('model-a');
    const control = new CubismRuntimeControl();
    control.bind(model);

    expect(control.getCapabilities()).toEqual({
      modelIdentity: 'model-a',
      expressions: [
        { id: 'smile-id', displayName: 'smile-id', index: 0, fileName: 'smile.exp3.json' },
        { id: 'blink-id', displayName: 'blink-id', index: 1, fileName: 'blink.exp3.json' }
      ],
      motions: [
        { group: 'IdleGroup', index: 0, displayName: 'Idle display', fileName: 'idle.motion3.json' },
        { group: 'GestureGroup', index: 0, displayName: 'Wave display', fileName: 'wave.motion3.json' },
        { group: 'GestureGroup', index: 1, displayName: 'bow', fileName: 'bow.motion3.json' }
      ],
      idleGroup: null
    });
  });

  it('falls back to the current model settings when manager definitions are empty', async () => {
    const { model, calls } = createFakeModel('settings-only', {
      managerExpressions: null,
      managerMotions: null,
      settingsExpressions: [{ Name: 'settings-expression', File: 'Expressions/Smile.EXP3.JSON' }],
      settingsMotions: { Idle: [{ Name: 'settings-motion', File: './motions/idle.MOTION3.JSON' }] }
    });
    const control = new CubismRuntimeControl();
    control.bind(model);

    expect(control.getCapabilities()).toMatchObject({
      expressions: [{ id: 'settings-expression', fileName: 'Expressions/Smile.EXP3.JSON' }],
      motions: [{ group: 'Idle', index: 0, fileName: './motions/idle.MOTION3.JSON' }]
    });
    expect(control.findExpressionByFile('./expressions/smile.exp3.json')?.id).toBe('settings-expression');
    expect(control.findMotionByFile('MOTIONS/IDLE.motion3.json')?.group).toBe('Idle');
    expect((await control.playExpression('settings-expression')).ok).toBe(true);
    expect((await control.playMotion('Idle', 0, 'normal')).ok).toBe(true);
    expect(calls.expressions).toEqual(['settings-expression']);
    expect(calls.motions).toEqual([{ group: 'Idle', index: 0, priority: 2 }]);
  });

  it('keeps manager definitions authoritative and de-duplicates settings entries', () => {
    const { model } = createFakeModel('deduplicated', {
      managerExpressions: [{ Name: 'manager-expression', File: 'Expressions/Smile.exp3.json' }],
      managerMotions: { Idle: [{ Name: 'manager-motion', File: 'motions/idle.motion3.json' }] },
      settingsExpressions: [
        { Name: 'settings-copy', File: './expressions/smile.EXP3.JSON' },
        { Name: 'settings-only', File: 'expressions/extra.exp3.json' }
      ],
      settingsMotions: {
        Idle: [
          { Name: 'settings-copy', File: './motions/IDLE.MOTION3.JSON' },
          { Name: 'settings-only', File: 'motions/extra.motion3.json' }
        ]
      }
    });
    const control = new CubismRuntimeControl();
    control.bind(model);

    expect(control.getCapabilities().expressions).toEqual([
      { id: 'manager-expression', displayName: 'manager-expression', index: 0, fileName: 'Expressions/Smile.exp3.json' },
      { id: 'settings-only', displayName: 'settings-only', index: 1, fileName: 'expressions/extra.exp3.json' }
    ]);
    expect(control.getCapabilities().motions).toEqual([
      { group: 'Idle', index: 0, displayName: 'manager-motion', fileName: 'motions/idle.motion3.json' },
      { group: 'Idle', index: 1, displayName: 'settings-only', fileName: 'motions/extra.motion3.json' }
    ]);
  });

  it('reports empty capabilities when both runtime sources are empty', () => {
    const { model } = createFakeModel('empty-sources', {
      managerExpressions: [],
      managerMotions: {},
      settingsExpressions: [],
      settingsMotions: {}
    });
    const control = new CubismRuntimeControl();
    control.bind(model);

    expect(control.getCapabilities()).toMatchObject({ expressions: [], motions: [] });
  });

  it('passes a real expression id and motion group/index/priority to the public model consumer', async () => {
    const { model, calls } = createFakeModel('model-a');
    const control = new CubismRuntimeControl();
    control.bind(model);

    expect(await control.playExpression('smile-id')).toMatchObject({ ok: true, phase: 'expression' });
    expect(await control.playMotion('GestureGroup', 1, 'force')).toMatchObject({ ok: true, phase: 'motion' });
    expect(calls.expressions).toEqual(['smile-id']);
    expect(calls.motions).toEqual([{ group: 'GestureGroup', index: 1, priority: 3 }]);
  });

  it('supports stop/reset and naturally clears active expression/motion after completion', async () => {
    const { model, calls, emitMotionFinish } = createFakeModel('model-a');
    const control = new CubismRuntimeControl();
    control.bind(model);

    await control.playExpression('smile-id');
    await control.playMotion('GestureGroup', 0, 'normal');
    expect(control.getStatus()).toMatchObject({
      activeExpression: 'smile-id',
      activeMotion: { group: 'GestureGroup', index: 0, priority: 'normal' }
    });
    emitMotionFinish();
    expect(control.getStatus()).toMatchObject({ activeExpression: 'smile-id', activeMotion: null });

    expect(control.stopExpression()).toMatchObject({ ok: true, phase: 'stop_expression' });
    expect(control.stopMotion()).toMatchObject({ ok: true, phase: 'stop_motion' });
    expect(control.reset()).toMatchObject({ ok: true, phase: 'reset' });
    expect(calls.resetExpressions).toBeGreaterThan(0);
    expect(calls.stopMotions).toBeGreaterThan(0);
  });

  it('rebuilds capabilities on model switch and invalidates the old binding', async () => {
    const old = createFakeModel('old-model', {
      expressions: [{ Name: 'old-expression', File: 'old.exp3.json' }],
      motions: { OldGroup: [{ File: 'old.motion3.json' }] }
    });
    const next = createFakeModel('new-model', {
      expressions: [{ Name: 'new-expression', File: 'new.exp3.json' }],
      motions: { NewGroup: [{ File: 'new.motion3.json' }] }
    });
    const control = new CubismRuntimeControl();
    control.bind(old.model);
    control.bind(next.model);

    expect(control.getCapabilities().modelIdentity).toBe('new-model');
    expect(control.getCapabilities().expressions.map((item) => item.id)).toEqual(['new-expression']);
    expect((await control.playExpression('old-expression')).ok).toBe(false);
    expect((await control.playExpression('new-expression')).ok).toBe(true);
    expect(old.calls.expressions).toEqual([]);
    expect(next.calls.expressions).toEqual(['new-expression']);
  });

  it('reports empty, rejected and corrupted runtime operations instead of pretending success', async () => {
    const empty = createFakeModel('empty-model', { expressions: [], motions: {} });
    const control = new CubismRuntimeControl();
    control.bind(empty.model);
    expect(await control.playExpression('missing')).toMatchObject({ ok: false, code: 'unsupported', phase: 'expression' });
    expect(await control.playMotion('missing', 0, 'normal')).toMatchObject({ ok: false, code: 'unsupported', phase: 'motion' });

    const rejected = createFakeModel('rejected-model', { expressionResult: false, motionResult: false });
    control.bind(rejected.model);
    expect(await control.playExpression('smile-id')).toMatchObject({ ok: false, code: 'rejected', phase: 'expression' });
    expect(await control.playMotion('GestureGroup', 0, 'normal')).toMatchObject({ ok: false, code: 'rejected', phase: 'motion' });

    const corrupted = createFakeModel('corrupted-model', { motionError: new Error('motion3 JSON 解析失败') });
    control.bind(corrupted.model);
    const result = await control.playMotion('GestureGroup', 0, 'normal');
    expect(result).toMatchObject({ ok: false, code: 'runtime_error', phase: 'motion' });
    expect(result.message).toContain('motion3 JSON 解析失败');
  });

  it('prevents idle motions from overriding explicit actions, while force priority can preempt', async () => {
    const { model, calls } = createFakeModel('model-a');
    const control = new CubismRuntimeControl();
    control.bind(model);

    expect((await control.playMotion('GestureGroup', 0, 'normal')).ok).toBe(true);
    expect(await control.playMotion('IdleGroup', 0, 'idle')).toMatchObject({
      ok: false,
      code: 'priority_blocked'
    });
    expect((await control.playMotion('GestureGroup', 1, 'force')).ok).toBe(true);
    expect((await control.playMotion('GestureGroup', 0, 'force')).ok).toBe(true);
    expect(calls.motions).toEqual([
      { group: 'GestureGroup', index: 0, priority: 2 },
      { group: 'GestureGroup', index: 1, priority: 3 },
      { group: 'GestureGroup', index: 0, priority: 3 }
    ]);
  });
});
