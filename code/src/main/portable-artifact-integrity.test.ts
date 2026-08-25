import { createRequire } from 'node:module';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

interface AsarApi {
  listPackage(archivePath: string): string[];
  extractFile(archivePath: string, filePath: string): Buffer;
}

const testDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(testDirectory, '../../..');
const archivePath = join(projectRoot, 'outputs', 'win-unpacked', 'resources', 'app.asar');

function loadAsar(): AsarApi | null {
  const pnpmDirectory = join(projectRoot, 'code', 'node_modules', '.pnpm');
  if (!existsSync(pnpmDirectory)) return null;
  const packageDirectoryName = readdirSync(pnpmDirectory).find((name) => name.startsWith('@electron+asar@'));
  if (!packageDirectoryName) return null;
  const packageDirectory = join(pnpmDirectory, packageDirectoryName, 'node_modules', '@electron', 'asar');
  if (!existsSync(join(packageDirectory, 'package.json'))) return null;
  return createRequire(import.meta.url)(packageDirectory) as AsarApi;
}

function archivePathFor(list: readonly string[], suffix: string): string {
  const match = list.find((entry) => entry.replace(/\\/g, '/').replace(/^\/+/, '') === suffix);
  if (!match) throw new Error(`便携包缺少 ${suffix}`);
  return match.replace(/^\\/, '');
}

describe('portable renderer artifact integrity', () => {
  it('contains and resolves the packaged renderer entry, chunks, Cubism Core and shaders', () => {
    if (!existsSync(archivePath)) return;
    const asar = loadAsar();
    expect(asar).not.toBeNull();
    if (!asar) return;

    const list = asar.listPackage(archivePath);
    const rendererEntry = archivePathFor(list, 'out/renderer/index.html');
    const rendererHtml = asar.extractFile(archivePath, rendererEntry).toString('utf8');
    const references = [...rendererHtml.matchAll(/(?:src|href)="([^"]+)"/g)]
      .map((match) => match[1])
      .filter((reference) => reference.startsWith('./'))
      .map((reference) => `out/renderer/${reference.slice(2)}`);

    expect(references.length).toBeGreaterThanOrEqual(2);
    for (const reference of references) archivePathFor(list, reference);
    archivePathFor(list, 'out/main/index.js');
    archivePathFor(list, 'out/preload/index.cjs');
    expect(list.some((entry) => /^out\/renderer\/assets\/live2dcubismcore-[A-Za-z0-9_-]+\.js$/.test(entry.replace(/\\/g, '/').replace(/^\/+/, '')))).toBe(true);
    expect(list.some((entry) => entry.replace(/\\/g, '/').includes('out/renderer/live2d-shaders/'))).toBe(true);

    const rendererJs = references
      .filter((reference) => reference.endsWith('.js'))
      .map((reference) => reference.replace(/^out\/renderer\//, 'out/renderer/'));
    const visited = new Set<string>();
    const pending = [...rendererJs];
    while (pending.length > 0) {
      const reference = pending.shift();
      if (!reference || visited.has(reference)) continue;
      visited.add(reference);
      const entry = archivePathFor(list, reference);
      const source = asar.extractFile(archivePath, entry).toString('utf8');
      for (const match of source.matchAll(/\.\/([A-Za-z0-9._-]+\.js)/g)) {
        const dependency = `out/renderer/assets/${match[1]}`;
        archivePathFor(list, dependency);
        if (!visited.has(dependency)) pending.push(dependency);
      }
    }
    expect(visited.size).toBeGreaterThanOrEqual(2);
  });
});
