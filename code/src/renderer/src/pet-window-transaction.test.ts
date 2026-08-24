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

  it('handles Alt-drag before any resize edge so the southeast border cannot enlarge the window', () => {
    const pointerDown = rendererSource.slice(rendererSource.indexOf('const handlePointerDown'), rendererSource.indexOf('const compensateResizeViewport'));
    expect(pointerDown.indexOf('if (event.altKey)')).toBeGreaterThanOrEqual(0);
    expect(pointerDown.indexOf('if (event.altKey)')).toBeLessThan(pointerDown.indexOf('if (resizeEdge)'));
    expect(pointerDown).toContain("operation: 'window-and-model-drag'");
    expect(pointerDown).not.toContain("operation: 'window-drag'");
    expect(rendererSource).toContain("gesture.operation === 'window-and-model-drag'");
  });

  it('makes the main-process drag transaction exclude every resize move and clears stale resize state', () => {
    const dragStart = mainSource.slice(mainSource.indexOf("ipcMain.on('pet:drag-start'"), mainSource.indexOf("ipcMain.on('pet:drag-move'"));
    const resizeMove = mainSource.slice(mainSource.indexOf("ipcMain.on('pet:resize-move'"), mainSource.indexOf("ipcMain.on('pet:resize-end'"));
    expect(dragStart).toContain('petResizeStart = null');
    expect(resizeMove).toContain('petDragStart || !petResizeStart');
  });

  it('moves Alt-drag with an explicit immutable rectangle instead of DPI-sensitive setPosition', () => {
    const dragMove = mainSource.slice(mainSource.indexOf("ipcMain.on('pet:drag-move'"), mainSource.indexOf("ipcMain.on('pet:drag-end'"));
    expect(dragMove).toContain('petWindow.setBounds(nextBounds)');
    expect(dragMove).not.toContain('petWindow.setPosition(nextBounds.x, nextBounds.y)');
  });

  it('routes the wheel to model zoom whenever interaction is enabled', () => {
    const wheelHandler = rendererSource.slice(rendererSource.indexOf('const handleWheel'), rendererSource.indexOf("document.addEventListener('contextmenu'"));
    expect(wheelHandler).toContain('const factor = event.deltaY < 0 ? 1.08 : 0.925');
    expect(wheelHandler).toContain('updateModelViewport({ modelScale: viewportRef.current.modelScale * factor })');
    expect(wheelHandler).toContain('if (locked.current)');
    expect(wheelHandler).not.toContain('!modelEditMode || locked.current');
  });

  it('coalesces resize viewport compensation and avoids settings IPC on every transparent resize frame', () => {
    expect(rendererSource).toContain('resizeViewportFrameRef');
    expect(rendererSource).toContain('updateModelViewport(compensated, false)');
    expect(rendererSource).toContain('updated.modelOffsetX === viewportRef.current.modelOffsetX');
  });
});
