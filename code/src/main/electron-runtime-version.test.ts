import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(resolve(testDirectory, '../../package.json'), 'utf8')) as {
  devDependencies?: Record<string, string>;
};
const electronPackagePath = resolve(testDirectory, '../../node_modules/electron/package.json');
const electronBinaryPath = resolve(testDirectory, '../../node_modules/electron/dist/electron.exe');

describe('Electron runtime reproducibility', () => {
  it('uses the locked Electron 34.3.3 runtime instead of a stale installed version', () => {
    const installed = JSON.parse(readFileSync(electronPackagePath, 'utf8')) as { version?: string };

    expect(packageJson.devDependencies?.electron).toBe('34.3.3');
    expect(installed.version).toBe('34.3.3');
    expect(electronBinaryPath).toMatch(/electron\.exe$/i);
  });
});
