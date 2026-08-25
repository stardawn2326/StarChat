import { createHash, randomUUID } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { basename, dirname, relative, resolve, sep } from 'node:path';
import type {
  Live2DModelRecord,
  Live2DModelState,
  Live2DModelStatus,
  Live2DModelSourceKind
} from '../shared/live2d';
import { inspectExternalLive2DModel } from './live2d-importer';

const REGISTRY_VERSION = 1;
const MAX_ZIP_BYTES = 256 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 2048;
const MAX_ZIP_ENTRY_BYTES = 128 * 1024 * 1024;
const MAX_ZIP_UNCOMPRESSED_BYTES = 512 * 1024 * 1024;
const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_LOCAL_SIGNATURE = 0x04034b50;

export interface Live2DModelRegistrySnapshot {
  schemaVersion: 1;
  currentModelId: string | null;
  models: Live2DModelRecord[];
}

export interface Live2DModelInspection {
  record: Live2DModelRecord;
  state: Live2DModelState;
}

export class Live2DModelRegistryError extends Error {
  constructor(message: string, readonly state?: Live2DModelState) {
    super(message);
    this.name = 'Live2DModelRegistryError';
  }
}

function isInside(rootPath: string, candidatePath: string): boolean {
  const child = relative(rootPath, candidatePath);
  return child !== '..' && !child.startsWith(`..${sep}`) && child !== '' && !child.startsWith(sep);
}

function sourceKindFor(selection: string): Live2DModelSourceKind {
  const lower = selection.toLowerCase();
  if (lower.endsWith('.zip')) return 'zip';
  return lower.endsWith('.model3.json') ? 'file' : 'folder';
}

function readyStatus(status: Live2DModelStatus): boolean {
  return status === 'ready' || status === 'ready_with_warnings';
}

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

function validateArchiveEntryName(name: string): string {
  const normalized = name.replaceAll('\\', '/');
  if (
    !normalized ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:/.test(normalized) ||
    normalized.split('/').some((part) => part === '..' || part.includes('\0'))
  ) {
    throw new Error('ZIP 条目路径不安全：' + name);
  }
  return normalized;
}

function archiveEntryName(name: string, cacheRoot: string): string {
  const normalized = validateArchiveEntryName(name);
  const destination = resolve(cacheRoot, ...normalized.split('/'));
  if (!isInside(cacheRoot, destination)) {
    throw new Error(`ZIP 条目越界：${name}`);
  }
  return normalized;
}

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  crc: number;
  localOffset: number;
  unixMode: number;
}

function findEndOfCentralDirectory(archive: Buffer): number {
  const first = Math.max(0, archive.length - (22 + 0xffff));
  for (let offset = archive.length - 22; offset >= first; offset -= 1) {
    if (archive.readUInt32LE(offset) === ZIP_EOCD_SIGNATURE) return offset;
  }
  throw new Error('ZIP 缺少中央目录结束记录');
}

function readZipEntries(archive: Buffer): ZipEntry[] {
  if (archive.length < 22) throw new Error('ZIP 文件过小');
  const endOffset = findEndOfCentralDirectory(archive);
  const disk = archive.readUInt16LE(endOffset + 4);
  const centralDisk = archive.readUInt16LE(endOffset + 6);
  const entriesOnDisk = archive.readUInt16LE(endOffset + 8);
  const entryCount = archive.readUInt16LE(endOffset + 10);
  const centralSize = archive.readUInt32LE(endOffset + 12);
  const centralOffset = archive.readUInt32LE(endOffset + 16);
  if (disk !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount) {
    throw new Error('不支持多磁盘 ZIP');
  }
  if (entryCount > MAX_ZIP_ENTRIES) {
    throw new Error(`ZIP 文件数量超过 ${MAX_ZIP_ENTRIES} 个限制`);
  }
  if (centralOffset + centralSize > archive.length || endOffset < centralOffset + centralSize) {
    throw new Error('ZIP 中央目录越界');
  }

  const entries: ZipEntry[] = [];
  let offset = centralOffset;
  let totalUncompressed = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > archive.length || archive.readUInt32LE(offset) !== ZIP_CENTRAL_SIGNATURE) {
      throw new Error('ZIP 中央目录条目损坏');
    }
    const flags = archive.readUInt16LE(offset + 8);
    const method = archive.readUInt16LE(offset + 10);
    const crc = archive.readUInt32LE(offset + 16);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const uncompressedSize = archive.readUInt32LE(offset + 24);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const unixMode = (archive.readUInt32LE(offset + 38) >>> 16) & 0xffff;
    const localOffset = archive.readUInt32LE(offset + 42);
    const end = offset + 46 + nameLength + extraLength + commentLength;
    if (end > archive.length || compressedSize > MAX_ZIP_ENTRY_BYTES || uncompressedSize > MAX_ZIP_ENTRY_BYTES) {
      throw new Error('ZIP 条目大小超过安全限制');
    }
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
      throw new Error('不支持 ZIP64 条目');
    }
    if ((flags & 0x1) !== 0) throw new Error('不支持加密 ZIP 条目');
    const name = archive.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    validateArchiveEntryName(name);
    const modeType = unixMode & 0xf000;
    if (modeType === 0xa000) throw new Error(`ZIP 不允许符号链接条目：${name}`);
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > MAX_ZIP_UNCOMPRESSED_BYTES) {
      throw new Error(`ZIP 解压总大小超过 ${MAX_ZIP_UNCOMPRESSED_BYTES} 字节限制`);
    }
    entries.push({ name, method, compressedSize, uncompressedSize, crc, localOffset, unixMode });
    offset = end;
  }
  return entries;
}

function extractZipArchive(archivePath: string, destination: string): string {
  const stats = statSync(archivePath);
  if (!stats.isFile()) throw new Error('ZIP 选择不是文件');
  if (stats.size > MAX_ZIP_BYTES) throw new Error(`ZIP 压缩包超过 ${MAX_ZIP_BYTES} 字节限制`);
  const archive = readFileSync(archivePath);
  const entries = readZipEntries(archive);
  mkdirSync(destination, { recursive: true });
  const modelEntries: string[] = [];
  for (const entry of entries) {
    const name = archiveEntryName(entry.name, destination);
    if (name.startsWith('__MACOSX/') || basename(name).startsWith('._') || basename(name) === '.DS_Store') continue;
    if (name.toLowerCase().endsWith('.model3.json')) modelEntries.push(name);
    if (entry.uncompressedSize === 0 && name.endsWith('/')) continue;
    if (entry.localOffset + 30 > archive.length || archive.readUInt32LE(entry.localOffset) !== ZIP_LOCAL_SIGNATURE) {
      throw new Error(`ZIP 本地条目损坏：${name}`);
    }
    const localNameLength = archive.readUInt16LE(entry.localOffset + 26);
    const localExtraLength = archive.readUInt16LE(entry.localOffset + 28);
    const dataOffset = entry.localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataOffset + entry.compressedSize;
    if (dataEnd > archive.length) throw new Error(`ZIP 条目数据越界：${name}`);
    const compressed = archive.subarray(dataOffset, dataEnd);
    let data: Buffer;
    if (entry.method === 0) data = Buffer.from(compressed);
    else if (entry.method === 8) data = inflateRawSync(compressed);
    else throw new Error(`ZIP 条目压缩方法不支持：${entry.method}`);
    if (data.length !== entry.uncompressedSize || crc32(data) !== entry.crc) {
      throw new Error(`ZIP 条目校验失败：${name}`);
    }
    const destinationPath = resolve(destination, ...name.split('/'));
    mkdirSync(dirname(destinationPath), { recursive: true });
    writeFileSync(destinationPath, data);
  }
  if (modelEntries.length === 0) {
    const legacy = entries.some((entry) => entry.name.toLowerCase().endsWith('.model.json'));
    throw new Error(legacy ? 'ZIP 内是 Cubism 2 legacy model.json，明确不支持。' : 'ZIP 内没有 .model3.json 入口。');
  }
  if (modelEntries.length > 1) throw new Error('ZIP 内含多个 .model3.json，请只保留一个模型入口。');
  return resolve(destination, ...modelEntries[0].split('/'));
}

function readSnapshotFile(path: string): Live2DModelRegistrySnapshot {
  if (!existsSync(path)) return { schemaVersion: REGISTRY_VERSION, currentModelId: null, models: [] };
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<Live2DModelRegistrySnapshot>;
    const models = Array.isArray(parsed.models)
      ? parsed.models.filter((model): model is Live2DModelRecord => Boolean(
        model && typeof model.id === 'string' && typeof model.sourcePath === 'string' && typeof model.entryPath === 'string'
        && typeof model.runtimeDirectory === 'string' && typeof model.sourceKind === 'string'
      ))
      : [];
    return {
      schemaVersion: REGISTRY_VERSION,
      currentModelId: typeof parsed.currentModelId === 'string' ? parsed.currentModelId : null,
      models
    };
  } catch {
    return { schemaVersion: REGISTRY_VERSION, currentModelId: null, models: [] };
  }
}

function errorForState(state: Live2DModelState): Live2DModelRegistryError {
  return new Live2DModelRegistryError(`${state.message}${state.issues[0] ? `：${state.issues[0]}` : ''}`, state);
}

export class Live2DModelRegistry {
  private readonly registryPath: string;
  private readonly cacheRoot: string;

  constructor(private readonly userDataDir: string) {
    this.registryPath = resolve(userDataDir, 'live2d-models.json');
    this.cacheRoot = resolve(userDataDir, 'live2d-model-cache');
  }

  readSnapshot(): Live2DModelRegistrySnapshot {
    return readSnapshotFile(this.registryPath);
  }

  list(): Live2DModelRecord[] {
    return this.readSnapshot().models;
  }

  current(): Live2DModelRecord | null {
    const snapshot = this.readSnapshot();
    return snapshot.models.find((model) => model.id === snapshot.currentModelId) ?? null;
  }

  private save(snapshot: Live2DModelRegistrySnapshot): void {
    mkdirSync(this.userDataDir, { recursive: true });
    writeFileSync(this.registryPath, JSON.stringify(snapshot, null, 2), 'utf8');
  }

  private updateRecord(record: Live2DModelRecord): void {
    const snapshot = this.readSnapshot();
    const index = snapshot.models.findIndex((candidate) => candidate.id === record.id);
    if (index >= 0) snapshot.models[index] = record;
    else snapshot.models.push(record);
    this.save(snapshot);
  }

  private createRecord(sourcePath: string, sourceKind: Live2DModelSourceKind, state: Live2DModelState, now = Date.now()): Live2DModelRecord {
    if (!state.entryPath || !state.directoryPath) throw errorForState(state);
    const existing = this.readSnapshot().models.find((model) => model.sourcePath === sourcePath);
    return {
      id: existing?.id ?? `live2d.${randomUUID()}`,
      displayName: basename(state.entryPath),
      sourcePath,
      sourceKind,
      runtimeDirectory: state.directoryPath,
      entryPath: state.entryPath,
      importedAt: existing?.importedAt ?? now,
      lastUsedAt: existing?.lastUsedAt ?? null,
      lastStatus: state.status,
      lastMessage: state.message
    };
  }

  importSelection(selection: string): Live2DModelInspection {
    const sourcePath = resolve(selection.trim());
    const kind = sourceKindFor(sourcePath);
    const existing = this.readSnapshot().models.find((model) => model.sourcePath === sourcePath);
    if (existing && kind !== 'zip') {
      const inspected = this.inspectModel(existing.id);
      if (readyStatus(inspected.state.status)) return inspected;
    }
    if (kind !== 'zip') {
      const state = inspectExternalLive2DModel(sourcePath);
      if (!readyStatus(state.status)) throw errorForState(state);
      const record = this.createRecord(sourcePath, kind, state);
      this.updateRecord(record);
      return { record, state };
    }

    if (existing && existsSync(existing.entryPath)) {
      const inspected = this.inspectModel(existing.id);
      if (readyStatus(inspected.state.status)) return inspected;
    }
    const id = `live2d.${randomUUID()}`;
    const destination = resolve(this.cacheRoot, id);
    try {
      const entryPath = extractZipArchive(sourcePath, destination);
      const state = inspectExternalLive2DModel(entryPath);
      if (!readyStatus(state.status)) throw errorForState(state);
      const record = this.createRecord(sourcePath, kind, state);
      record.id = id;
      this.updateRecord(record);
      return { record, state };
    } catch (error) {
      rmSync(destination, { recursive: true, force: true });
      if (error instanceof Live2DModelRegistryError) throw error;
      throw new Live2DModelRegistryError(error instanceof Error ? error.message : String(error));
    }
  }

  inspectModel(id: string): Live2DModelInspection {
    const record = this.readSnapshot().models.find((candidate) => candidate.id === id);
    if (!record) throw new Error('模型记录不存在');
    const state = inspectExternalLive2DModel(record.entryPath);
    const next = { ...record, lastStatus: state.status, lastMessage: state.message };
    this.updateRecord(next);
    return { record: next, state };
  }

  findByEntryPath(entryPath: string): Live2DModelRecord | null {
    const normalized = resolve(entryPath);
    return this.readSnapshot().models.find((model) => resolve(model.entryPath) === normalized) ?? null;
  }

  switchModel(id: string): Live2DModelInspection {
    const inspected = this.inspectModel(id);
    if (!readyStatus(inspected.state.status)) throw errorForState(inspected.state);
    this.setCurrentModel(id);
    return inspected;
  }

  setCurrentModel(id: string | null): void {
    const snapshot = this.readSnapshot();
    if (id !== null && !snapshot.models.some((model) => model.id === id)) throw new Error('模型记录不存在');
    snapshot.currentModelId = id;
    const now = Date.now();
    snapshot.models = snapshot.models.map((model) => model.id === id ? { ...model, lastUsedAt: now } : model);
    this.save(snapshot);
  }

  markRuntimeFailure(id: string, message: string): void {
    const record = this.readSnapshot().models.find((candidate) => candidate.id === id);
    if (!record) return;
    this.updateRecord({ ...record, lastStatus: 'invalid', lastMessage: message });
  }

  ensureLegacyPath(entryPath: string | null): Live2DModelRecord | null {
    if (!entryPath || !entryPath.trim()) return null;
    const normalized = resolve(entryPath);
    const existing = this.readSnapshot().models.find((model) => resolve(model.entryPath) === normalized);
    if (existing) return existing;
    const state = inspectExternalLive2DModel(normalized);
    const directory = state.directoryPath ?? dirname(normalized);
    const record: Live2DModelRecord = {
      id: `live2d.legacy.${createHash('sha1').update(normalized).digest('hex').slice(0, 16)}`,
      displayName: basename(state.entryPath ?? normalized),
      sourcePath: normalized,
      sourceKind: statSync(normalized, { throwIfNoEntry: false })?.isDirectory() ? 'folder' : 'file',
      runtimeDirectory: directory,
      entryPath: state.entryPath ?? normalized,
      importedAt: Date.now(),
      lastUsedAt: null,
      lastStatus: state.status,
      lastMessage: state.message
    };
    this.updateRecord(record);
    return record;
  }

  removeModel(id: string): void {
    const snapshot = this.readSnapshot();
    const record = snapshot.models.find((model) => model.id === id);
    if (!record) return;
    const cacheRoot = resolve(this.cacheRoot);
    const runtimeDirectory = resolve(record.runtimeDirectory);
    if (record.sourceKind === 'zip' && isInside(cacheRoot, runtimeDirectory)) {
      rmSync(runtimeDirectory, { recursive: true, force: true });
    }
    snapshot.models = snapshot.models.filter((model) => model.id !== id);
    if (snapshot.currentModelId === id) snapshot.currentModelId = null;
    this.save(snapshot);
  }
}

export const LIVE2D_MODEL_LIMITS = {
  maxZipBytes: MAX_ZIP_BYTES,
  maxZipEntries: MAX_ZIP_ENTRIES,
  maxZipEntryBytes: MAX_ZIP_ENTRY_BYTES,
  maxZipUncompressedBytes: MAX_ZIP_UNCOMPRESSED_BYTES
} as const;
