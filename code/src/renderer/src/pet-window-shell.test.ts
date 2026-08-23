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
  });
});
