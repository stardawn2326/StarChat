import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const mainSource = readFileSync(resolve(testDirectory, '../main/index.ts'), 'utf8');
const petSource = readFileSync(resolve(testDirectory, '../renderer/src/PetApp.tsx'), 'utf8');
const runtimeSource = readFileSync(resolve(testDirectory, '../renderer/src/live2d-runtime.js'), 'utf8');

describe('PetWindow input contracts', () => {
  it('uses one canonical interaction policy in both main and renderer paths', () => {
    expect(mainSource).toContain('petInteractionEnabled(');
    expect(petSource).toContain('petInteractionEnabled(');
    expect(mainSource).not.toContain('settings.petInteractionMode');
    expect(petSource).not.toContain('settings.petInteractionMode');
  });

  it('uses runtime hit areas and a rendered-bounds fallback instead of a fixed ellipse', () => {
    expect(petSource).toContain('classifyPetHit(');
    expect(runtimeSource).toContain('hitAreas');
    expect(runtimeSource).toContain('getBounds');
    expect(runtimeSource).toContain('renderedBounds');
    expect(runtimeSource).not.toContain('isModelApproximation');
  });

  it('keeps model, resize frame, and transparent remainder mutually exclusive', () => {
    expect(petSource).toContain('hitRegion');
    expect(petSource).toContain("hitRegion === 'frame'");
    expect(petSource).toContain("hitRegion === 'model'");
    expect(petSource).toContain("hitRegion === 'transparent'");
  });
});
