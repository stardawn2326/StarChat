import { useEffect, useMemo, useRef, useState } from 'react';
import type { Live2DModelState } from '../../shared/live2d';
import type { CubismDebugCommand, CursorUpdate } from '../../shared/ipc';
import type { PresentationEvent } from '../../shared/presentation';
import type { CubismGazeConfig, CubismRuntimeController, CubismRuntimeMetrics } from '../../shared/cubism';
import { DEFAULT_MODEL_VIEWPORT, type ModelViewportSettings } from '../../shared/settings';
import { CharacterStateResolver } from '../../shared/character-state';
import { canvasViewport, composeAbsoluteModelTransform } from '../../shared/window-contract';
import { CursorFollowGate } from './cursor-follow-gate';
import { IdleGazeController } from './idle-gaze';

interface RuntimeModule {
  controller: CubismRuntimeController;
  startExternalLive2D(modelJsonName: string, options: unknown): Promise<void>;
  stopExternalLive2D(): void;
  getCubismMetrics(): CubismRuntimeMetrics;
}

interface Live2DCanvasProps {
  event: PresentationEvent;
  live2d: Live2DModelState;
  modelViewport?: ModelViewportSettings;
  cursor?: CursorUpdate | null;
  gazeConfig?: CubismGazeConfig;
  tapPoint?: { x: number; y: number } | null;
  showWatermark?: boolean;
  debugCommand?: CubismDebugCommand | null;
  onFitFrame?: (bounds: { x: number; y: number; width: number; height: number }) => void;
  onModelHitChange?: (hit: boolean) => void;
}

function entryFileName(entryPath: string | null): string | null {
  if (!entryPath) {
    return null;
  }
  const parts = entryPath.split(/[\\/]/);
  return parts.at(-1) ?? null;
}

export function Live2DCanvas({ event, live2d, modelViewport = DEFAULT_MODEL_VIEWPORT, cursor = null, gazeConfig, tapPoint = null, showWatermark = true, debugCommand = null, onFitFrame, onModelHitChange }: Live2DCanvasProps): JSX.Element {
  const [runtimeStatus, setRuntimeStatus] = useState('准备启动真实 Cubism WebGL');
  const [runtimeMetrics, setRuntimeMetrics] = useState<CubismRuntimeMetrics | null>(null);
  const modelJsonName = useMemo(() => entryFileName(live2d.entryPath), [live2d.entryPath]);
  const ready = live2d.status === 'ready' || live2d.status === 'ready_with_warnings';
  const runtimeRef = useMemo(() => ({ current: null as RuntimeModule | null }), []);
  const characterStateRef = useMemo(() => new CharacterStateResolver(), []);
  const lastActionRef = useRef<string | null>(null);
  const lastExpressionRef = useRef<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewportRef = useRef({ width: 432, height: 600, renderScale: 1 });
  const lastSyncedViewportRef = useRef<{ width: number; height: number; renderScale: number } | null>(null);
  const cursorFollowGateRef = useRef(new CursorFollowGate(3000));
  const idleGazeRef = useRef(new IdleGazeController());

  const applyCursorFollow = (runtime: RuntimeModule, update: CursorUpdate, canvasRect: DOMRect): void => {
    const decision = cursorFollowGateRef.current.update(update.moving, update.timestamp);
    if (decision.release) {
      idleGazeRef.current.reset();
    }
    if (decision.mode === 'released') {
      const idleStrength = Math.min(1.6, Math.max(0.35,
        (gazeConfig?.idleMotionAmplitude ?? 0.035) / 0.035 * 0.55
        + (gazeConfig?.idleSwayStrength ?? 0.06) / 0.06 * 0.45));
      const target = idleGazeRef.current.update(update.timestamp, idleStrength);
      runtime.controller.setFocusFromScreenCursor({
        screenX: window.screenX + canvasRect.left + canvasRect.width * (0.5 + target.x * 0.5),
        screenY: window.screenY + canvasRect.top + canvasRect.height * (0.5 + target.y * 0.5),
        canvasScreenRect: { left: window.screenX + canvasRect.left, top: window.screenY + canvasRect.top }
      }, false);
      return;
    }
    if (decision.mode !== 'following') return;
    idleGazeRef.current.reset();
    runtime.controller.setFocusFromScreenCursor({
      screenX: update.screenX,
      screenY: update.screenY,
      canvasScreenRect: { left: window.screenX + canvasRect.left, top: window.screenY + canvasRect.top },
    }, update.moving);
  };

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || !cursor?.insideWindow) {
      onModelHitChange?.(false);
      return;
    }
    onModelHitChange?.(runtime.controller.hitTest((cursor.localX - 0.5) * 2, (0.5 - cursor.localY) * 2));
  }, [cursor, onModelHitChange, runtimeRef]);

  const applyTransform = (runtime: RuntimeModule): void => {
    runtime.controller.setTransform(composeAbsoluteModelTransform({
      userScale: modelViewport.modelScale,
      userX: modelViewport.modelOffsetX,
      userY: modelViewport.modelOffsetY
    }, viewportRef.current));
  };

  const applyCharacterState = async (runtime: RuntimeModule): Promise<void> => {
    const snapshot = characterStateRef.snapshot();
    if (snapshot.activeExpression !== lastExpressionRef.current) {
      runtime.controller.playExpression(snapshot.activeExpression);
      lastExpressionRef.current = snapshot.activeExpression;
    }
    if (snapshot.activeAction && snapshot.activeAction !== lastActionRef.current) {
      await runtime.controller.playAction(snapshot.activeAction, true);
      lastActionRef.current = snapshot.activeAction;
    } else if (!snapshot.activeAction && lastActionRef.current) {
      runtime.controller.stopAction();
      lastActionRef.current = null;
    }
  };

  useEffect(() => {
    if (!ready || !modelJsonName) {
      setRuntimeStatus('等待有效的 .model3.json 入口');
      return;
    }

    let active = true;
    cursorFollowGateRef.current.reset();
    setRuntimeStatus('正在加载 Cubism Core、AIRI Pixi 链与外部模型…');

    void import('./live2d-runtime.js')
      .then(async (module) => {
        if (!active) {
          return;
        }
        await module.startExternalLive2D(modelJsonName, {
          adapter: live2d.adapter,
          expressions: live2d.expressions,
          motions: live2d.motions
        });
        runtimeRef.current = module;
        const canvas = canvasRef.current;
        const rect = canvas?.getBoundingClientRect();
        const viewport = {
          width: Math.max(1, rect?.width ?? canvas?.clientWidth ?? 432),
          height: Math.max(1, rect?.height ?? canvas?.clientHeight ?? 600)
        };
        viewportRef.current = { ...viewport, renderScale: Math.max(1, window.devicePixelRatio || 1) };
        applyTransform(module);
        if (gazeConfig) {
          module.controller.configureGaze(gazeConfig);
        }
        if (cursor) {
          const canvasRect = canvas?.getBoundingClientRect();
          if (canvasRect) {
            applyCursorFollow(module, cursor, canvasRect);
          }
        }
        characterStateRef.apply(event);
        await applyCharacterState(module);
        // The first watermark effect can run before runtimeRef is assigned,
        // and the presentation event above can replace expressionEffects.
        // Apply the model-native exp3 switch last, after Cubism has finished
        // loading; this never edits, crops, or masks the external model asset.
        module.controller.setWatermarkVisible(showWatermark);
        setRuntimeStatus('真实 Cubism WebGL 已启动 · 外部资源只读引用');
      })
      .catch((error: unknown) => {
        if (active) {
          setRuntimeStatus(error instanceof Error ? error.message : 'Cubism runtime 启动失败');
        }
      });

    return () => {
      active = false;
      if (runtimeRef.current) {
        runtimeRef.current.stopExternalLive2D();
      } else {
        void import('./live2d-runtime.js').then((module) => module.stopExternalLive2D());
      }
    };
  }, [live2d.entryPath, modelJsonName, ready, runtimeRef]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (runtime) {
      applyTransform(runtime);
    }
  }, [modelViewport.modelOffsetX, modelViewport.modelOffsetY, modelViewport.modelScale, runtimeRef]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (runtime && gazeConfig) {
      runtime.controller.configureGaze(gazeConfig);
    }
  }, [gazeConfig?.enabled, gazeConfig?.eyeWeight, gazeConfig?.headWeight, gazeConfig?.bodyWeight, gazeConfig?.bodyFollowStrength, gazeConfig?.bodyLag, gazeConfig?.inertiaStrength, gazeConfig?.idleSwayStrength, gazeConfig?.physicsEnabled, runtimeRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const syncViewport = (): void => {
      const rect = canvas.getBoundingClientRect();
      const next = canvasViewport({ width: rect.width, height: rect.height }, window.devicePixelRatio || 1);
      const renderScale = next.renderScale;
      viewportRef.current = { width: next.width, height: next.height, renderScale };
      canvas.dataset.viewportCss = `${Math.round(rect.width)}x${Math.round(rect.height)}`;
      canvas.dataset.renderScale = String(renderScale);
      const previous = lastSyncedViewportRef.current;
      if (previous && previous.width === next.width && previous.height === next.height && previous.renderScale === renderScale) {
        return;
      }
      lastSyncedViewportRef.current = { width: next.width, height: next.height, renderScale };
      runtimeRef.current?.controller.setViewport(rect.width, rect.height, renderScale);
      // ResizeObserver and window resize can both report the same CSS viewport
      // during a drag or a cross-display move. The renderer owns backing pixels;
      // this observer only forwards a changed CSS viewport/DPR tuple.
    };
    syncViewport();
    const observer = new ResizeObserver(syncViewport);
    observer.observe(canvas);
    window.addEventListener('resize', syncViewport);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', syncViewport);
    };
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || !cursor) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    applyCursorFollow(runtime, cursor, rect);
  }, [cursor, modelViewport.modelOffsetX, modelViewport.modelOffsetY, modelViewport.modelScale, runtimeRef]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (runtime && tapPoint) {
      runtime.controller.tap(tapPoint.x, tapPoint.y);
    }
  }, [tapPoint, runtimeRef]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || !ready) return;
    if (event.type === 'speech') return;
    characterStateRef.apply(event);
    void applyCharacterState(runtime).catch((error: unknown) => {
      setRuntimeStatus(error instanceof Error ? error.message : 'Cubism 表现应用失败');
    });
  }, [event, ready, runtimeRef]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || !ready || event.type !== 'speech') return;
    if (!event.speaking) {
      runtime.controller.setLipSync(0, 0);
      return;
    }
    runtime.controller.setLipSync(event.mouthOpen ?? 0, event.mouthForm ?? 0);
  }, [event, ready, runtimeRef]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || !ready) return;
    runtime.controller.setWatermarkVisible(showWatermark);
  }, [showWatermark, ready, runtimeRef]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || !debugCommand) return;
    try {
      if (debugCommand.type === 'fit-frame') {
        const bounds = runtime.controller.getRenderedBounds();
        if (bounds) onFitFrame?.(bounds);
      } else if (debugCommand.type === 'parameter') {
        runtime.controller.setParameters([debugCommand.patch]);
      } else if (debugCommand.type === 'reset') {
        runtime.controller.resetParameters();
      } else if (debugCommand.name === 'neutral') {
        characterStateRef.apply({ ...debugCommand, source: 'system', layer: 'manual' });
        lastActionRef.current = null;
        lastExpressionRef.current = null;
        runtime.controller.neutral();
      } else if (debugCommand.name === 'stop_expression') {
        characterStateRef.apply({ ...debugCommand, source: 'system', layer: 'manual' });
        lastExpressionRef.current = null;
        runtime.controller.stopExpression();
      } else {
        characterStateRef.apply({ ...debugCommand, source: 'system', layer: 'manual' });
        lastActionRef.current = null;
        runtime.controller.stopAction();
      }
    } catch (error: unknown) {
      setRuntimeStatus(error instanceof Error ? error.message : 'Cubism 调试命令失败');
    }
  }, [debugCommand, ready, runtimeRef, onFitFrame]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const runtime = runtimeRef.current;
      if (runtime) {
        const metrics = runtime.getCubismMetrics();
        setRuntimeMetrics(metrics);
        window.baoyin.debug.reportMetrics({ metrics });
        if (lastActionRef.current && !metrics.activeMotion) {
          characterStateRef.finishAction();
          lastActionRef.current = null;
          void applyCharacterState(runtime);
        }
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [runtimeRef]);

  const eventLabel = event.type === 'speech'
    ? event.speaking ? '语音：说话中' : '语音：停止'
    : event.type === 'expression'
    ? `表情：${event.name}`
    : event.type === 'action'
      ? `动作：${event.name}`
      : `控制：${event.name}`;
  return (
    <section
      className="character-card live2d-card"
      aria-label="真实外部 Live2D 模型"
      data-live2d-runtime="cubism"
      data-runtime-status={runtimeStatus}
      data-runtime-model-step={runtimeMetrics?.modelLoadStep ?? 'unknown'}
      data-runtime-textures={runtimeMetrics ? `${runtimeMetrics.textureCount ?? 'unknown'}/${runtimeMetrics.textureExpected ?? 'unknown'}` : 'unknown'}
      data-runtime-renderer-ready={runtimeMetrics?.rendererReady ? 'true' : 'false'}
      data-runtime-render-frames={runtimeMetrics?.renderFrameCount ?? 0}
      data-runtime-shader-loaded={runtimeMetrics?.shaderLoaded ? 'true' : 'false'}
      data-runtime-shader-loading={runtimeMetrics?.shaderLoading ? 'true' : 'false'}
      data-runtime-drawables={runtimeMetrics?.drawableCount ?? 0}
      data-runtime-drawable-vertices={runtimeMetrics?.drawableVertexCount ?? 0}
      data-runtime-drawable-visible={runtimeMetrics?.drawableVisibleCount ?? 0}
      data-runtime-drawable-max-opacity={runtimeMetrics?.drawableMaxOpacity ?? 0}
      data-runtime-model-canvas={runtimeMetrics?.modelCanvas ? `${runtimeMetrics.modelCanvas.width}x${runtimeMetrics.modelCanvas.height}` : 'unknown'}
      data-runtime-model-matrix={runtimeMetrics?.modelMatrix?.map((value) => Number(value.toFixed(4))).join(',') ?? 'unknown'}
      data-runtime-transform={runtimeMetrics?.transform ? JSON.stringify(runtimeMetrics.transform) : 'unknown'}
      data-runtime-gaze-target={`${runtimeMetrics?.gazeTargetX ?? 0},${runtimeMetrics?.gazeTargetY ?? 0}`}
      data-runtime-gaze={`${runtimeMetrics?.gazeX ?? 0},${runtimeMetrics?.gazeY ?? 0}`}
      data-runtime-gaze-idle={runtimeMetrics?.gazeIdle ? 'true' : 'false'}
      data-runtime-update-phase={runtimeMetrics?.updatePhase ?? 'unknown'}
      data-runtime-physics-enabled={runtimeMetrics?.physicsEnabled ? 'true' : 'false'}
      data-runtime-context-lost={runtimeMetrics?.contextLost ? 'true' : 'false'}
      data-runtime-gl-error={runtimeMetrics?.glError ?? 0}
      data-model-opacity={modelViewport.modelOpacity}
      data-model-clip={`${modelViewport.clipWidth}x${modelViewport.clipHeight}`}
    >
      <div
        className="live2d-model-clip-layer"
        style={{
          opacity: modelViewport.modelOpacity,
          clipPath: `inset(${((1 - modelViewport.clipHeight) * 50).toFixed(3)}% ${((1 - modelViewport.clipWidth) * 50).toFixed(3)}%)`
        }}
      >
        <canvas
          ref={canvasRef}
          className="live2d-canvas"
          data-live2d-canvas
          aria-label="Cubism WebGL 模型画布"
        />
      </div>
      <div className="live2d-overlay">
        <span className="live2d-runtime-badge">LIVE2D · WEBGL</span>
        <strong>{eventLabel}</strong>
        <small>{runtimeStatus}</small>
      </div>
    </section>
  );
}
