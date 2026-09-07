import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { nextPetDragBounds } from '../../main/window-drag';
import { nextPetResizeBounds, type PetResizeEdge } from '../../shared/window-contract';
import { localPointForScreenAnchor, screenPointForLocalPoint } from './screen-space-anchor';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const canvasSource = readFileSync(resolve(testDirectory, 'Live2DCanvas.tsx'), 'utf8');
const petSource = readFileSync(resolve(testDirectory, 'PetApp.tsx'), 'utf8');
const runtimeSource = readFileSync(resolve(testDirectory, 'live2d-runtime.js'), 'utf8');
const preloadSource = readFileSync(resolve(testDirectory, '../../preload/index.ts'), 'utf8');
const mainSource = readFileSync(resolve(testDirectory, '../../main/index.ts'), 'utf8');

const edges: PetResizeEdge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

describe('PetWindow absolute model screen-anchor contract', () => {
  it('propagates window origin changes for both drag and resize before compensating the model locally', () => {
    expect(canvasSource).toContain('window.starchat.pet.onBoundsChange');
    expect(canvasSource).toContain('screenX: window.screenX');
    expect(canvasSource).toContain('screenY: window.screenY');
    expect(runtimeSource).toContain('const originChanged =');
    expect(runtimeSource).toContain('if (preserveModelScreenAnchor && (sizeChanged || originChanged) && model && modelScreenAnchor)');
  });

  it('keeps one model screen anchor fixed for every resize edge and corner', () => {
    const start = { x: 800, y: 300, width: 432, height: 600 };
    const startPoint = { screenX: 800, screenY: 300 };
    const anchor = screenPointForLocalPoint({ x: 216, y: 280 }, { x: start.x, y: start.y });

    for (const edge of edges) {
      const nextBounds = nextPetResizeBounds(
        start,
        startPoint,
        { screenX: startPoint.screenX + (edge.includes('w') ? -80 : edge.includes('e') ? 80 : 0), screenY: startPoint.screenY + (edge.includes('n') ? -60 : edge.includes('s') ? 60 : 0) },
        edge
      );
      const nextLocal = localPointForScreenAnchor(anchor, { x: nextBounds.x, y: nextBounds.y });
      expect(screenPointForLocalPoint(nextLocal, { x: nextBounds.x, y: nextBounds.y })).toEqual(anchor);
    }
  });

  it('keeps one model screen anchor fixed while the whole window translates', () => {
    const start = { x: 800, y: 300, width: 432, height: 600 };
    const anchor = screenPointForLocalPoint({ x: 216, y: 280 }, { x: start.x, y: start.y });
    const nextBounds = nextPetDragBounds(
      start,
      { screenX: 900, screenY: 500 },
      { screenX: 1035, screenY: 587 }
    );
    const nextLocal = localPointForScreenAnchor(anchor, { x: nextBounds.x, y: nextBounds.y });

    expect(screenPointForLocalPoint(nextLocal, { x: nextBounds.x, y: nextBounds.y })).toEqual(anchor);
  });

  it('keeps model-only dragging as the sole path that changes the persisted model offset', () => {
    expect(petSource).toContain("gesture.operation === 'model-transform'");
    expect(petSource).toContain('updateModelViewport({');
    expect(petSource).toContain('modelOffsetX: gesture.viewport.modelOffsetX + event.screenX - gesture.screenX');
    expect(petSource).toContain('persistModelViewport(viewportRef.current);');
  });

  it('carries the active pointer operation through bounds-changed into runtime anchor compensation', () => {
    expect(preloadSource).toContain('PetBoundsChange');
    expect(mainSource).toContain("? 'window-and-model-drag'");
    expect(canvasSource).toContain('petPointerOperationContract');
    expect(canvasSource).toContain('change.operation');
    expect(runtimeSource).toContain('preserveModelScreenAnchor');
    expect(runtimeSource).toContain('if (preserveModelScreenAnchor && (sizeChanged || originChanged) && model && modelScreenAnchor)');
  });

  it('bypasses the reverse screen-anchor write only for Alt whole-window drag', () => {
    const viewportPath = runtimeSource.slice(runtimeSource.indexOf('function applyRendererViewport'), runtimeSource.indexOf('function applyTransformTo'));
    expect(viewportPath).toContain('preserveModelScreenAnchor');
    expect(viewportPath).toContain('modelScreenAnchor = screenPointForLocalPoint');
    expect(viewportPath).toContain('model.position.set');
    expect(petSource).toContain("operation: 'window-and-model-drag'");
    expect(petSource).toContain("window.starchat.pet.dragStart");
    const altFinish = petSource.slice(petSource.indexOf("if (gesture.operation === 'window-and-model-drag')"), petSource.indexOf("if (gesture.operation === 'window-resize')"));
    expect(altFinish).not.toContain('updateModelViewport');
    expect(altFinish).not.toContain('persistModelViewport');
  });
});
