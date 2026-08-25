import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const rendererRoot = resolve(import.meta.dirname, '../renderer/src');

describe('agent desktop boundary', () => {
  it('keeps the pet renderer and Live2D ticker free of Agent imports/state/IPC', () => {
    for (const file of ['PetApp.tsx', 'Live2DCanvas.tsx', 'live2d-runtime.js']) {
      const source = readFileSync(resolve(rendererRoot, file), 'utf8');
      expect(source).not.toMatch(/agent|AgentTask|agent:event|agent:start/i);
    }
  });

  it('keeps the existing lock/adjust/drag/resize semantics reachable', () => {
    const petSource = readFileSync(resolve(rendererRoot, 'PetApp.tsx'), 'utf8');
    const mainSource = readFileSync(resolve(import.meta.dirname, 'index.ts'), 'utf8');
    expect(petSource).toContain('resizeStart');
    expect(petSource).toContain('resizeMove');
    expect(petSource).toContain('resizeEnd');
    expect(petSource).toContain('pointerCancel');
    expect(petSource).toContain('altKey');
    expect(mainSource).toContain("ipcMain.on('pet:resize-start'");
    expect(mainSource).toContain("ipcMain.on('pet:resize-move'");
    expect(mainSource).toContain("ipcMain.on('pet:resize-end'");
    expect(mainSource).toContain('setIgnoreMouseEvents');
  });

  it('keeps Agent events in the settings/chat renderer contract rather than presentation IPC', () => {
    const source = readFileSync(resolve(import.meta.dirname, '../preload/index.ts'), 'utf8');
    expect(source).toContain("'agent:event'");
    expect(source).not.toContain("ipcRenderer.send('presentation:event'");
  });
});
