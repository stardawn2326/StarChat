import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { nextPetResizeBounds, type PetResizeEdge } from '../../shared/window-contract';
import { localPointForScreenAnchor, screenPointForLocalPoint } from './screen-space-anchor';
import { createViewportSyncCoordinator, type ViewportFrame } from './viewport-sync';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const canvasSource = readFileSync(resolve(testDirectory, 'Live2DCanvas.tsx'), 'utf8');
const petSource = readFileSync(resolve(testDirectory, 'PetApp.tsx'), 'utf8');

const edges: PetResizeEdge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

function frame(bounds: { x: number; y: number; width: number; height: number }, preserveModelScreenAnchor = true): ViewportFrame {
  return {
    width: bounds.width,
    height: bounds.height,
    renderScale: 1,
    screenX: bounds.x,
    screenY: bounds.y,
    preserveModelScreenAnchor
  };
}

describe('PetWindow continuous viewport synchronization contract', () => {
  it('keeps the latest authoritative origin through observer/window/bounds reordering for every edge', () => {
    const applied: ViewportFrame[] = [];
    const coordinator = createViewportSyncCoordinator((next) => applied.push(next));
    const start = { x: 800, y: 300, width: 432, height: 600 };
    coordinator.submit('initial', frame(start));

    for (const edge of edges) {
      for (const step of [1, 2, 3, 4]) {
        const nextBounds = nextPetResizeBounds(
          start,
          { screenX: start.x, screenY: start.y },
          {
            screenX: start.x + (edge.includes('w') ? -80 : edge.includes('e') ? 80 : 0) * step,
            screenY: start.y + (edge.includes('n') ? -60 : edge.includes('s') ? 60 : 0) * step
          },
          edge
        );
        applied.length = 0;
        coordinator.submit('resize-observer', { ...frame(nextBounds), screenX: start.x, screenY: start.y });
        coordinator.submit('window-resize', frame(nextBounds));
        coordinator.submit('bounds', frame(nextBounds));
        coordinator.submit('resize-observer', { ...frame(nextBounds), screenX: start.x, screenY: start.y });
        coordinator.flush();

        expect(applied).toHaveLength(1);
        const anchor = screenPointForLocalPoint({ x: 216, y: 280 }, { x: start.x, y: start.y });
        const local = localPointForScreenAnchor(anchor, { x: applied[0].screenX, y: applied[0].screenY });
        expect(screenPointForLocalPoint(local, { x: applied[0].screenX, y: applied[0].screenY })).toEqual(anchor);
        expect(applied[0]).toEqual(frame(nextBounds));
      }
    }
  });

  it('does not let the ResizeObserver become a second screen-anchor compensation owner', () => {
    const applied: ViewportFrame[] = [];
    const coordinator = createViewportSyncCoordinator((next) => applied.push(next));
    const start = { x: 800, y: 300, width: 432, height: 600 };
    const next = { x: 720, y: 300, width: 512, height: 600 };
    coordinator.submit('initial', frame(start));
    coordinator.flush();
    applied.length = 0;

    coordinator.submit('bounds', frame(next));
    coordinator.submit('resize-observer', { ...frame(next), screenX: start.x, screenY: start.y });
    coordinator.flush();

    expect(applied).toEqual([frame(next)]);
  });

  it('accepts the next live resize origin after a prior bounds frame even when observer arrives first', () => {
    const applied: ViewportFrame[] = [];
    const coordinator = createViewportSyncCoordinator((next) => applied.push(next));
    const start = { x: 800, y: 300, width: 432, height: 600 };
    const next = { x: 720, y: 300, width: 512, height: 600 };
    coordinator.submit('initial', frame(start));
    coordinator.flush();
    coordinator.submit('bounds', frame(start));
    coordinator.flush();
    applied.length = 0;

    coordinator.submit('resize-observer', { ...frame(next), screenX: start.x, screenY: start.y });
    coordinator.submit('window-resize', frame(next));
    coordinator.flush();

    expect(applied).toEqual([frame(next)]);
  });

  it('rejects an older bounds size that arrives after a newer live resize frame', () => {
    const applied: ViewportFrame[] = [];
    const coordinator = createViewportSyncCoordinator((next) => applied.push(next));
    const start = { x: 800, y: 300, width: 432, height: 600 };
    const next = { x: 720, y: 300, width: 512, height: 600 };
    coordinator.submit('initial', frame(start));
    coordinator.flush();
    applied.length = 0;

    coordinator.submit('window-resize', frame(next));
    coordinator.submit('bounds', frame(start));
    coordinator.flush();

    expect(applied).toEqual([frame(next)]);
  });

  it('keeps exact main-process bounds authoritative when stale window events follow every cardinal resize', () => {
    const applied: ViewportFrame[] = [];
    const coordinator = createViewportSyncCoordinator((next) => applied.push(next));
    const start = { x: 800, y: 300, width: 432, height: 600 };
    const cardinalEdges: PetResizeEdge[] = ['w', 'e', 'n', 's'];

    for (const edge of cardinalEdges) {
      coordinator.submit('initial', frame(start));
      coordinator.flush();
      for (const step of [1, 2, 3, 4]) {
        applied.length = 0;
        const next = nextPetResizeBounds(
          start,
          { screenX: start.x, screenY: start.y },
          {
            screenX: start.x + (edge === 'w' ? -80 : edge === 'e' ? 80 : 0) * step,
            screenY: start.y + (edge === 'n' ? -60 : edge === 's' ? 60 : 0) * step
          },
          edge
        );

        // The main process supplies the exact rectangle after setBounds. Both
        // renderer-owned notifications may still carry the previous origin.
        coordinator.submit('bounds', frame(next));
        coordinator.submit('resize-observer', { ...frame(next), screenX: start.x, screenY: start.y });
        coordinator.submit('window-resize', { ...frame(next), screenX: start.x, screenY: start.y });
        coordinator.flush();

        expect(applied).toEqual([frame(next)]);
      }
    }
  });

  it('keeps resize free of model viewport writes and restores transactions on cancel/blur/focus', () => {
    const resizePath = petSource.slice(petSource.indexOf("gesture.operation === 'window-resize'"), petSource.indexOf('const finalizeActivePointer'));
    expect(resizePath).not.toContain('updateModelViewport');
    expect(resizePath).not.toContain('persistModelViewport');
    expect(petSource).toContain("window.addEventListener('pointercancel'");
    expect(petSource).toContain("window.addEventListener('blur'");
    expect(petSource).toContain("window.addEventListener('focus'");
    expect(petSource).toContain('finalizeActivePointer(null, true)');
    expect(canvasSource).toContain('createViewportSyncCoordinator');
    expect(canvasSource).not.toContain('runtimeRef.current?.controller.setViewport(rect.width, rect.height, renderScale, windowOrigin.x, windowOrigin.y);');
  });

  it('keeps an authoritative Alt whole-window drag frame uncompensated through later observer notifications', () => {
    const applied: ViewportFrame[] = [];
    const coordinator = createViewportSyncCoordinator((next) => applied.push(next));
    const start = { x: 800, y: 300, width: 432, height: 600 };
    const moved = { ...start, x: 880, y: 340 };
    coordinator.submit('initial', frame(start));
    coordinator.flush();
    applied.length = 0;

    coordinator.submit('bounds', frame(moved, false));
    coordinator.submit('resize-observer', frame(moved, true));
    coordinator.submit('window-resize', frame(moved, true));
    coordinator.flush();

    expect(applied).toEqual([frame(moved, false)]);
  });
});
