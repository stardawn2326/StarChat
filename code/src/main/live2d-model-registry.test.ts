import { deflateRawSync } from 'node:zlib';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { inspectExternalLive2DModel } from './live2d-importer';
import { Live2DModelRegistry } from './live2d-model-registry';
import { transactionalModelSwitch } from './live2d-switch';
import { DEFAULT_APP_SETTINGS } from '../shared/settings';
import { SettingsStore } from './settings-store';

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

const roots: string[] = [];

function crc32(input: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of input) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(entries: Array<{ name: string; data: Buffer; deflate?: boolean }>): Buffer {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const compressed = entry.deflate ? deflateRawSync(entry.data) : entry.data;
    const method = entry.deflate ? 8 : 0;
    const localHeader = Buffer.alloc(30 + name.length);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt32LE(crc32(entry.data), 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    name.copy(localHeader, 30);
    local.push(localHeader, compressed);

    const centralHeader = Buffer.alloc(46 + name.length);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt32LE(crc32(entry.data), 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(entry.data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE(offset, 42);
    name.copy(centralHeader, 46);
    central.push(centralHeader);
    offset += localHeader.length + compressed.length;
  }
  const centralBody = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBody.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralBody, end]);
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2), 'utf8');
}

function createModelRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'baoyin-model-registry-'));
  roots.push(root);
  writeFileSync(join(root, 'model.moc3'), Buffer.from('moc3'));
  writeFileSync(join(root, 'texture.png'), ONE_PIXEL_PNG);
  writeJson(join(root, 'model.cdi3.json'), {
    Version: 3,
    Parameters: [{ Id: 'ParamAngleX', GroupId: 'test', Name: '角度 X' }]
  });
  writeJson(join(root, 'model.model3.json'), {
    Version: 3,
    FileReferences: {
      Moc: 'model.moc3',
      Textures: ['texture.png'],
      DisplayInfo: 'model.cdi3.json',
      Physics: 'missing.physics3.json',
      Pose: 'missing.pose3.json'
    }
  });
  return root;
}

function modelEntries(root: string): Array<{ name: string; data: Buffer; deflate?: boolean }> {
  return [
    { name: 'nested/model.moc3', data: readFileSync(join(root, 'model.moc3')) },
    { name: 'nested/texture.png', data: readFileSync(join(root, 'texture.png'),) , deflate: true },
    { name: 'nested/model.cdi3.json', data: readFileSync(join(root, 'model.cdi3.json')), deflate: true },
    { name: 'nested/model.model3.json', data: readFileSync(join(root, 'model.model3.json')), deflate: true }
  ];
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe('external Live2D model registry', () => {
  it('imports a folder and a ZIP into a user-data cache without changing external sources', () => {
    const source = createModelRoot();
    const userData = mkdtempSync(join(tmpdir(), 'baoyin-user-data-'));
    roots.push(userData);
    const archive = join(source, 'model.zip');
    writeFileSync(archive, zip(modelEntries(source)));
    const registry = new Live2DModelRegistry(userData);

    const folder = registry.importSelection(source);
    const zipped = registry.importSelection(archive);

    expect(folder.state.status).toBe('ready_with_warnings');
    expect(folder.record.sourceKind).toBe('folder');
    expect(zipped.record.sourceKind).toBe('zip');
    expect(zipped.record.sourcePath).toBe(archive);
    expect(zipped.record.entryPath).toContain('live2d-model-cache');
    expect(zipped.state.entryPath).toBe(zipped.record.entryPath);
    expect(statSync(archive).isFile()).toBe(true);
    expect(statSync(join(source, 'model.model3.json')).isFile()).toBe(true);
  });

  it('rejects ZIP Slip and archives beyond the configured entry boundary', () => {
    const source = createModelRoot();
    const userData = mkdtempSync(join(tmpdir(), 'baoyin-user-data-'));
    roots.push(userData);
    const archive = join(source, 'unsafe.zip');
    writeFileSync(archive, zip([{ name: '../outside.txt', data: Buffer.from('blocked') }]));
    const registry = new Live2DModelRegistry(userData);

    expect(() => registry.importSelection(archive)).toThrow(/路径|ZIP|安全/);
  });

  it('persists current selection, supports recovery after source loss, and removes records without deleting external folders', () => {
    const source = createModelRoot();
    const userData = mkdtempSync(join(tmpdir(), 'baoyin-user-data-'));
    roots.push(userData);
    const registry = new Live2DModelRegistry(userData);
    const imported = registry.importSelection(source);
    const switched = registry.switchModel(imported.record.id);

    expect(switched.record.id).toBe(imported.record.id);
    expect(registry.readSnapshot().currentModelId).toBe(imported.record.id);
    expect(new Live2DModelRegistry(userData).readSnapshot().currentModelId).toBe(imported.record.id);

    rmSync(source, { recursive: true, force: true });
    const stale = registry.inspectModel(imported.record.id);
    expect(stale.state.status).toBe('missing');
    expect(stale.record.sourcePath).toBe(source);
    registry.removeModel(imported.record.id);
    expect(registry.readSnapshot().models).toHaveLength(0);
  });

  it('keeps the previous runtime model when candidate initialization fails', async () => {
    const result = await transactionalModelSwitch(
      { id: 'old', entryPath: 'old.model3.json' },
      { id: 'new', entryPath: 'new.model3.json' },
      async (candidate) => {
        if (candidate.id === 'new') throw new Error('纹理阶段失败：texture.png');
        return candidate;
      }
    );

    expect(result.committed).toBe(false);
    expect(result.active).toEqual({ id: 'old', entryPath: 'old.model3.json' });
    expect(result.error?.stage).toBe('initialize');
    expect(result.error?.message).toContain('texture.png');
  });

  it('preserves window and behavior settings while changing only the current model path', () => {
    const userData = mkdtempSync(join(tmpdir(), 'baoyin-user-data-'));
    roots.push(userData);
    const store = new SettingsStore(userData);
    store.save({
      live2dModelPath: 'C:/models/old.model3.json',
      petLocked: true,
      alwaysOnTop: false,
      petBounds: { x: 120, y: 240, width: 430, height: 600 },
      modelViewportByModel: { 'c:/models/old.model3.json': { ...DEFAULT_APP_SETTINGS.modelViewportByModel['c:/models/old.model3.json'], modelScale: 1.4 } }
    });
    const next = store.save({ live2dModelPath: 'C:/models/new.model3.json' });
    expect(next).toMatchObject({
      live2dModelPath: 'C:/models/new.model3.json',
      petLocked: true,
      alwaysOnTop: false,
      petBounds: { x: 120, y: 240, width: 430, height: 600 }
    });
    expect(next.modelViewportByModel['c:/models/old.model3.json']?.modelScale).toBe(1.4);
  });

  it('does not add external model directories or caches to the production build inputs', () => {
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as { build?: { files?: string[]; extraResources?: Array<{ from?: string; to?: string }> } };
    const buildText = JSON.stringify(packageJson.build ?? {}).toLowerCase();
    expect(buildText).not.toContain('live2d-model-cache');
    expect(buildText).not.toContain('external-model');
    expect(buildText).not.toContain('user-data');
  });
});

describe('model3 compatibility boundaries', () => {
  it('reports missing optional assets as warnings and rejects Cubism 2 explicitly', () => {
    const root = createModelRoot();
    const state = inspectExternalLive2DModel(root);
    expect(state.status).toBe('ready_with_warnings');
    expect(state.warnings.some((warning) => warning.includes('Physics'))).toBe(true);
    expect(state.warnings.some((warning) => warning.includes('Pose'))).toBe(true);

    const legacy = resolve(root, 'legacy.model.json');
    writeJson(legacy, { Version: 2, FileReferences: {} });
    const rejected = inspectExternalLive2DModel(legacy);
    expect(rejected.status).toBe('invalid');
    expect(rejected.message).toContain('Cubism 2');
    expect(rejected.issues.join('\n')).toContain('不支持');
  });
});
