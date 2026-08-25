import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { CubismDebugCommand, CubismRuntimeCommandRequest, CursorUpdate, PublicAppState } from '../../shared/ipc';
import type { CubismRuntimeResult } from '../../shared/cubism';
import type { PresentationEvent } from '../../shared/presentation';
import { petInteractionEnabled } from '../../shared/pet-interaction';
import { classifyPetHit, type PetHitRegion } from '../../shared/pet-hit-testing';
import {
  DEFAULT_MODEL_VIEWPORT,
  modelViewportForPath,
  normalizeModelViewportKey,
  sanitizeModelViewport,
  type AppSettings,
  type ModelViewportSettings
} from '../../shared/settings';
import { petResizeEdge, type PetPointerOperation } from '../../shared/window-contract';
import { sanitizePresentationSettings, type PresentationSettings } from '../../shared/presentation-contract';
import { Live2DCanvas } from './Live2DCanvas';
import { createPetDragScheduler, latestPointerScreenPoint, type PetDragScheduler } from './drag-scheduler';
import { createPetResizeScheduler, type PetResizeScheduler } from './resize-scheduler';

const neutralEvent: PresentationEvent = { type: 'expression', name: 'neutral', source: 'system' };
const neutralDialogueEvent: Extract<PresentationEvent, { type: 'dialogue' }> = { type: 'dialogue', phase: 'end', source: 'system' };

interface ActivePointer {
  operation: PetPointerOperation;
  pointerId: number;
  screenX: number;
  screenY: number;
  viewport?: ModelViewportSettings;
  captureTarget: Element | null;
  pointerCaptured: boolean;
}

function PetApp(): JSX.Element {
  const [appState, setAppState] = useState<PublicAppState | null>(null);
  const [presentation, setPresentation] = useState<PresentationEvent>(neutralEvent);
  const [dialogueEvent, setDialogueEvent] = useState<Extract<PresentationEvent, { type: 'dialogue' }>>(neutralDialogueEvent);
  const [cursor, setCursor] = useState<CursorUpdate | null>(null);
  const [tapPoint, setTapPoint] = useState<{ x: number; y: number } | null>(null);
  const [debugCommand, setDebugCommand] = useState<CubismDebugCommand | null>(null);
  const [runtimeCommand, setRuntimeCommand] = useState<CubismRuntimeCommandRequest | null>(null);
  const [hintVisible, setHintVisible] = useState(false);
  const [modelEditMode, setModelEditMode] = useState(false);
  const [windowAndModelDragActive, setWindowAndModelDragActive] = useState(false);
  const [modelViewport, setModelViewport] = useState<ModelViewportSettings>(DEFAULT_MODEL_VIEWPORT);
  const [presentationSettings, setPresentationSettings] = useState<PresentationSettings | null>(null);
  const [settingsPreview, setSettingsPreview] = useState<Partial<AppSettings>>({});
  const [modelHit, setModelHit] = useState(false);
  const [runtimeReady, setRuntimeReady] = useState(false);
  const inputMode = useRef<'interactive' | 'passthrough'>('interactive');
  const activePointer = useRef<ActivePointer | null>(null);
  const windowAndModelDragActiveRef = useRef(false);
  const cursorRef = useRef<CursorUpdate | null>(null);
  const modelHitRef = useRef(false);
  const inputRecoveryPendingRef = useRef(false);
  const hoverShowTimer = useRef<number | null>(null);
  const hoverFadeTimer = useRef<number | null>(null);
  const viewportRef = useRef<ModelViewportSettings>(DEFAULT_MODEL_VIEWPORT);
  const appStateRef = useRef<PublicAppState | null>(null);
  const dragSchedulerRef = useRef<PetDragScheduler | null>(null);
  const resizeSchedulerRef = useRef<PetResizeScheduler | null>(null);
  const locked = useRef(false);
  const markWindowAndModelDrag = (active: boolean): void => {
    windowAndModelDragActiveRef.current = active;
    setWindowAndModelDragActive(active);
  };
  const hitRegion: PetHitRegion = cursor?.insideWindow
    ? classifyPetHit(
      cursor.localX * cursor.windowWidth,
      cursor.localY * cursor.windowHeight,
      cursor.windowWidth,
      cursor.windowHeight,
      modelHit
    ).region
    : 'transparent';
  const hovered = hitRegion === 'model';
  const resizeHovered = hitRegion === 'frame';
  const hoveredRef = useRef(false);
  const interactionMode = petInteractionEnabled(appState?.settings);
  const interactionModeRef = useRef(false);
  interactionModeRef.current = interactionMode;
  const isLocked = appState ? !interactionMode : false;
  const frameHover = Boolean(cursor?.insideWindow && interactionMode && !isLocked);
  const displayedModelOpacity = isLocked && hovered ? Math.min(modelViewport.modelOpacity, 0.3) : modelViewport.modelOpacity;
  // Hit regions decide the gesture automatically: model = model offset,
  // frame = native resize, transparent remainder = click-through.
  const runtimeReadySent = useRef(false);
  const modelReady = appState?.live2d.status === 'ready' || appState?.live2d.status === 'ready_with_warnings';
  appStateRef.current = appState;
  cursorRef.current = cursor;
  modelHitRef.current = modelHit;
  const currentCursorHitRegion = (): PetHitRegion => {
    const currentCursor = cursorRef.current;
    if (!currentCursor?.insideWindow) {
      return 'transparent';
    }
    return classifyPetHit(
      currentCursor.localX * currentCursor.windowWidth,
      currentCursor.localY * currentCursor.windowHeight,
      currentCursor.windowWidth,
      currentCursor.windowHeight,
      modelHitRef.current
    ).region;
  };
  const restoreInputMode = (conservativeRecovery = false): void => {
    if (activePointer.current) {
      return;
    }
    const recoveryPending = conservativeRecovery || inputRecoveryPendingRef.current;
    const nextMode = !interactionModeRef.current || locked.current
      ? 'passthrough'
      : recoveryPending || !cursorRef.current || ['model', 'frame'].includes(currentCursorHitRegion())
        ? 'interactive'
        : 'passthrough';
    inputRecoveryPendingRef.current = recoveryPending && nextMode === 'interactive';
    if (inputMode.current === nextMode) {
      return;
    }
    inputMode.current = nextMode;
    window.baoyin.app.setInputMode(nextMode);
  };
  if (!dragSchedulerRef.current) {
    dragSchedulerRef.current = createPetDragScheduler(
      (point) => window.baoyin.pet.dragMove(point),
      (callback) => window.requestAnimationFrame(callback),
      (handle) => window.cancelAnimationFrame(handle)
    );
  }
  if (!resizeSchedulerRef.current) {
    resizeSchedulerRef.current = createPetResizeScheduler(
      (point) => window.baoyin.pet.resizeMove(point),
      (callback) => window.requestAnimationFrame(callback),
      (handle) => window.cancelAnimationFrame(handle)
    );
  }

  const updateModelViewport = (next: Partial<ModelViewportSettings>, preview = true): ModelViewportSettings => {
    const updated = sanitizeModelViewport({ ...viewportRef.current, ...next });
    if (
      updated.modelOffsetX === viewportRef.current.modelOffsetX &&
      updated.modelOffsetY === viewportRef.current.modelOffsetY &&
      updated.modelScale === viewportRef.current.modelScale &&
      updated.modelOpacity === viewportRef.current.modelOpacity &&
      updated.clipWidth === viewportRef.current.clipWidth &&
      updated.clipHeight === viewportRef.current.clipHeight &&
      updated.rotation === viewportRef.current.rotation
    ) {
      return viewportRef.current;
    }
    viewportRef.current = updated;
    setModelViewport(updated);
    const state = appStateRef.current;
    const key = normalizeModelViewportKey(state?.live2d.entryPath);
    if (preview && state && key) {
      window.baoyin.settings.preview({
        domain: 'settings',
        patch: { modelViewportByModel: { ...state.settings.modelViewportByModel, [key]: updated } }
      });
    }
    return updated;
  };

  const persistModelViewport = (next: ModelViewportSettings): void => {
    const state = appStateRef.current;
    const key = normalizeModelViewportKey(state?.live2d.entryPath);
    if (!state || !key) {
      return;
    }
    void window.baoyin.settings.save({
      settings: {
        modelViewportByModel: {
          ...state.settings.modelViewportByModel,
          [key]: next
        }
      }
    });
  };

  const fitFrameToRenderedModel = useCallback((bounds: { x: number; y: number; width: number; height: number }): void => {
    const state = appStateRef.current;
    const key = normalizeModelViewportKey(state?.live2d.entryPath);
    if (!state || !key) return;
    const padding = 16;
    const shiftX = Math.round(bounds.x - padding);
    const shiftY = Math.round(bounds.y - padding);
    const nextViewport = sanitizeModelViewport({
      ...viewportRef.current,
      modelOffsetX: viewportRef.current.modelOffsetX - shiftX,
      modelOffsetY: viewportRef.current.modelOffsetY - shiftY
    });
    const nextBounds = {
      x: Math.round(window.screenX + shiftX),
      y: Math.round(window.screenY + shiftY),
      width: Math.max(240, Math.ceil(bounds.width + padding * 2)),
      height: Math.max(240, Math.ceil(bounds.height + padding * 2))
    };
    viewportRef.current = nextViewport;
    setModelViewport(nextViewport);
    void window.baoyin.settings.save({ settings: {
      petBounds: nextBounds,
      modelViewportByModel: { ...state.settings.modelViewportByModel, [key]: nextViewport }
    } });
  }, []);

  const handleRuntimeReady = useCallback((): void => {
    setRuntimeReady(true);
  }, []);

  const handleRuntimeFailure = useCallback((failure: { entryPath: string | null; stage: 'load' | 'initialize' | 'render'; message: string }): void => {
    window.baoyin.app.runtimeFailed(failure);
  }, []);

  useEffect(() => {
    document.body.dataset.window = 'pet';
    const applyPetState = (next: PublicAppState): void => {
      const viewport = modelViewportForPath(next.settings, next.live2d.entryPath);
      viewportRef.current = viewport;
      setModelViewport(viewport);
      setAppState(next);
      setPresentationSettings(next.settings.presentation);
      setSettingsPreview({});
    };
    void window.baoyin.state.get().then(applyPetState);
    const unsubscribeState = window.baoyin.state.onChange(applyPetState);
    const unsubscribePresentation = window.baoyin.presentation.onEvent((event) => {
      setPresentation(event);
      if (event.type === 'dialogue') setDialogueEvent(event);
    });
    const unsubscribeCursor = window.baoyin.cursor.onUpdate((update) => {
      cursorRef.current = update;
      inputRecoveryPendingRef.current = false;
      setCursor(update);
    });
    const unsubscribeModelEdit = window.baoyin.app.onModelEditMode(setModelEditMode);
    const unsubscribeDebug = window.baoyin.debug.onCommand(setDebugCommand);
    const unsubscribeRuntime = window.baoyin.debug.onRuntimeCommand(setRuntimeCommand);
    window.baoyin.app.runtimeCommandReady();
    const unsubscribePreview = window.baoyin.settings.onPreview((detail) => {
      if (detail.domain === 'presentation') {
        setPresentationSettings((current) => sanitizePresentationSettings({ ...(current ?? appStateRef.current?.settings.presentation), ...detail.patch }));
      } else if (detail.domain === 'settings') {
        setSettingsPreview((current) => ({ ...current, ...detail.patch }));
      }
    });
    return () => {
      delete document.body.dataset.window;
      unsubscribeState();
      unsubscribePresentation();
      unsubscribeCursor();
      unsubscribeModelEdit();
      unsubscribeDebug();
      unsubscribeRuntime();
      unsubscribePreview();
    };
  }, []);

  const handleRuntimeResult = useCallback((requestId: string, result: CubismRuntimeResult): void => {
    window.baoyin.debug.runtimeResult(requestId, result);
    setRuntimeCommand((current) => current?.requestId === requestId ? null : current);
  }, []);

  useEffect(() => {
    runtimeReadySent.current = false;
    setRuntimeReady(false);
  }, [appState?.live2d.entryPath]);

  useEffect(() => {
    if (!appState || (modelReady && !runtimeReady) || runtimeReadySent.current) {
      return;
    }
    let firstFrame = 0;
    let stableFrame = 0;
    firstFrame = window.requestAnimationFrame(() => {
      stableFrame = window.requestAnimationFrame(() => {
        runtimeReadySent.current = true;
        window.baoyin.app.runtimeReady({ entryPath: appState.live2d.entryPath });
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(stableFrame);
    };
  }, [appState, modelReady, runtimeReady]);

  useEffect(() => {
    if (appState?.settings.presentation) setPresentationSettings(appState.settings.presentation);
  }, [appState?.settings.presentation]);

  useEffect(() => {
    if (!appState) {
      return;
    }
    const next = modelViewportForPath(appState.settings, appState.live2d.entryPath);
    viewportRef.current = next;
    setModelViewport(next);
  }, [appState?.live2d.entryPath, appState?.settings.modelViewportByModel]);

  useEffect(() => {
    locked.current = !interactionMode;
    if (locked.current) {
      setModelEditMode(false);
      inputMode.current = 'passthrough';
      window.baoyin.app.setInputMode('passthrough');
    }
  }, [interactionMode]);

  useEffect(() => {
    hoveredRef.current = hovered;
    if (hoverShowTimer.current) window.clearTimeout(hoverShowTimer.current);
    if (hoverFadeTimer.current) window.clearTimeout(hoverFadeTimer.current);
    if (hovered && isLocked) {
      hoverShowTimer.current = window.setTimeout(() => setHintVisible(true), appState?.settings.petHoverShowDelayMs ?? 80);
    } else {
      hoverFadeTimer.current = window.setTimeout(() => setHintVisible(false), appState?.settings.petHoverFadeMs ?? 420);
    }
    return () => {
      if (hoverShowTimer.current) window.clearTimeout(hoverShowTimer.current);
      if (hoverFadeTimer.current) window.clearTimeout(hoverFadeTimer.current);
    };
  }, [hovered, isLocked, appState?.settings.petHoverFadeMs, appState?.settings.petHoverShowDelayMs]);

  useEffect(() => {
    restoreInputMode();
  }, [cursor?.timestamp, hitRegion, interactionMode]);

  useEffect(() => {
    const handleContextMenu = (event: MouseEvent): void => {
      if (locked.current || !interactionMode || !hoveredRef.current) {
        return;
      }
      event.preventDefault();
      window.baoyin.app.showContextMenu();
    };
    const capturePointer = (event: PointerEvent): { captureTarget: Element | null; pointerCaptured: boolean } => {
      const captureTarget = event.target instanceof Element ? event.target : null;
      try {
        captureTarget?.setPointerCapture(event.pointerId);
        return {
          captureTarget,
          pointerCaptured: Boolean(captureTarget?.hasPointerCapture(event.pointerId))
        };
      } catch {
        // Some Chromium targets reject capture after a forwarded click. The
        // document-level listener remains the safe fallback.
        return { captureTarget, pointerCaptured: false };
      }
    };
    const handlePointerDown = (event: PointerEvent): void => {
      if (event.button !== 0) {
        return;
      }
      if (locked.current || !interactionMode) {
        return;
      }
      if (activePointer.current) {
        finalizeActivePointer(null, true);
      }
      // A new left-button gesture is the authoritative recovery point. This
      // clears a renderer/main-process transaction whose ending event was lost.
      window.baoyin.pet.pointerCancel();
      markWindowAndModelDrag(false);
      restoreInputMode(true);
      const resizeEdge = petResizeEdge(event.clientX, event.clientY, window.innerWidth, window.innerHeight);
      if (event.altKey) {
        if (!resizeEdge && !hoveredRef.current) return;
        const { captureTarget, pointerCaptured } = capturePointer(event);
        activePointer.current = {
          operation: 'window-and-model-drag',
          pointerId: event.pointerId,
          screenX: event.screenX,
          screenY: event.screenY,
          captureTarget,
          pointerCaptured
        };
        markWindowAndModelDrag(true);
        window.baoyin.pet.dragStart({ screenX: event.screenX, screenY: event.screenY });
        event.preventDefault();
        return;
      }
      if (resizeEdge) {
        resizeSchedulerRef.current?.cancel();
        const { captureTarget, pointerCaptured } = capturePointer(event);
        activePointer.current = {
          operation: 'window-resize', pointerId: event.pointerId,
          screenX: event.screenX, screenY: event.screenY, viewport: viewportRef.current,
          captureTarget, pointerCaptured
        };
        window.baoyin.pet.resizeStart({ screenX: event.screenX, screenY: event.screenY, edge: resizeEdge });
        event.preventDefault();
        return;
      }
      if (!hoveredRef.current) return;
      const { captureTarget, pointerCaptured } = capturePointer(event);
      activePointer.current = {
        operation: 'model-transform',
        pointerId: event.pointerId,
        screenX: event.screenX,
        screenY: event.screenY,
        viewport: viewportRef.current,
        captureTarget,
        pointerCaptured
      };
      event.preventDefault();
      return;
    };
    const handlePointerMove = (event: PointerEvent): void => {
      const gesture = activePointer.current;
      if (!gesture || gesture.pointerId !== event.pointerId) {
        return;
      }
      if (gesture.operation === 'model-transform' && gesture.viewport) {
        updateModelViewport({
          modelOffsetX: gesture.viewport.modelOffsetX + event.screenX - gesture.screenX,
          modelOffsetY: gesture.viewport.modelOffsetY + event.screenY - gesture.screenY
        });
        event.preventDefault();
        return;
      }
      if (gesture.operation === 'window-and-model-drag') {
        dragSchedulerRef.current?.queue(latestPointerScreenPoint(event));
        event.preventDefault();
      }
      if (gesture.operation === 'window-resize') {
        resizeSchedulerRef.current?.queue(latestPointerScreenPoint(event));
        event.preventDefault();
      }
    };

    const finalizeActivePointer = (event: PointerEvent | null, cancelled = false): void => {
      const gesture = activePointer.current;
      if (!gesture || (event && gesture.pointerId !== event.pointerId)) {
        return;
      }
      if (event?.type === 'lostpointercapture' && (!gesture.pointerCaptured || (gesture.captureTarget && event.target !== gesture.captureTarget))) {
        return;
      }
      const pointerId = event?.pointerId ?? gesture.pointerId;
      const captureTarget = gesture.captureTarget;
      const hasPointerCapture = gesture.pointerCaptured && Boolean(captureTarget?.hasPointerCapture(pointerId));
      // Clear local ownership before releasePointerCapture. Chromium may emit
      // lostpointercapture synchronously, and that event must observe an
      // already-finalized gesture rather than send a second end/cancel IPC.
      activePointer.current = null;
      try {
        if (hasPointerCapture) {
          captureTarget?.releasePointerCapture(pointerId);
        }
      } catch {
        // Capture can already be released by Chromium on cancellation.
      }
      if (gesture.operation === 'model-transform') {
        persistModelViewport(viewportRef.current);
        if (cancelled) {
          window.baoyin.pet.pointerCancel();
        }
        restoreInputMode(true);
        event?.preventDefault();
        return;
      }
      if (gesture.operation === 'window-and-model-drag') {
        if (cancelled) dragSchedulerRef.current?.cancel();
        else dragSchedulerRef.current?.flush();
        if (cancelled) {
          window.baoyin.pet.pointerCancel();
        } else {
          window.baoyin.pet.dragEnd();
        }
        event?.preventDefault();
        restoreInputMode(true);
        markWindowAndModelDrag(false);
        if (event && !cancelled && Math.hypot(event.screenX - gesture.screenX, event.screenY - gesture.screenY) < 5 && !locked.current) {
          const width = Math.max(1, window.innerWidth);
          const height = Math.max(1, window.innerHeight);
          setTapPoint({ x: (event.clientX / width - 0.5) * 2, y: (0.5 - event.clientY / height) * 2 });
          window.setTimeout(() => setTapPoint(null), 0);
        }
      }
      if (gesture.operation === 'window-resize') {
        if (cancelled) {
          resizeSchedulerRef.current?.cancel();
        } else {
          resizeSchedulerRef.current?.flush();
        }
        if (cancelled) {
          window.baoyin.pet.pointerCancel();
        } else {
          window.baoyin.pet.resizeEnd();
        }
        restoreInputMode(true);
        event?.preventDefault();
      }
    };
    const cancelActivePointer = (): void => {
      finalizeActivePointer(null, true);
    };
    const handleWindowFocus = (): void => {
      restoreInputMode(true);
    };
    const handleVisibilityChange = (): void => {
      if (document.visibilityState !== 'visible') {
        cancelActivePointer();
      } else {
        restoreInputMode(true);
      }
    };
    const handleLostPointerCapture = (event: PointerEvent): void => {
      finalizeActivePointer(event, true);
    };
    const handlePointerEnd = (event: PointerEvent): void => {
      finalizeActivePointer(event, event.type === 'pointercancel');
    };
    const handleWheel = (event: WheelEvent): void => {
      if (locked.current) {
        return;
      }
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.08 : 0.925;
      const next = updateModelViewport({ modelScale: viewportRef.current.modelScale * factor });
      persistModelViewport(next);
    };
    document.addEventListener('contextmenu', handleContextMenu, true);
    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('pointermove', handlePointerMove, true);
    window.addEventListener('pointerup', handlePointerEnd, true);
    window.addEventListener('pointercancel', handlePointerEnd, true);
    window.addEventListener('lostpointercapture', handleLostPointerCapture, true);
    window.addEventListener('blur', cancelActivePointer, true);
    window.addEventListener('focus', handleWindowFocus, true);
    document.addEventListener('visibilitychange', handleVisibilityChange, true);
    window.addEventListener('wheel', handleWheel, { capture: true, passive: false });
    const initialMode = 'passthrough';
    inputMode.current = initialMode;
    window.baoyin.app.setInputMode(initialMode);
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu, true);
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('pointermove', handlePointerMove, true);
      window.removeEventListener('pointerup', handlePointerEnd, true);
      window.removeEventListener('pointercancel', handlePointerEnd, true);
      window.removeEventListener('lostpointercapture', handleLostPointerCapture, true);
      window.removeEventListener('blur', cancelActivePointer, true);
      window.removeEventListener('focus', handleWindowFocus, true);
      document.removeEventListener('visibilitychange', handleVisibilityChange, true);
      window.removeEventListener('wheel', handleWheel, true);
      cancelActivePointer();
      window.baoyin.pet.pointerCancel();
      dragSchedulerRef.current?.cancel();
      resizeSchedulerRef.current?.cancel();
    };
  }, [interactionMode]);

  if (!appState) {
    return <main className="pet-shell pet-loading" aria-label="白音桌宠窗口" data-pet-role="pet" />;
  }

  const effectiveSettings = { ...appState.settings, ...settingsPreview };
  return (
    <main
      className={`pet-shell${hintVisible || resizeHovered ? ' pet-hovered' : ''}${modelEditMode ? ' pet-model-editing' : ''}`}
      aria-label="白音透明桌宠窗口"
      data-pet-role="pet"
      data-pet-hovered={hovered ? 'true' : 'false'}
      data-pet-frame-hover={frameHover ? 'true' : 'false'}
      data-pet-interaction-mode={interactionMode ? 'true' : 'false'}
      data-pet-model-edit-mode={modelEditMode ? 'true' : 'false'}
      data-pet-locked={isLocked ? 'true' : 'false'}
      data-pet-locked-hover={isLocked && hovered ? 'true' : 'false'}
      data-live2d-status={appState.live2d.status}
      data-model-offset-x={modelViewport.modelOffsetX}
      data-model-offset-y={modelViewport.modelOffsetY}
      data-model-scale={modelViewport.modelScale}
      style={{ '--pet-hover-border-opacity': appState.settings.petHoverBorderOpacity } as CSSProperties}
    >
      <div className="pet-resize-frame" aria-hidden="true" />
      {modelReady ? (
        <Live2DCanvas
          event={presentation}
          dialogueEvent={dialogueEvent}
          live2d={appState.live2d}
          modelViewport={{ ...modelViewport, modelOpacity: displayedModelOpacity }}
          windowAndModelDragActive={windowAndModelDragActive}
          cursor={cursor}
          gazeConfig={{
            enabled: effectiveSettings.cursorTrackingEnabled,
            eyeWeight: effectiveSettings.cursorEyeWeight,
            headWeight: effectiveSettings.cursorHeadWeight,
            bodyWeight: effectiveSettings.cursorBodyWeight,
            smoothing: effectiveSettings.cursorSmoothing,
            maxStep: effectiveSettings.cursorMaxStep,
            rangeX: effectiveSettings.cursorRangeX,
            rangeY: effectiveSettings.cursorRangeY,
            idleMotionAmplitude: effectiveSettings.cursorIdleMotion,
            bodyFollowStrength: presentationSettings?.bodyFollowStrength,
            bodyLag: presentationSettings?.bodyLag,
            inertiaStrength: presentationSettings?.inertiaStrength,
            idleSwayStrength: presentationSettings?.idleSwayStrength,
            physicsEnabled: presentationSettings?.physicsEnabled
          }}
          tapPoint={tapPoint}
          showWatermark={appState.settings.live2dShowWatermark}
          debugCommand={debugCommand}
          runtimeCommand={runtimeCommand}
          onRuntimeResult={handleRuntimeResult}
          onFitFrame={fitFrameToRenderedModel}
          onModelHitChange={setModelHit}
          onRuntimeReady={handleRuntimeReady}
          onRuntimeFailure={handleRuntimeFailure}
        />
      ) : (
        <section className="pet-safe-state" aria-label="外部模型状态">
          <strong>外部模型未就绪</strong>
          <span>{appState.live2d.message}</span>
        </section>
      )}
    </main>
  );
}

export default PetApp;
