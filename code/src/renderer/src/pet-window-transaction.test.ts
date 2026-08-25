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

  it('re-arms hit testing after shell focus returns without requiring a resize', () => {
    expect(rendererSource).toContain("window.addEventListener('focus'");
    expect(rendererSource).toContain("document.addEventListener('visibilitychange'");
    expect(rendererSource).toContain('cursor?.timestamp');
    expect(rendererSource).toContain('restoreInputMode');
  });

  it('keeps locked mode click-through while leaving hit detection to global cursor polling', () => {
    expect(mainSource).not.toContain('{ forward: true }');
    expect(rendererSource).toContain('window.baoyin.app.setInputMode(initialMode);');
    expect(rendererSource).toContain('window.baoyin.cursor.onUpdate(');
  });

  it('never compensates or persists model viewport state during window resize', () => {
    const finalizeStart = rendererSource.indexOf('const finalizeActivePointer');
    const resizeMoveStart = rendererSource.indexOf("if (gesture.operation === 'window-resize')");
    const resizeMove = rendererSource.slice(resizeMoveStart, finalizeStart);
    const resizeFinishStart = rendererSource.indexOf("if (gesture.operation === 'window-resize')", finalizeStart);
    const resizeFinish = rendererSource.slice(resizeFinishStart, rendererSource.indexOf('const cancelActivePointer'));
    for (const source of [resizeMove, resizeFinish]) {
      expect(source).not.toContain('compensateResizeViewport');
      expect(source).not.toContain('compensateModelViewportForWindowOrigin');
      expect(source).not.toContain('updateModelViewport');
      expect(source).not.toContain('persistModelViewport');
      expect(source).not.toContain('modelOffset');
      expect(source).not.toContain('modelScale');
    }
    expect(rendererSource).not.toContain('compensateResizeViewport');
    expect(rendererSource).not.toContain('compensateModelViewportForWindowOrigin');
  });

  it('handles Alt-drag before any resize edge so the southeast border cannot enlarge the window', () => {
    const pointerDown = rendererSource.slice(rendererSource.indexOf('const handlePointerDown'), rendererSource.indexOf('const handlePointerMove'));
    expect(pointerDown.indexOf('if (event.altKey)')).toBeGreaterThanOrEqual(0);
    expect(pointerDown.indexOf('if (event.altKey)')).toBeLessThan(pointerDown.indexOf('if (resizeEdge)'));
    expect(pointerDown).toContain("operation: 'window-and-model-drag'");
    expect(pointerDown).not.toContain("operation: 'window-drag'");
    expect(rendererSource).toContain("gesture.operation === 'window-and-model-drag'");
  });

  it('makes the main-process drag transaction exclude every resize move and clears stale resize state', () => {
    const dragStart = mainSource.slice(mainSource.indexOf("ipcMain.on('pet:drag-start'"), mainSource.indexOf("ipcMain.on('pet:drag-move'"));
    const resizeMove = mainSource.slice(mainSource.indexOf("ipcMain.on('pet:resize-move'"), mainSource.indexOf("ipcMain.on('pet:resize-end'"));
    expect(dragStart).toContain('cancelPetPointerTransactions');
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

  it('coalesces resize IPC separately from the Alt-drag scheduler', () => {
    expect(rendererSource).toContain("createPetResizeScheduler");
    expect(rendererSource).toContain('resizeSchedulerRef.current?.queue');
    expect(rendererSource).toContain('resizeSchedulerRef.current?.flush()');
    expect(rendererSource).not.toContain('window.baoyin.pet.resizeMove(latestPointerScreenPoint(event))');
  });

  it('releases resize transactions when visibility is lost or pointer capture disappears', () => {
    expect(rendererSource).toContain("window.addEventListener('lostpointercapture'");
    expect(rendererSource).not.toContain("window.addEventListener('pointerleave'");
    expect(rendererSource).not.toContain('const handlePointerLeave');
    expect(rendererSource).toContain('document.visibilityState !== \'visible\'');
    expect(rendererSource).toContain('finalizeActivePointer(null, true)');
  });

  it('uses an explicit cancel reset on every new pointerdown instead of relying on context-menu focus', () => {
    const pointerDown = rendererSource.slice(rendererSource.indexOf('const handlePointerDown'), rendererSource.indexOf('const handlePointerMove'));
    expect(pointerDown).toContain('window.baoyin.pet.pointerCancel()');
    expect(mainSource).toContain("ipcMain.on('pet:pointer-cancel'");
    expect(mainSource).toContain('applyPetInputMode');
  });

  it('clears the renderer transaction before releasing capture so lostpointercapture cannot re-enter finalization', () => {
    const finalize = rendererSource.slice(rendererSource.indexOf('const finalizeActivePointer'), rendererSource.indexOf('const cancelActivePointer'));
    expect(finalize).toContain('activePointer.current = null');
    expect(finalize.indexOf('activePointer.current = null')).toBeLessThan(finalize.indexOf('captureTarget?.releasePointerCapture'));
  });

  it('restores interaction from the latest cursor and model hit data with a conservative recovery window', () => {
    expect(rendererSource).toContain('cursorRef');
    expect(rendererSource).toContain('modelHitRef');
    expect(rendererSource).toContain('inputRecoveryPendingRef');
    expect(rendererSource).toContain('restoreInputMode(true)');
    expect(rendererSource).not.toContain('const transparentHit = hitRegionRef.current');
  });

  it('allows a new resize start to recover a stale resize transaction', () => {
    const pointerDown = rendererSource.slice(rendererSource.indexOf('const handlePointerDown'), rendererSource.indexOf('const handlePointerMove'));
    expect(pointerDown).toContain('window.baoyin.pet.pointerCancel()');
    expect(mainSource).toContain('cancelPetPointerTransactions();');
    expect(mainSource).toContain('petDragStart = null;');
    expect(mainSource).toContain('petResizeStart = null;');
  });

  it('does not use native shape synchronization during the resize hot path', () => {
    const resizeListener = mainSource.slice(mainSource.indexOf("petWindow.on('resize'"), mainSource.indexOf("petWindow.on('blur'"));
    const resizeMove = mainSource.slice(mainSource.indexOf("ipcMain.on('pet:resize-move'"), mainSource.indexOf("ipcMain.on('pet:resize-end'"));
    expect(resizeListener).not.toContain('schedulePetWindowShapeSync');
    expect(resizeMove).not.toContain('setShape');
    expect(mainSource).not.toContain('function schedulePetWindowShapeSync');
    expect(mainSource).not.toContain('setShape(');
    expect(mainSource).not.toContain('syncPetWindowShape');
  });

  it('suppresses bounds persistence and broadcast churn until resize end', () => {
    const moveListener = mainSource.slice(mainSource.indexOf("petWindow.on('move'"), mainSource.indexOf("petWindow.on('resize'"));
    const resizeListener = mainSource.slice(mainSource.indexOf("petWindow.on('resize'"), mainSource.indexOf("petWindow.on('blur'"));
    const resizeEnd = mainSource.slice(mainSource.indexOf("ipcMain.on('pet:resize-end'"), mainSource.indexOf("ipcMain.on('presentation:emit'"));
    expect(moveListener).toContain('if (petResizeStart)');
    expect(resizeListener).toContain('if (petResizeStart)');
    expect(resizeEnd).toContain('persistPetBounds(true)');
    expect(resizeEnd).toContain('sendPetBoundsChanged()');
  });

  it('makes main-process drag and resize end/cancel operations idempotent', () => {
    const dragEnd = mainSource.slice(mainSource.indexOf("ipcMain.on('pet:drag-end'"), mainSource.indexOf("ipcMain.on('pet:resize-start'"));
    const resizeEnd = mainSource.slice(mainSource.indexOf("ipcMain.on('pet:resize-end'"), mainSource.indexOf("ipcMain.on('presentation:emit'"));
    expect(dragEnd).toContain('!petDragStart');
    expect(resizeEnd).toContain('!petResizeStart');
    expect(mainSource).toContain('petBoundsPersistTimer');
  });

  it('keeps resize local to the window and never changes model scale', () => {
    const resizeHandler = rendererSource.slice(rendererSource.indexOf("gesture.operation === 'window-resize'"), rendererSource.indexOf('const finalizeActivePointer'));
    expect(resizeHandler).toContain('resizeSchedulerRef.current?.queue');
    expect(resizeHandler).not.toContain('modelScale:');
    expect(resizeHandler).not.toContain('settings.preview');
    expect(resizeHandler).not.toContain('settings.save');
  });
});
