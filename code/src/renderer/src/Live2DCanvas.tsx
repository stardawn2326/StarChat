import { useEffect, useMemo, useRef, useState } from 'react';
import type { Live2DModelState } from '../../shared/live2d';
import type { CubismDebugCommand, CubismRuntimeCommandRequest, CursorUpdate } from '../../shared/ipc';
import type { PresentationEvent } from '../../shared/presentation';
import type { CubismGazeConfig, CubismRuntimeController, CubismRuntimeMetrics, CubismRuntimeResult } from '../../shared/cubism';
import { DEFAULT_MODEL_VIEWPORT, type ModelViewportSettings } from '../../shared/settings';
import { CharacterStateResolver } from '../../shared/character-state';
import { canvasViewport, composeAbsoluteModelTransform, petPointerOperationContract, type PetPointerOperation } from '../../shared/window-contract';
import { CursorFollowGate } from './cursor-follow-gate';
import { DialogueFocusGate } from './dialogue-focus';
import { DialogueIdleArbiter } from './dialogue-idle-arbiter';
import { IdleGazeController } from './idle-gaze';
import { IdlePresentationGate } from './idle-presentation-gate';
import { dispatchCubismRuntimeCommand, runtimeCommandPhase } from './cubism-runtime-dispatch';
import { createViewportSyncCoordinator, type ViewportFrame } from './viewport-sync';
import { createRuntimeCommandFlight } from './runtime-command-flight';

interface RuntimeModule {
  controller: CubismRuntimeController;
  startExternalLive2D(modelJsonName: string, options: unknown): Promise<void>;
  stopExternalLive2D(): void;
  getCubismMetrics(): CubismRuntimeMetrics;
}

interface Live2DCanvasProps {
  event: PresentationEvent;
  dialogueEvent?: Extract<PresentationEvent, { type: 'dialogue' }>;
  live2d: Live2DModelState;
  modelViewport?: ModelViewportSettings;
  windowAndModelDragActive?: boolean;
  cursor?: CursorUpdate | null;
  gazeConfig?: CubismGazeConfig;
  tapPoint?: { x: number; y: number } | null;
  showWatermark?: boolean;
  debugCommand?: CubismDebugCommand | null;
  runtimeCommand?: CubismRuntimeCommandRequest | null;
  onRuntimeResult?: (requestId: string, result: CubismRuntimeResult) => void;
  onFitFrame?: (bounds: { x: number; y: number; width: number; height: number }) => void;
  onModelHitChange?: (hit: boolean) => void;
  onRuntimeReady?: () => void;
  onRuntimeFailure?: (failure: { entryPath: string | null; stage: 'load' | 'initialize' | 'render'; message: string }) => void;
}

function waitForStableFrames(frameCount = 2): Promise<void> {
  if (frameCount <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      void waitForStableFrames(frameCount - 1).then(resolve);
    });
  });
}

function entryFileName(entryPath: string | null): string | null {
  if (!entryPath) {
    return null;
  }
  const parts = entryPath.split(/[\\/]/);
  return parts.at(-1) ?? null;
}

export function Live2DCanvas({ event, dialogueEvent, live2d, modelViewport = DEFAULT_MODEL_VIEWPORT, windowAndModelDragActive = false, cursor = null, gazeConfig, tapPoint = null, showWatermark = true, debugCommand = null, runtimeCommand = null, onRuntimeResult, onFitFrame, onModelHitChange, onRuntimeReady, onRuntimeFailure }: Live2DCanvasProps): JSX.Element {
  const [runtimeStatus, setRuntimeStatus] = useState('准备启动真实 Cubism WebGL');
  const [runtimeMetrics, setRuntimeMetrics] = useState<CubismRuntimeMetrics | null>(null);
  const modelJsonName = useMemo(() => entryFileName(live2d.entryPath), [live2d.entryPath]);
  const ready = live2d.status === 'ready' || live2d.status === 'ready_with_warnings';
  const runtimeRef = useMemo(() => ({ current: null as RuntimeModule | null }), []);
  const characterStateRef = useMemo(() => new CharacterStateResolver(), []);
  const lastActionRef = useRef<string | null>(null);
  const lastExpressionRef = useRef<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const windowAndModelDragActiveRef = useRef(windowAndModelDragActive);
  const viewportRef = useRef({ width: 432, height: 600, renderScale: 1 });
  const cursorFollowGateRef = useRef(new CursorFollowGate(5000));
  const dialogueFocusGateRef = useRef(new DialogueFocusGate());
  const idleGazeRef = useRef(new IdleGazeController());
  const idlePresentationGateRef = useRef(new IdlePresentationGate());
  const dialogueIdleArbiterRef = useRef(new DialogueIdleArbiter());
  const runtimeResultHandlerRef = useRef(onRuntimeResult);
  const runtimeCommandFlightRef = useRef<ReturnType<typeof createRuntimeCommandFlight<CubismRuntimeResult>> | null>(null);
  const [runtimeReadyEpoch, setRuntimeReadyEpoch] = useState(0);

  windowAndModelDragActiveRef.current = windowAndModelDragActive;
  runtimeResultHandlerRef.current = onRuntimeResult;
  if (!runtimeCommandFlightRef.current) {
    runtimeCommandFlightRef.current = createRuntimeCommandFlight<CubismRuntimeResult>(
      (requestId, result) => runtimeResultHandlerRef.current?.(requestId, result)
    );
  }

  const pauseIdlePresentation = (runtime: RuntimeModule): void => {
    idleGazeRef.current.reset();
    idlePresentationGateRef.current.pause();
    const decision = dialogueIdleArbiterRef.current.pause(runtime.controller.getRuntimeStatus().activeMotion?.priority);
    if (decision.stopIdleAction) {
      runtime.controller.stopAction();
    }
  };

  const resumeIdlePresentation = (): void => {
    idleGazeRef.current.reset();
    idlePresentationGateRef.current.reset();
    // A dialogue end re-arms scheduling only. CursorFollowGate must observe a
    // fresh five-second quiet period before a large idle action may start.
    dialogueIdleArbiterRef.current.resume();
  };
  const applyCursorFollow = (runtime: RuntimeModule, update: CursorUpdate, canvasRect: DOMRect): void => {
    if (dialogueFocusGateRef.current.shouldIgnoreCursor()) return;
    const decision = cursorFollowGateRef.current.update(update.moving, update.timestamp);
    if (decision.release) {
      idleGazeRef.current.begin(update.timestamp);
      idlePresentationGateRef.current.arm(update.timestamp);
    }
    if (decision.mode === 'released') {
      const idlePresentation = idlePresentationGateRef.current.update(update.timestamp);
      if (idlePresentation.startLargeAction) {
        void runtime.controller.playAction('idle', false);
      }
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
  }, [cursor, onModelHitChange, runtimeReadyEpoch, runtimeRef]);

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
      void runtime.controller.playSemanticExpression(snapshot.activeExpression);
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
          modelIdentity: live2d.entryPath,
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
        await waitForStableFrames(2);
        if (active) {
          setRuntimeReadyEpoch((value) => value + 1);
          onRuntimeReady?.();
        }
      })
      .catch((error: unknown) => {
        if (active) {
          onRuntimeFailure?.({
            entryPath: live2d.entryPath,
            stage: 'initialize',
            message: error instanceof Error ? error.message : 'Cubism runtime 启动失败'
          });
          setRuntimeStatus(error instanceof Error ? error.message : 'Cubism runtime 启动失败');
          void waitForStableFrames(2).then(() => {
            if (active) onRuntimeReady?.();
          });
        }
      });

    return () => {
      active = false;
    };
  }, [live2d.entryPath, modelJsonName, onRuntimeFailure, onRuntimeReady, ready, runtimeRef]);

  useEffect(() => () => {
    runtimeCommandFlightRef.current?.cancel();
    if (runtimeRef.current) {
      runtimeRef.current.stopExternalLive2D();
    } else {
      void import('./live2d-runtime.js').then((module) => module.stopExternalLive2D());
    }
  }, [runtimeRef]);

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
    const coordinator = createViewportSyncCoordinator((next: ViewportFrame) => {
      runtimeRef.current?.controller.setViewport(
        next.width,
        next.height,
        next.renderScale,
        next.screenX,
        next.screenY,
        next.preserveModelScreenAnchor
      );
    });
    let frameHandle: number | null = null;
    const flushViewport = (): void => {
      frameHandle = null;
      coordinator.flush();
    };
    const scheduleViewportFlush = (): void => {
      if (frameHandle === null) {
        frameHandle = window.requestAnimationFrame(flushViewport);
      }
    };
    const syncViewport = (
      source: 'initial' | 'resize-observer' | 'window-resize' | 'bounds',
      windowOrigin: { x: number; y: number } = { x: window.screenX, y: window.screenY },
      preserveModelScreenAnchor = !windowAndModelDragActiveRef.current
    ): void => {
      const rect = canvas.getBoundingClientRect();
      const next = canvasViewport({ width: rect.width, height: rect.height }, window.devicePixelRatio || 1);
      const renderScale = next.renderScale;
      viewportRef.current = { width: next.width, height: next.height, renderScale };
      canvas.dataset.viewportCss = `${Math.round(rect.width)}x${Math.round(rect.height)}`;
      canvas.dataset.renderScale = String(renderScale);
      coordinator.submit(source, {
        width: next.width,
        height: next.height,
        renderScale,
        screenX: windowOrigin.x,
        screenY: windowOrigin.y,
        preserveModelScreenAnchor
      });
      scheduleViewportFlush();
    };
    syncViewport('initial');
    const syncViewportFromWindow = (): void => syncViewport('window-resize');
    const observer = new ResizeObserver(() => syncViewport('resize-observer'));
    observer.observe(canvas);
    window.addEventListener('resize', syncViewportFromWindow);
    const unsubscribeBounds = window.baoyin.pet.onBoundsChange((change) => {
      const preserveModelScreenAnchor = change.operation
        ? petPointerOperationContract(change.operation as PetPointerOperation).compensateModelScreenAnchor
        : !windowAndModelDragActiveRef.current;
      syncViewport('bounds', { x: change.bounds.x, y: change.bounds.y }, preserveModelScreenAnchor);
    });
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', syncViewportFromWindow);
      unsubscribeBounds();
      if (frameHandle !== null) {
        window.cancelAnimationFrame(frameHandle);
      }
      coordinator.cancel();
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
    if (!dialogueEvent) return;
    const decision = dialogueFocusGateRef.current.transition(dialogueEvent.phase);
    const runtime = runtimeRef.current;
    if (!runtime) return;
    if (dialogueEvent.phase !== 'end') {
      if (decision.release) pauseIdlePresentation(runtime);
      runtime.controller.releaseFocus();
      if (dialogueEvent.phase === 'start' || dialogueEvent.phase === 'listening') {
        void runtime.controller.playSemanticExpression('caring_smile');
        void runtime.controller.playAction('lean_forward', true);
      }
      return;
    }
    if (!decision.resume) return;
    cursorFollowGateRef.current.reset();
    resumeIdlePresentation();
    idleGazeRef.current.reset();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect && cursor) applyCursorFollow(runtime, cursor, rect);
  }, [cursor, dialogueEvent, runtimeReadyEpoch, runtimeRef]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (runtime && tapPoint) {
      runtime.controller.tap(tapPoint.x, tapPoint.y);
    }
  }, [tapPoint, runtimeRef]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || !ready) return;
    if (event.type === 'speech' || event.type === 'dialogue') return;
    if (event.type === 'control' && event.name === 'neutral') {
      characterStateRef.apply(event);
      lastActionRef.current = null;
      lastExpressionRef.current = 'neutral';
      runtime.controller.neutral();
      runtime.controller.releaseFocus();
      if (dialogueFocusGateRef.current.transition('end').resume) {
        cursorFollowGateRef.current.reset();
        resumeIdlePresentation();
      }
      return;
    }
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
    if (!runtimeCommand) return;
    const request = runtimeCommand;
    const runtime = runtimeRef.current;
    runtimeCommandFlightRef.current?.run(
      request.requestId,
      () => dispatchCubismRuntimeCommand(runtime?.controller ?? null, request.command, live2d.entryPath),
      (reason) => {
        const status = runtime?.controller.getRuntimeStatus() ?? { modelIdentity: live2d.entryPath, activeExpression: null, activeMotion: null };
        const capabilities = runtime?.controller.getCapabilities() ?? { modelIdentity: live2d.entryPath, expressions: [], motions: [], idleGroup: null };
        return {
          ok: false,
          phase: runtimeCommandPhase(request.command),
          code: 'runtime_error',
          message: reason === 'timeout' ? 'Cubism runtime 预览超时，已释放本次请求。' : 'Cubism runtime 预览调用失败，已释放本次请求。',
          status,
          capabilities
        };
      }
    );
  }, [live2d.entryPath, runtimeCommand, runtimeReadyEpoch, runtimeRef]);

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
    : event.type === 'dialogue'
    ? `对话：${event.phase}`
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
