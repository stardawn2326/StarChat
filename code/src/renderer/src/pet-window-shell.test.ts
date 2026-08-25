import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const mainSource = readFileSync(resolve(testDirectory, '../../main/index.ts'), 'utf8');
const petSource = readFileSync(resolve(testDirectory, 'PetApp.tsx'), 'utf8');
const rendererHtml = readFileSync(resolve(testDirectory, '../index.html'), 'utf8');
const mainSourceText = readFileSync(resolve(testDirectory, 'main.tsx'), 'utf8');
const stylesSource = readFileSync(resolve(testDirectory, 'styles.css'), 'utf8');

describe('PetWindow interaction and transparency boundaries', () => {
  it('coalesces drag points and flushes the last point before ending a drag', () => {
    expect(petSource).toContain('createPetDragScheduler');
    expect(petSource).toContain('latestPointerScreenPoint');
    expect(petSource).toContain('dragSchedulerRef.current?.flush()');
    expect(petSource).toContain('event.preventDefault()');
  });

  it('does not let the pet window expose a native drag region', () => {
    expect(stylesSource).toMatch(/\.pet-shell\s*\{[^}]*-webkit-app-region:\s*no-drag/s);
  });

  it('removes the document title and all visible pet-only window chrome', () => {
    expect(mainSource).toContain("title: ''");
    expect(mainSource).toContain("petWindow?.setTitle('')");
    expect(rendererHtml).toContain('<title></title>');
    expect(mainSourceText).toContain("document.title = role === 'pet' ? '' : '白音 AI 助手'");
    expect(stylesSource).toMatch(/\.pet-shell\.pet-hovered\s*\{\s*outline:\s*none/s);
    expect(stylesSource).toMatch(/\.pet-shell\.pet-model-editing\s*\{\s*outline:\s*none/s);
    expect(stylesSource).toMatch(/\.pet-resize-frame\s*\{[^}]*inset:\s*0[^}]*box-sizing:\s*border-box[^}]*pointer-events:\s*none/s);
    expect(stylesSource).toContain('.pet-shell[data-pet-model-edit-mode="true"] .pet-resize-frame');
    expect(stylesSource).toMatch(/\.pet-shell \.live2d-canvas\s*\{[^}]*background:\s*transparent/s);
    expect(mainSource).toContain('petWindow.setResizable(false)');
    expect(mainSource).toContain("ipcMain.on('pet:resize-start'");
    expect(mainSource).toContain('autoHideMenuBar: true');
    expect(petSource).not.toContain('model-viewport-controls');
    expect(stylesSource).toMatch(/html, body, #root\s*\{[^}]*background:\s*transparent/s);
  });

  it('keeps the resize frame visibility tied to explicit adjustment mode', () => {
    expect(petSource).toContain("data-pet-model-edit-mode={modelEditMode ? 'true' : 'false'}");
    expect(stylesSource).toContain('.pet-shell[data-pet-model-edit-mode="true"] .pet-resize-frame');
    expect(stylesSource).not.toContain('.pet-shell[data-pet-frame-hover="true"] .pet-resize-frame { border-color');
    expect(stylesSource).not.toContain('.pet-shell.pet-hovered:not([data-pet-locked="true"]) .pet-resize-frame');
  });

  it('draws a client-area rainbow frame only in explicit window-adjust mode', () => {
    expect(petSource).toContain('data-pet-model-edit-mode={modelEditMode ? \'true\' : \'false\'}');
    const frameBaseCss = stylesSource.slice(stylesSource.indexOf('.pet-resize-frame'), stylesSource.indexOf('.pet-shell[data-pet-model-edit-mode="true"] .pet-resize-frame'));
    expect(frameBaseCss).toContain('inset: 0');
    expect(frameBaseCss).toContain('box-sizing: border-box');
    expect(frameBaseCss).toContain('opacity: 0');
    expect(frameBaseCss).toContain('visibility: hidden');
    expect(frameBaseCss).toContain('background: transparent');
    expect(frameBaseCss).toContain('box-shadow: none');
    expect(frameBaseCss).toContain('pointer-events: none');
    expect(stylesSource).toContain('.pet-shell[data-pet-model-edit-mode="true"] .pet-resize-frame');
    expect(stylesSource).toContain('.pet-shell[data-pet-model-edit-mode="true"] .pet-resize-frame::before');
    expect(stylesSource).toContain('background-position: 0% 50%');
    expect(stylesSource).toContain('background-size: 280% 100%');
    expect(stylesSource).toContain('animation: pet-rainbow-border-flow');
    expect(stylesSource).toContain('@keyframes pet-rainbow-border-flow');
    expect(stylesSource).toContain('pointer-events: none;');
    const reducedMotionBlock = stylesSource.slice(stylesSource.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reducedMotionBlock).toContain('.pet-resize-frame::before');
    expect(reducedMotionBlock).toContain('animation: none');
    const frameCss = stylesSource.slice(stylesSource.indexOf('.pet-resize-frame'), stylesSource.indexOf('.pet-shell .live2d-model-clip-layer'));
    expect(frameCss).not.toContain('renderer.resize');
    expect(frameCss).not.toContain('setBounds');
    expect(frameCss).not.toContain('persistModelViewport');
    expect(frameCss).not.toContain('modelViewport');
  });

  it('dims the model to exactly 30 percent only while locked and hovered', () => {
    expect(petSource).toContain('const displayedModelOpacity = isLocked && hovered ? Math.min(modelViewport.modelOpacity, 0.3) : modelViewport.modelOpacity;');
    expect(petSource).toContain('modelOpacity: displayedModelOpacity');
    expect(petSource).toContain('if (hovered && isLocked)');
    expect(petSource).not.toContain('modelOpacity: modelViewport.modelOpacity * (isLocked && hovered ? 0.5 : 1)');
  });
});
