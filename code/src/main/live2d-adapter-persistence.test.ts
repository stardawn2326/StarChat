import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createParameterBindings, type Live2DAdapterConfig, type Live2DAdapterOverride, type Live2DModelRecord } from '../shared/live2d';
import { Live2DAdapterStore } from './live2d-adapter-store';
import { persistLive2DAdapterIntent } from './live2d-adapter-persistence';

function model(id: string, entryPath: string): Live2DModelRecord {
  return {
    id,
    displayName: id,
    sourcePath: entryPath,
    sourceKind: 'folder',
    runtimeDirectory: entryPath.replace(/[^/\\]+$/u, ''),
    entryPath,
    importedAt: 1,
    lastUsedAt: null,
    lastStatus: 'ready',
    lastMessage: 'ok'
  };
}

function override(sourceEntryPath: string, targetId: string, semanticSourceFile?: string): Live2DAdapterOverride {
  return {
    schemaVersion: 1,
    sourceEntryPath,
    parameterBindings: { mouth_open: targetId },
    ...(semanticSourceFile
      ? { semanticMappings: { blush: { sourceFile: semanticSourceFile, supported: true } } }
      : {}),
    updatedAt: 1
  };
}

function adapter(sourceEntryPath: string, overrides?: Live2DAdapterOverride): Live2DAdapterConfig {
  return {
    schemaVersion: 1,
    sourceEntryPath,
    modelVersion: 3,
    parameterBindings: createParameterBindings([
      { id: 'ParamMouthOpenY', groupId: 'Parameter', name: '嘴巴开合' }
    ]),
    semanticMappings: {},
    resetValues: {},
    ...(overrides ? { overrides } : {})
  };
}

describe('Live2D adapter persistence intent', () => {
  it('saves, updates, clears, and keeps overrides isolated across reloads', () => {
    const root = mkdtempSync(join(tmpdir(), 'starchat-adapter-persistence-'));
    const store = new Live2DAdapterStore(root);
    const a = model('model-a', 'C:/models/a.model3.json');
    const b = model('model-b', 'C:/models/b.model3.json');

    persistLive2DAdapterIntent(store, a, adapter(a.entryPath, override(a.entryPath, 'ParamMouthA')));
    expect(store.read(a.id)?.parameterBindings?.mouth_open).toBe('ParamMouthA');

    persistLive2DAdapterIntent(store, a, adapter(a.entryPath, override(a.entryPath, 'ParamMouthA2')));
    expect(store.read(a.id)?.parameterBindings?.mouth_open).toBe('ParamMouthA2');

    persistLive2DAdapterIntent(store, b, adapter(b.entryPath, override(b.entryPath, 'ParamMouthB')));
    persistLive2DAdapterIntent(
      store,
      a,
      adapter(a.entryPath, override(a.entryPath, 'ParamMouthA2', 'blush.exp3.json'))
    );
    const remainingParameterOverride = override(a.entryPath, 'ParamMouthA2');
    persistLive2DAdapterIntent(store, a, adapter(a.entryPath, remainingParameterOverride));
    expect(store.read(a.id)?.parameterBindings?.mouth_open).toBe('ParamMouthA2');
    expect(store.read(a.id)?.semanticMappings).toBeUndefined();

    persistLive2DAdapterIntent(store, a, adapter(a.entryPath));
    expect(store.read(a.id)).toBeNull();
    expect(store.read(b.id)?.parameterBindings?.mouth_open).toBe('ParamMouthB');

    const reloaded = new Live2DAdapterStore(root);
    expect(reloaded.read(a.id)).toBeNull();
    expect(reloaded.read(b.id)?.parameterBindings?.mouth_open).toBe('ParamMouthB');
  });

  it('does not change persisted state for undefined or null intent', () => {
    const root = mkdtempSync(join(tmpdir(), 'starchat-adapter-intent-'));
    const store = new Live2DAdapterStore(root);
    const a = model('model-a', 'C:/models/a.model3.json');
    persistLive2DAdapterIntent(store, a, adapter(a.entryPath, override(a.entryPath, 'ParamMouthA')));

    persistLive2DAdapterIntent(store, a, undefined);
    expect(store.read(a.id)?.parameterBindings?.mouth_open).toBe('ParamMouthA');

    persistLive2DAdapterIntent(store, a, null);
    expect(store.read(a.id)?.parameterBindings?.mouth_open).toBe('ParamMouthA');
  });
});
