import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const rendererDirectory = resolve(import.meta.dirname);
const screenshotSource = readFileSync(resolve(rendererDirectory, 'WorkbenchScreenshot.tsx'), 'utf8');
const bootstrapSource = readFileSync(resolve(rendererDirectory, 'main.tsx'), 'utf8');
const consoleSource = readFileSync(resolve(rendererDirectory, 'AgentConsole.tsx'), 'utf8');
const runtimeSource = readFileSync(resolve(rendererDirectory, 'live2d-runtime.js'), 'utf8');
const harnessSource = readFileSync(resolve(rendererDirectory, '../../../tools/render-workbench-screenshots.mjs'), 'utf8');

describe('StarChat real Live2D workbench preview contracts', () => {
  it('keeps the real external model path as a selectable screenshot state', () => {
    expect(screenshotSource).toContain('live2dEntry');
    expect(screenshotSource).toContain("status: live2dEntry ? 'ready' : 'not_configured'");
    expect(screenshotSource).toContain('entryPath: live2dEntry');
    expect(screenshotSource).toContain('data-live2d-preview');
    expect(screenshotSource).toContain('sanitizeAppSettings');
    expect(screenshotSource).toContain('live2dModelPath: live2dEntry');
    expect(screenshotSource).toContain('live2dShowWatermark: live2dEntry ? undefined');
  });

  it('loads Cubism Core before rendering a screenshot with a real model', () => {
    expect(bootstrapSource).toContain("const live2dPreview = params.get('live2dEntry');");
    expect(bootstrapSource).toContain('if (screenshotWorkbench && live2dPreview) await loadCubismCore();');
  });

  it('keeps the same layered stage while switching from fallback to the actual Live2D canvas', () => {
    expect(consoleSource).toContain('data-stage-role="live2d"');
    expect(consoleSource).toContain('modelReady ? <Live2DCanvas');
    expect(runtimeSource).toContain('live2d://model/');
    expect(runtimeSource).toContain('Live2DModel.from(source');
  });

  it('provides a real-model Electron harness without copying external assets', () => {
    expect(harnessSource).toContain("process.argv.includes('--live2d')");
    expect(harnessSource).toContain('protocolApi.handle');
    expect(harnessSource).toContain('WORKBENCH_LIVE2D_ENTRY');
    expect(harnessSource).toContain('pet:');
    expect(harnessSource).toContain('debug:');
    expect(harnessSource).toContain('live2dEntry=');
    expect(harnessSource).toContain('waitForLive2DRuntime');
    expect(harnessSource).toContain('let previewWindow = null');
  });
});
