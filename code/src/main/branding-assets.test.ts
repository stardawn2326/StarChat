import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const codeRoot = resolve(testDirectory, '../..');
const projectRoot = resolve(codeRoot, '..');
const iconRoot = resolve(projectRoot, 'assets/icons');
const buildRoot = resolve(codeRoot, 'build');
const sourcePath = resolve(iconRoot, 'baoyin-source.png');
const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];

function readPngInfo(path: string): { width: number; height: number; bitDepth: number; colorType: number } {
  const data = readFileSync(path);
  expect(data.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
    bitDepth: data[24] ?? 0,
    colorType: data[25] ?? 0
  };
}

function readIcoDirectory(path: string): Array<{ width: number; height: number }> {
  const data = readFileSync(path);
  expect(data.readUInt16LE(0)).toBe(0);
  expect(data.readUInt16LE(2)).toBe(1);
  const count = data.readUInt16LE(4);
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    const offset = 6 + index * 16;
    entries.push({
      width: data[offset] === 0 ? 256 : data[offset] ?? 0,
      height: data[offset + 1] === 0 ? 256 : data[offset + 1] ?? 0
    });
  }
  return entries;
}

describe('Windows branding assets', () => {
  it('keeps the selected source inside the project as a transparent RGBA PNG', () => {
    const info = readPngInfo(sourcePath);
    expect(info).toMatchObject({ width: 1254, height: 1254, bitDepth: 8, colorType: 6 });
  });

  it('ships every required transparent icon and crisp tray size', () => {
    for (const size of sizes) {
      const info = readPngInfo(resolve(iconRoot, `baoyin-${size}.png`));
      expect(info).toMatchObject({ width: size, height: size, bitDepth: 8, colorType: 6 });
      const trayInfo = readPngInfo(resolve(iconRoot, `tray-${size}.png`));
      expect(trayInfo).toMatchObject({ width: size, height: size, bitDepth: 8, colorType: 6 });
    }
  });

  it('embeds all required frames in the final ICO and points builder/runtime at project assets', () => {
    expect(readIcoDirectory(resolve(buildRoot, 'icon.ico')).sort((a, b) => a.width - b.width)).toEqual(
      sizes.map((size) => ({ width: size, height: size }))
    );
    expect(readPngInfo(resolve(buildRoot, 'icon.png'))).toMatchObject({ width: 256, height: 256, bitDepth: 8, colorType: 6 });

    const packageJson = JSON.parse(readFileSync(resolve(codeRoot, 'package.json'), 'utf8')) as {
      build: { win: { icon: string }; extraResources: Array<{ from: string; to: string }> }
    };
    expect(packageJson.build.win.icon).toBe('build/icon.ico');
    expect(packageJson.build.extraResources).toContainEqual({ from: 'build/icon.png', to: 'icon.png' });
    expect(packageJson.build.extraResources).toContainEqual({ from: 'build/tray-32.png', to: 'tray-32.png' });

    const mainSource = readFileSync(resolve(testDirectory, 'index.ts'), 'utf8');
    expect(mainSource).toContain('icon: appIconPath()');
    expect(mainSource).toContain('nativeImage.createFromPath(iconPath)');
    expect(mainSource).toContain('appIconPath');
    expect(mainSource).toContain('trayIconPath');
  });
});
