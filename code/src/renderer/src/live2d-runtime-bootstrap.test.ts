import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const runtimeSource = readFileSync(resolve(testDirectory, 'live2d-runtime.js'), 'utf8');
const bootstrapSource = readFileSync(resolve(testDirectory, 'main.tsx'), 'utf8');

function sourceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  return source.slice(startIndex, endIndex < 0 ? undefined : endIndex);
}

describe('Live2D renderer bootstrap contracts', () => {
  it('keeps viewport anchor variables inside the viewport resize path', () => {
    const viewportPath = sourceBetween(runtimeSource, 'function applyRendererViewport', 'function applyTransformTo');
    const transformPath = sourceBetween(runtimeSource, 'function applyTransformTo', 'function applyModelTransform');

    expect(viewportPath).toContain('const sizeChanged =');
    expect(viewportPath).toContain('const originChanged =');
    expect(viewportPath).toContain('if (preserveModelScreenAnchor && (sizeChanged || originChanged) && model && modelScreenAnchor)');
    expect(transformPath).not.toContain('sizeChanged');
    expect(transformPath).not.toContain('nextViewport');
  });

  it('does not recreate the Pixi backing store for an origin-only frame', () => {
    const viewportPath = sourceBetween(runtimeSource, 'function applyRendererViewport', 'function applyTransformTo');

    expect(viewportPath).toContain('const resolutionChanged =');
    expect(viewportPath).toContain('if (sizeChanged || resolutionChanged)');
    expect(viewportPath).toContain('app.renderer.resize(');
  });

  it('keeps the pet UI visible with a clear boot error when a renderer module fails', () => {
    const boot = sourceBetween(bootstrapSource, 'async function boot()', 'void boot()');

    expect(bootstrapSource).toContain('boot-error-panel');
    expect(boot).toContain('root.textContent');
    expect(boot).not.toContain('root.replaceChildren()');
  });
});
