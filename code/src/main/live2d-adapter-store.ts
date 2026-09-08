import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { applyLive2DAdapterOverride, type Live2DAdapterConfig, type Live2DAdapterOverride, type Live2DModelRecord } from '../shared/live2d';

export interface Live2DAdapterOverrideSnapshot {
  version: 1;
  overrides: Record<string, Live2DAdapterOverride>;
}

export interface LegacyLive2DAdapterMigrationResult {
  migrated: boolean;
  backupPath: string | null;
  migratedPath: string | null;
  modelId: string | null;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function samePath(left: string, right: string): boolean {
  try {
    return resolve(left).toLocaleLowerCase() === resolve(right).toLocaleLowerCase();
  } catch {
    return left.replaceAll('\\', '/').toLocaleLowerCase() === right.replaceAll('\\', '/').toLocaleLowerCase();
  }
}

function normalizeOverride(value: unknown): Live2DAdapterOverride | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Partial<Live2DAdapterOverride>;
  if (source.schemaVersion !== 1 || typeof source.sourceEntryPath !== 'string' || !source.sourceEntryPath.trim()) return null;
  const parameterBindings = source.parameterBindings && typeof source.parameterBindings === 'object'
    ? Object.fromEntries(Object.entries(source.parameterBindings).filter(([, target]) => typeof target === 'string' && target.trim()))
    : undefined;
  const semanticMappings = source.semanticMappings && typeof source.semanticMappings === 'object'
    ? Object.fromEntries(Object.entries(source.semanticMappings).filter(([, route]) => Boolean(route && typeof route === 'object')))
    : undefined;
  return {
    schemaVersion: 1,
    sourceEntryPath: source.sourceEntryPath.trim(),
    ...(parameterBindings && Object.keys(parameterBindings).length > 0 ? { parameterBindings } : {}),
    ...(semanticMappings && Object.keys(semanticMappings).length > 0 ? { semanticMappings } : {}),
    updatedAt: Number.isFinite(source.updatedAt) ? Number(source.updatedAt) : Date.now()
  };
}

function emptySnapshot(): Live2DAdapterOverrideSnapshot {
  return { version: 1, overrides: {} };
}

export class Live2DAdapterStore {
  private readonly filePath: string;

  constructor(private readonly userDataDir: string) {
    this.filePath = resolve(userDataDir, 'live2d-adapter-overrides.json');
    mkdirSync(userDataDir, { recursive: true });
  }

  readSnapshot(): Live2DAdapterOverrideSnapshot {
    if (!existsSync(this.filePath)) return emptySnapshot();
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<Live2DAdapterOverrideSnapshot>;
      const overrides = parsed.overrides && typeof parsed.overrides === 'object'
        ? Object.fromEntries(Object.entries(parsed.overrides)
            .map(([modelId, value]) => [modelId, normalizeOverride(value)] as const)
            .filter((entry): entry is [string, Live2DAdapterOverride] => Boolean(entry[1])))
        : {};
      return { version: 1, overrides };
    } catch {
      return emptySnapshot();
    }
  }

  read(modelId: string): Live2DAdapterOverride | null {
    const override = this.readSnapshot().overrides[modelId];
    return override ? clone(override) : null;
  }

  save(modelId: string, value: Live2DAdapterOverride): Live2DAdapterOverride {
    const override = normalizeOverride(value);
    if (!modelId.trim() || !override) throw new Error('Live2D 模型适配器覆盖无效');
    const snapshot = this.readSnapshot();
    snapshot.overrides[modelId] = override;
    this.write(snapshot);
    return clone(override);
  }

  remove(modelId: string): void {
    const snapshot = this.readSnapshot();
    if (!(modelId in snapshot.overrides)) return;
    delete snapshot.overrides[modelId];
    this.write(snapshot);
  }

  resolve(model: Live2DModelRecord, adapter: Live2DAdapterConfig | null): Live2DAdapterConfig | null {
    if (!adapter) return null;
    return applyLive2DAdapterOverride(adapter, this.read(model.id));
  }

  migrateLegacy(legacyPath: string, models: readonly Live2DModelRecord[]): LegacyLive2DAdapterMigrationResult {
    if (!existsSync(legacyPath)) return { migrated: false, backupPath: null, migratedPath: null, modelId: null };
    const migratedPath = resolve(dirname(legacyPath), 'live2d-adapter.v1.migrated.json');
    if (existsSync(migratedPath)) return { migrated: false, backupPath: null, migratedPath, modelId: null };
    let legacy: Live2DAdapterConfig | null = null;
    try {
      legacy = JSON.parse(readFileSync(legacyPath, 'utf8')) as Live2DAdapterConfig;
    } catch {
      legacy = null;
    }
    const backupPath = resolve(dirname(legacyPath), 'live2d-adapter.v1.backup.json');
    if (!existsSync(backupPath)) writeFileSync(backupPath, readFileSync(legacyPath), 'utf8');
    const legacyOverride = normalizeOverride(legacy?.overrides);
    if (!legacyOverride) return { migrated: false, backupPath, migratedPath: null, modelId: null };
    const model = models.find((candidate) => samePath(candidate.entryPath, legacyOverride.sourceEntryPath));
    if (!model) return { migrated: false, backupPath, migratedPath: null, modelId: null };
    if (!this.read(model.id)) this.save(model.id, legacyOverride);
    renameSync(legacyPath, migratedPath);
    return { migrated: true, backupPath, migratedPath, modelId: model.id };
  }

  private write(snapshot: Live2DAdapterOverrideSnapshot): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;
    writeFileSync(temporary, JSON.stringify(snapshot, null, 2), 'utf8');
    renameSync(temporary, this.filePath);
  }
}
