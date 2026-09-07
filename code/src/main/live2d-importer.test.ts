import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyLive2DSemantic,
  buildNamedParameterPatch
} from '../shared/live2d';
import { inspectExternalLive2DModel, validateExternalModelPath } from './live2d-importer';

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

const fixtureRoots: string[] = [];

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2), 'utf8');
}

function createFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'starchat-live2d-'));
  fixtureRoots.push(root);
  mkdirSync(join(root, 'textures'));
  writeFileSync(join(root, 'fixture.moc3'), Buffer.from('moc3-test'));
  writeJson(join(root, 'fixture.physics3.json'), {
    Version: 3,
    Meta: { PhysicsSettingCount: 1, TotalInputCount: 1, TotalOutputCount: 1, VertexCount: 2, Fps: 30 }
  });
  const parameterIds: Array<[string, string]> = [
    ['ParamAngleX', '角度 X'],
    ['ParamAngleY', '角度 Y'],
    ['ParamAngleZ', '角度 Z'],
    ['ParamBodyAngleX', '身体 X'],
    ['ParamBodyAngleY', '身体 Y'],
    ['ParamBodyAngleZ', '身体 Z'],
    ['ParamEyeLOpen', '左眼'],
    ['ParamEyeROpen', '右眼'],
    ['ParamEyeBallX', '眼球 X'],
    ['ParamEyeBallY', '眼球 Y'],
    ['ParamMouthOpenY', '嘴张开'],
    ['ParamMouthForm', '嘴形'],
    ['ParamBreath', '呼吸'],
    ['ParamHairFront', '前发'],
    ['ParamHairSide', '侧发'],
    ['ParamHairBack', '后发'],
    ['Param125', '圈圈'],
    ['Param130', '脸红'],
    ['Param131', 'QQ'],
    ['Param136', 'QQ'],
    ['Param132', '前倾'],
    ['Param133', '大葱'],
    ['Param134', '唱歌'],
    ['Param135', '比心'],
    ['Param137', '水印'],
    ['ParamBrowLY', '左眉'],
    ['ParamBrowRY', '右眉']
  ];
  writeJson(join(root, 'fixture.cdi3.json'), {
    Version: 3,
    Parameters: parameterIds.map(([id, name]) => ({ Id: id, GroupId: 'test', Name: name }))
  });
  for (let index = 0; index < 2; index += 1) {
    writeFileSync(join(root, 'textures', `texture_${index}.png`), ONE_PIXEL_PNG);
  }
  writeJson(join(root, '脸红.exp3.json'), {
    Parameters: [{ Id: 'Param130', Value: 1, Blend: 'Add' }]
  });
  writeJson(join(root, 'QQ人.exp3.json'), {
    Parameters: [
      { Id: 'Param131', Value: 1, Blend: 'Add' },
      { Id: 'Param136', Value: 1, Blend: 'Add' }
    ]
  });
  writeJson(join(root, '比心.exp3.json'), {
    Parameters: [{ Id: 'Param135', Value: 1, Blend: 'Add' }]
  });
  writeJson(join(root, 'Scene1.motion3.json'), {
    Version: 3,
    Meta: { Duration: 1, Fps: 30, Loop: true, CurveCount: 1 },
    Curves: [{ Target: 'Parameter', Id: 'ParamAngleX' }]
  });
  writeFileSync(join(root, 'Untitled Animation.can3'), Buffer.from('editor-only'));
  writeJson(join(root, 'fixture.model3.json'), {
    Version: 3,
    FileReferences: {
      Moc: 'fixture.moc3',
      Textures: ['textures/texture_0.png', 'textures/texture_1.png'],
      Physics: 'fixture.physics3.json',
      DisplayInfo: 'fixture.cdi3.json'
    },
    Groups: [{ Target: 'Parameter', Name: 'EyeBlink', Ids: ['ParamEyeLOpen', 'ParamEyeROpen'] }]
  });
  return root;
}

afterEach(() => {
  while (fixtureRoots.length > 0) {
    const root = fixtureRoots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe('external Live2D importer', () => {
  it('loads only a model3 entry or directory and scans optional assets read-only', () => {
    const root = createFixture();
    const state = inspectExternalLive2DModel(root);

    expect(state.status).toBe('ready_with_warnings');
    expect(state.selectionKind).toBe('directory');
    expect(state.version).toBe(3);
    expect(state.files.filter((file) => file.kind === 'texture')).toHaveLength(2);
    expect(state.expressions.map((asset) => asset.fileName)).toEqual(['QQ人.exp3.json', '比心.exp3.json', '脸红.exp3.json']);
    expect(state.motions[0]?.curveIds).toEqual(['Parameter:ParamAngleX']);
    expect(state.editorAnimations[0]?.runtimeSupported).toBe(false);
    expect(state.adapter?.parameterBindings.head_x.targetId).toBe('ParamAngleX');
    expect(state.adapter?.parameterBindings.hair_back.available).toBe(true);
    expect(validateExternalModelPath(root)).toBe(true);
  });

  it('verifies exp3 parameter effects before mapping semantics and safely falls back', () => {
    const root = createFixture();
    const adapter = inspectExternalLive2DModel(root).adapter!;

    const blush = applyLive2DSemantic({}, adapter, 'blush');
    expect(blush.resolved.category).toBe('expression');
    expect(blush.resolved.sourceFile).toBe('脸红.exp3.json');
    expect(blush.state.Param130).toBe(1);

    const qq = applyLive2DSemantic(blush.state, adapter, 'cry/QQ');
    expect(qq.resolved.category).toBe('expression');
    expect(qq.state.Param131).toBe(1);
    expect(qq.state.Param136).toBe(1);
    expect(qq.state.Param130).toBe(0);

    const unknown = applyLive2DSemantic(qq.state, adapter, 'set_arbitrary_cubism_parameter');
    expect(unknown.resolved.resolved).toBe('neutral');
    expect(unknown.resolved.fallback).toBe(true);
    expect(unknown.state.Param131).toBe(0);
    expect(Object.keys(unknown.state)).not.toContain('set_arbitrary_cubism_parameter');
  });

  it('accepts named parameter semantics, clamps them, and leaves raw IDs unavailable', () => {
    const root = createFixture();
    const adapter = inspectExternalLive2DModel(root).adapter!;
    const effects = buildNamedParameterPatch(adapter, {
      head_x: 999,
      eye_open_l: -1,
      mouth_open: 0.8,
      mouth_form: -0.4,
      breath: 0.7
    });

    expect(effects).toEqual(
      expect.arrayContaining([
        { id: 'ParamAngleX', value: 30, blend: 'Overwrite' },
        { id: 'ParamEyeLOpen', value: 0, blend: 'Overwrite' },
        { id: 'ParamMouthOpenY', value: 0.8, blend: 'Overwrite' },
        { id: 'ParamMouthForm', value: -0.4, blend: 'Overwrite' },
        { id: 'ParamBreath', value: 0.7, blend: 'Overwrite' }
      ])
    );
  });

  it('rejects script paths and reports missing required resources without touching the source model', () => {
    const root = createFixture();
    const scriptPath = join(root, 'not-a-model.js');
    writeFileSync(scriptPath, 'throw new Error("must not execute")', 'utf8');
    expect(validateExternalModelPath(scriptPath)).toBe(false);
    expect(inspectExternalLive2DModel(scriptPath).status).toBe('invalid');

    rmSync(join(root, 'textures', 'texture_1.png'));
    const missing = inspectExternalLive2DModel(join(root, 'fixture.model3.json'));
    expect(missing.status).toBe('missing');
    expect(missing.issues.some((issue) => issue.includes('文件不存在'))).toBe(true);
    expect(missing.files.some((file) => file.fileName === 'fixture.moc3' && file.exists)).toBe(true);
  });

  it('diagnoses damaged JSON and rejects resource references that escape the model directory', () => {
    const damagedRoot = createFixture();
    writeFileSync(join(damagedRoot, 'fixture.physics3.json'), '{broken-json', 'utf8');
    const damaged = inspectExternalLive2DModel(join(damagedRoot, 'fixture.model3.json'));
    expect(damaged.status).toBe('invalid');
    expect(damaged.issues.some((issue) => issue.includes('JSON'))).toBe(true);

    const escapeRoot = createFixture();
    const modelPath = join(escapeRoot, 'fixture.model3.json');
    const model = JSON.parse(readFileSync(modelPath, 'utf8')) as {
      FileReferences: { Textures: string[] };
    };
    model.FileReferences.Textures[0] = '../outside.png';
    writeJson(modelPath, model);
    const escaped = inspectExternalLive2DModel(modelPath);
    expect(escaped.status).toBe('invalid');
    expect(escaped.issues.some((issue) => issue.includes('模型目录内的相对路径'))).toBe(true);
  });

  it('keeps action and expression categories separate and survives a 50-cycle semantic stress loop', () => {
    const root = createFixture();
    const adapter = inspectExternalLive2DModel(root).adapter!;
    const sequence = ['blush', 'cry', 'neutral', 'unknown', 'heart', 'neutral'];
    let state: Record<string, number> = {};
    for (let cycle = 0; cycle < 50; cycle += 1) {
      for (const semantic of sequence) {
        const applied = applyLive2DSemantic(state, adapter, semantic);
        state = applied.state;
        if (semantic === 'heart') {
          expect(applied.resolved.category).toBe('action');
        }
      }
    }
    const neutral = applyLive2DSemantic(state, adapter, 'neutral');
    expect(neutral.state.Param130).toBe(0);
    expect(neutral.state.Param131).toBe(0);
    expect(neutral.state.Param135).toBe(0);
  });
});
