import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(import.meta.dirname, '../../../');

describe('third-party release notices', () => {
  it('keeps bundled Cubism license and notice files discoverable', () => {
    const notice = readFileSync(resolve(repositoryRoot, 'THIRD_PARTY_NOTICES.md'), 'utf8');
    const required = [
      'code/vendor/live2d-sdk-web/LICENSE.md',
      'code/vendor/live2d-sdk-web/Core/LICENSE.md',
      'code/vendor/live2d-sdk-web/NOTICE.md'
    ];
    for (const relativePath of required) {
      expect(existsSync(resolve(repositoryRoot, relativePath))).toBe(true);
      expect(notice).toContain(relativePath);
    }
    expect(existsSync(resolve(repositoryRoot, 'code/vendor/live2d-sdk-web/Core/live2dcubismcore.js'))).toBe(true);
  });
});
