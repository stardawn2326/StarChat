import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const electronPackagePath = resolve(testDirectory, '../../node_modules/electron/package.json');
const electronBinaryPath = resolve(testDirectory, '../../node_modules/electron/dist/electron.exe');

describe('Electron runtime binary', () => {
  it('has the locked 34.3.3 package and executable installed', () => {
    const installed = JSON.parse(readFileSync(electronPackagePath, 'utf8')) as { version?: string };

    expect(installed.version).toBe('34.3.3');
    expect(existsSync(electronBinaryPath)).toBe(true);
  });
});
