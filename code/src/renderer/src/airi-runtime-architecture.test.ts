import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { pixiWorldPointFromCursor } from './airi-world-coordinate';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const runtimeSource = readFileSync(resolve(testDirectory, 'live2d-runtime.js'), 'utf8');
const physicsGateSource = readFileSync(resolve(testDirectory, 'cubism-physics-gate.ts'), 'utf8');
const canvasSource = readFileSync(resolve(testDirectory, 'Live2DCanvas.tsx'), 'utf8');
const chatSource = readFileSync(resolve(testDirectory, 'CompanionChat.tsx'), 'utf8');
const packageJson = JSON.parse(readFileSync(resolve(testDirectory, '../../../package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
};
const workspaceYaml = readFileSync(resolve(testDirectory, '../../../pnpm-workspace.yaml'), 'utf8');
const require = createRequire(import.meta.url);
const packageRuntimeSource = readFileSync(require.resolve('pixi-live2d-display/cubism4'), 'utf8');

describe('AIRI production Live2D architecture gates', () => {
  it('maps screen cursor to Pixi world pixels without a second model-space transform', () => {
    const center = pixiWorldPointFromCursor({
      screenX: 110,
      screenY: 220,
      canvasScreenRect: { left: 10, top: 20 }
    });
    const right = pixiWorldPointFromCursor({
      screenX: 160,
      screenY: 220,
      canvasScreenRect: { left: 10, top: 20 }
    });
    const above = pixiWorldPointFromCursor({
      screenX: 110,
      screenY: 170,
      canvasScreenRect: { left: 10, top: 20 }
    });

    expect(center).toEqual({ x: 100, y: 200 });
    expect(right.x).toBeGreaterThan(center.x);
    expect(above.y).toBeLessThan(center.y);
  });

  it('uses the actual AIRI package chain and leaves every Cubism follow write to the package', () => {
    expect(packageJson.dependencies?.['@pixi/app']).toBe('6.5.10');
    expect(packageJson.dependencies?.['@pixi/ticker']).toBe('6.5.10');
    expect(packageJson.dependencies?.['pixi-live2d-display']).toBe('0.4.0');
    expect(workspaceYaml).toContain('pixi-live2d-display: patches/pixi-live2d-display.patch');

    expect(runtimeSource).toContain("from 'pixi-live2d-display/cubism4'");
    expect(runtimeSource).toContain('Live2DModel.registerTicker(Ticker)');
    expect(runtimeSource).toContain('TickerPlugin');
    expect(runtimeSource).toContain('Live2DModel.from(');
    expect(runtimeSource).toContain('autoInteract: false');
    expect(runtimeSource).toContain('model.focus(worldPoint.x, worldPoint.y)');
    expect(runtimeSource).not.toContain('requestAnimationFrame');
    expect(runtimeSource).not.toContain('app.ticker.add');
    expect(canvasSource).toContain('setFocusFromScreenCursor');
    expect(canvasSource).not.toContain('setGazeFromCanvasPoint');

    for (const forbidden of [
      'LAppSubdelegate',
      'CubismTrackingController',
      'FocusControllerEquivalent',
      'focusFromCanvasPoint',
      'applyEffect(',
      'FOLLOW_PARAMETER_IDS',
      'PHYSICS_OUTPUT_IDS',
      'patchModelUpdate',
      'trackingUpdater',
      'CubismFramework',
      'CubismShaderManager_WebGL',
      'setParameterValueById\\(.*ParamAngle',
      'addParameterValueById\\(.*ParamEye'
    ]) {
      if (forbidden.includes('.*')) {
        expect(runtimeSource).not.toMatch(new RegExp(forbidden));
      } else {
        expect(runtimeSource).not.toContain(forbidden);
      }
    }
  });

  it('keeps one runtime ticker path and resize separate from model transform', () => {
    expect(runtimeSource.match(/Live2DModel\.registerTicker\(Ticker\)/g)).toHaveLength(1);
    expect(runtimeSource).toContain('app.renderer.resize');
    expect(runtimeSource).toContain('resolution: nextViewport.renderScale');
    expect(runtimeSource).toContain('app.renderer.resolution = nextViewport.renderScale');
    expect(runtimeSource).not.toContain('app.stage.scale.set');
    expect(runtimeSource).not.toMatch(/nextViewport\.width\s*\*\s*nextViewport\.renderScale/);
    expect(runtimeSource).not.toMatch(/nextViewport\.height\s*\*\s*nextViewport\.renderScale/);
    expect(runtimeSource).toContain('model.scale.set');
    expect(runtimeSource).toContain('model.position.set');
    expect(runtimeSource).toContain('model.anchor.set(0.5, 0.5)');
    expect(runtimeSource).not.toContain('model.scale.set(userScale');
    expect(runtimeSource).not.toContain('model.position.set(userX');
    expect(runtimeSource).toContain('keep model.position unchanged');
  });

  it('keeps the model-provided watermark switch persistent across expressions and reloads', () => {
    expect(runtimeSource).toContain('setWatermarkVisible');
    expect(runtimeSource).toContain('persistentWatermarkHandler');
    expect(canvasSource).toContain('controller.setWatermarkVisible(showWatermark)');
    expect(canvasSource).not.toContain("playExpression(showWatermark ? 'watermark_on' : 'watermark_off')");
  });

  it('keeps AIRI package focus and model physics as the sole body-motion chain', () => {
    expect(runtimeSource).toContain('model?.internalModel?.configureFocus?.(gazeConfig)');
    expect(canvasSource).toContain('new IdleGazeController()');
    expect(canvasSource).toContain("decision.mode === 'released'");
    expect(packageRuntimeSource).toContain('this.idParamBodyAngleX, this.focusController.x * 10');
    expect(packageRuntimeSource).not.toContain('spring * (targetX - this.bodyFocusX)');
    expect(packageRuntimeSource).not.toContain('this.idParamBodyAngleY, this.bodyFocusY');
    expect(runtimeSource).toContain('gazeConfig = sanitizeGazeConfig(config)');
    expect(runtimeSource).toContain('hitTestNormalized');
  });

  it('does not replace the package focus dynamics while retaining an independent physics gate', () => {
    expect(runtimeSource).not.toContain('installFocusConsumer');
    expect(runtimeSource).not.toContain('internalModel.configureFocus =');
    expect(runtimeSource).not.toContain('internalModel.updateFocus =');
    expect(runtimeSource).not.toContain('focusController.update =');
    expect(runtimeSource).toContain('installPhysicsGate');
    expect(physicsGateSource).toContain('physics.evaluate =');
    expect(packageRuntimeSource).toContain('configureFocus(settings = {})');
    expect(packageRuntimeSource).toContain('updateFocus(_dt = 1 / 60, _now = 0)');
    expect(packageRuntimeSource).toContain('this.focusController.x * 10');
  });

  it('keeps the package default focus trajectory and forwards custom values through configureFocus', () => {
    expect(packageRuntimeSource).toContain('this.focusSettings = { eyeWeight: 1, headWeight: 1, bodyWeight: 1, bodyFollowStrength: 1, bodyLag: 0.22, inertiaStrength: 0, idleSwayStrength: 0 }');
    expect(packageRuntimeSource).toContain('this.coreModel.addParameterValueById(this.idParamAngleX, this.focusController.x * 30)');
    expect(packageRuntimeSource).toContain('this.coreModel.addParameterValueById(this.idParamBodyAngleX, this.focusController.x * 10)');
    expect(runtimeSource).toContain('gazeConfig = sanitizeGazeConfig(config)');
    expect(runtimeSource).toContain('model?.internalModel?.configureFocus?.(gazeConfig)');
  });

  it('drives lip sync from played audio frames instead of a fixed mouth timer', () => {
    expect(chatSource).toContain('createAnalyser()');
    expect(chatSource).toContain("type: 'speech'");
    expect(chatSource).toContain('speaking,');
    expect(chatSource).toContain('mouthOpen');
    expect(canvasSource).not.toContain('open = !open');
    expect(canvasSource).not.toContain('0.72 : 0.18');
    expect(runtimeSource).toContain("getParameterIndex?.('ParamMouthForm')");
  });
});
