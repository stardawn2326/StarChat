import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { Live2DAdapterStore } from './live2d-adapter-store';
import type { Live2DAdapterOverride, Live2DModelRecord } from '../shared/live2d';

function override(sourceEntryPath: string, targetId: string): Live2DAdapterOverride {
  return { schemaVersion: 1, sourceEntryPath, parameterBindings: { mouth_open: targetId }, updatedAt: 1 };
}

function model(id: string, entryPath: string): Live2DModelRecord {
  return { id, displayName: id, sourcePath: entryPath, sourceKind: 'folder', runtimeDirectory: entryPath.replace(/[^/\\]+$/u, ''), entryPath, importedAt: 1, lastUsedAt: null, lastStatus: 'ready', lastMessage: 'ok' };
}

describe('Live2D model adapter store', () => {
  it('keeps A/B overrides isolated and stable across reloads and reimport', () => {
    const root = mkdtempSync(join(tmpdir(), 'starchat-adapter-store-'));
    const store = new Live2DAdapterStore(root);
    const a = model('model-a', 'C:/models/a.model3.json');
    const b = model('model-b', 'C:/models/b.model3.json');
    store.save(a.id, override(a.entryPath, 'ParamMouthA'));
    store.save(b.id, override(b.entryPath, 'ParamMouthB'));
    const reloaded = new Live2DAdapterStore(root);
    expect(reloaded.read(a.id)?.parameterBindings?.mouth_open).toBe('ParamMouthA');
    expect(reloaded.read(b.id)?.parameterBindings?.mouth_open).toBe('ParamMouthB');
    reloaded.remove(b.id);
    expect(reloaded.read(a.id)?.parameterBindings?.mouth_open).toBe('ParamMouthA');
    expect(new Live2DAdapterStore(root).read(a.id)?.parameterBindings?.mouth_open).toBe('ParamMouthA');
  });

  it('migrates legacy override only when the source entry path matches', () => {
    const root = mkdtempSync(join(tmpdir(), 'starchat-adapter-legacy-'));
    const legacyPath = join(root, 'live2d-adapter.json');
    const legacy = { overrides: override('C:/models/a.model3.json', 'ParamLegacy') };
    writeFileSync(legacyPath, JSON.stringify(legacy), 'utf8');
    const store = new Live2DAdapterStore(root);
    const result = store.migrateLegacy(legacyPath, [model('model-a', 'C:/models/a.model3.json'), model('model-b', 'C:/models/b.model3.json')]);
    expect(result).toMatchObject({ migrated: true, modelId: 'model-a' });
    expect(result.backupPath && existsSync(result.backupPath)).toBe(true);
    expect(result.migratedPath && existsSync(result.migratedPath)).toBe(true);
    expect(existsSync(legacyPath)).toBe(false);
    expect(store.read('model-a')?.parameterBindings?.mouth_open).toBe('ParamLegacy');
    expect(store.read('model-b')).toBeNull();

    store.remove('model-a');
    const second = store.migrateLegacy(legacyPath, [model('model-a', 'C:/models/a.model3.json')]);
    expect(second.migrated).toBe(false);
    expect(store.read('model-a')).toBeNull();
  });

  it('backs up an unmatched legacy adapter without applying it to another model', () => {
    const root = mkdtempSync(join(tmpdir(), 'starchat-adapter-unmatched-'));
    const legacyPath = join(root, 'live2d-adapter.json');
    writeFileSync(legacyPath, JSON.stringify({ overrides: override('C:/models/removed.model3.json', 'ParamRemoved') }), 'utf8');
    const store = new Live2DAdapterStore(root);
    const result = store.migrateLegacy(legacyPath, [model('model-b', 'C:/models/b.model3.json')]);
    expect(result.migrated).toBe(false);
    expect(result.backupPath && existsSync(result.backupPath)).toBe(true);
    expect(store.read('model-b')).toBeNull();
  });
});
