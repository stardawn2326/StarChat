import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const rendererSource = readFileSync(resolve(testDirectory, 'PetApp.tsx'), 'utf8');
const mainSource = readFileSync(resolve(testDirectory, '../../main/index.ts'), 'utf8');

describe('PetWindow pointer transaction contracts', () => {
  it('terminates the active gesture on pointerup, pointercancel, and window blur', () => {
    expect(rendererSource).toContain("window.addEventListener('pointerup'");
    expect(rendererSource).toContain("window.addEventListener('pointercancel'");
    expect(rendererSource).toContain("window.addEventListener('blur'");
    expect(rendererSource).toContain('cancelActivePointer');
  });

  it('cancels main-process drag and resize transactions when the pet loses focus', () => {
    expect(mainSource).toContain('cancelPetPointerTransactions');
    expect(mainSource).toContain('petDragStart = null');
    expect(mainSource).toContain('petResizeStart = null');
    expect(rendererSource).not.toContain('}, [hitRegion, interactionMode, modelEditMode]);');
  });

  it('uses the shared north/west origin compensation helper during resize', () => {
    expect(rendererSource).toContain('compensateModelViewportForWindowOrigin');
  });
});
