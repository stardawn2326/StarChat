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
    expect(stylesSource).toMatch(/\.pet-resize-frame\s*\{[^}]*inset:\s*3px[^}]*border-radius:\s*14px[^}]*background:\s*transparent[^}]*pointer-events:\s*none/s);
    expect(mainSource).toContain('petWindow.setResizable(false)');
    expect(mainSource).toContain("ipcMain.on('pet:resize-start'");
    expect(mainSource).toContain('autoHideMenuBar: true');
    expect(petSource).not.toContain('model-viewport-controls');
    expect(stylesSource).toMatch(/html, body, #root\s*\{[^}]*background:\s*transparent/s);
  });

  it('keeps the resize frame visible from global cursor presence, independent of model hit or hint delay', () => {
    expect(petSource).toContain("data-pet-frame-hover={frameHover ? 'true' : 'false'}");
    expect(stylesSource).toContain('.pet-shell[data-pet-frame-hover="true"] .pet-resize-frame');
    expect(stylesSource).not.toContain('.pet-shell.pet-hovered:not([data-pet-locked="true"]) .pet-resize-frame');
  });

  it('reduces model opacity to 30 percent after the cursor stays on the model', () => {
    expect(petSource).toContain('const displayedModelOpacity = hintVisible && hovered ? Math.min(modelViewport.modelOpacity, 0.3) : modelViewport.modelOpacity');
    expect(petSource).toContain('modelOpacity: displayedModelOpacity');
  });
});
