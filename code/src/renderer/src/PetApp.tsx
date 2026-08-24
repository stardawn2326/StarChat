import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { CubismDebugCommand, CursorUpdate, PublicAppState } from '../../shared/ipc';
import type { PresentationEvent } from '../../shared/presentation';
import { petInteractionEnabled } from '../../shared/pet-interaction';
import { classifyPetHit, type PetHitRegion } from '../../shared/pet-hit-testing';
import {
  DEFAULT_MODEL_VIEWPORT,
  modelViewportForPath,
  normalizeModelViewportKey,
  sanitizeModelViewport,
  type ModelViewportSettings
} from '../../shared/settings';
import { compensateModelViewportForWindowOrigin, petResizeEdge, type PetPointerOperation, type PetResizeEdge } from '../../shared/window-contract';
import { sanitizePresentationSettings, type PresentationSettings } from '../../shared/presentation-contract';
import { Live2DCanvas } from './Live2DCanvas';
import { createPetDragScheduler, latestPointerScreenPoint, type PetDragScheduler } from './drag-scheduler';

const neutralEvent: PresentationEvent = { type: 'expression', name: 'neutral', source: 'system' };

interface ActivePointer {
  operation: PetPointerOperation;
  pointerId: number;
  screenX: number;
  screenY: number;
  viewport?: ModelViewportSettings;
  windowX?: number;
  windowY?: number;
  resizeEdge?: PetResizeEdge;
  captureTarget: Element | null;
}

function PetApp(): JSX.Element {
  const [appState, setAppState] = useState<PublicAppState | null>(null);
  const [presentation, setPresentation] = useState<PresentationEvent>(neutralEvent);
  const [cursor, setCursor] = useState<CursorUpdate | null>(null);
  const [tapPoint, setTapPoint] = useState<{ x: number; y: number } | null>(null);
  const [debugCommand, setDebugCommand] = useState<CubismDebugCommand | null>(null);
  const [hintVisible, setHintVisible] = useState(false);
  const [modelEditMode, setModelEditMode] = useState(false);
  const [modelViewport, setModelViewport] = useState<ModelViewportSettings>(DEFAULT_MODEL_VIEWPORT);
  const [presentationSettings, setPresentationSettings] = useState<PresentationSettings | null>(null);
  const [modelHit, setModelHit] = useState(false);
  const [runtimeReady, setRuntimeReady] = useState(false);
  const inputMode = useRef<'interactive' | 'passthrough'>('interactive');
  const activePointer = useRef<ActivePointer | null>(null);
  const hoverShowTimer = useRef<number | null>(null);
  const hoverFadeTimer = useRef<number | null>(null);
  const viewportRef = useRef<ModelViewportSettings>(DEFAULT_MODEL_VIEWPORT);
  const appStateRef = useRef<PublicAppState | null>(null);
  const dragSchedulerRef = useRef<PetDragScheduler | null>(null);
  const resizeViewportFrameRef = useRef<number | null>(null);
  const locked = useRef(false);
  const hitRegion: PetHitRegion = cursor?.insideWindow
    ? classifyPetHit(
      cursor.localX * cursor.windowWidth,
      cursor.localY * cursor.windowHeight,
      cursor.windowWidth,
      cursor.windowHeight,
      modelHit
    ).region
    : 'transparent';
  const hitRegionRef = useRef<PetHitRegion>('transparent');
  hitRegionRef.current = hitRegion;
  const hovered = hitRegion === 'model';
  const resizeHovered = hitRegion === 'frame';
  const transparentHit = hitRegion === 'transparent';
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
  if (!dragSchedulerRef.current) {
    dragSchedulerRef.current = createPetDragScheduler(
      (point) => window.baoyin.pet.dragMove(point),
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

  useEffect(() => {
    document.body.dataset.window = 'pet';
    const applyPetState = (next: PublicAppState): void => {
      const viewport = modelViewportForPath(next.settings, next.live2d.entryPath);
      viewportRef.current = viewport;
      setModelViewport(viewport);
      setAppState(next);
      setPresentationSettings(next.settings.presentation);
    };
    void window.baoyin.state.get().then(applyPetState);
    const unsubscribeState = window.baoyin.state.onChange(applyPetState);
    const unsubscribePresentation = window.baoyin.presentation.onEvent(setPresentation);
    const unsubscribeCursor = window.baoyin.cursor.onUpdate(setCursor);
    const unsubscribeModelEdit = window.baoyin.app.onModelEditMode(setModelEditMode);
    const unsubscribeDebug = window.baoyin.debug.onCommand(setDebugCommand);
    const unsubscribePreview = window.baoyin.settings.onPreview((detail) => {
      if (detail.domain === 'presentation') {
        setPresentationSettings((current) => sanitizePresentationSettings({ ...(current ?? appStateRef.current?.settings.presentation), ...detail.patch }));
      }
    });
    return () => {
      delete document.body.dataset.window;
      unsubscribeState();
      unsubscribePresentation();
      unsubscribeCursor();
      unsubscribeModelEdit();
      unsubscribeDebug();
      unsubscribePreview();
    };
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
        window.baoyin.app.runtimeReady();
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
    const nextMode = interactionMode && !transparentHit && (hitRegion === 'model' || hitRegion === 'frame') && !locked.current ? 'interactive' : 'passthrough';
    if (nextMode !== inputMode.current && !activePointer.current) {
      inputMode.current = nextMode;
      window.baoyin.app.setInputMode(nextMode);
    }
  }, [hitRegion, interactionMode]);

  useEffect(() => {
    const handleContextMenu = (event: MouseEvent): void => {
      if (locked.current || !interactionMode || !hoveredRef.current) {
        return;
      }
      event.preventDefault();
      window.baoyin.app.showContextMenu();
    };
    const handlePointerDown = (event: PointerEvent): void => {
      if (event.button !== 0) {
        return;
      }
      if (locked.current || activePointer.current || !interactionMode) {
        return;
      }
      const resizeEdge = petResizeEdge(event.clientX, event.clientY, window.innerWidth, window.innerHeight);
      if (event.altKey) {
        if (!resizeEdge && !hoveredRef.current) return;
        const captureTarget = event.target instanceof Element ? event.target : null;
        try { captureTarget?.setPointerCapture(event.pointerId); } catch { /* document fallback */ }
        activePointer.current = {
          operation: 'window-and-model-drag',
          pointerId: event.pointerId,
          screenX: event.screenX,
          screenY: event.screenY,
          captureTarget
        };
        window.baoyin.pet.dragStart({ screenX: event.screenX, screenY: event.screenY });
        event.preventDefault();
        return;
      }
      if (resizeEdge) {
        const captureTarget = event.target instanceof Element ? event.target : null;
        try { captureTarget?.setPointerCapture(event.pointerId); } catch { /* document fallback */ }
        activePointer.current = {
          operation: 'window-resize', pointerId: event.pointerId, resizeEdge,
          screenX: event.screenX, screenY: event.screenY, viewport: viewportRef.current,
          windowX: window.screenX, windowY: window.screenY, captureTarget
        };
        window.baoyin.pet.resizeStart({ screenX: event.screenX, screenY: event.screenY, edge: resizeEdge });
        event.preventDefault();
        return;
      }
      if (!hoveredRef.current) return;
      const captureTarget = event.target instanceof Element ? event.target : null;
      try {
        captureTarget?.setPointerCapture(event.pointerId);
      } catch {
        // Some Chromium targets reject capture after a forwarded click. The
        // document-level listener remains the safe fallback.
      }
      activePointer.current = {
        operation: 'model-transform',
        pointerId: event.pointerId,
        screenX: event.screenX,
        screenY: event.screenY,
        viewport: viewportRef.current,
        captureTarget
      };
      event.preventDefault();
      return;
    };
    const compensateResizeViewport = (gesture: ActivePointer): Partial<ModelViewportSettings> | null => {
      if (!gesture.viewport) return null;
      return compensateModelViewportForWindowOrigin(
        gesture.viewport,
        { x: gesture.windowX ?? window.screenX, y: gesture.windowY ?? window.screenY, width: window.innerWidth, height: window.innerHeight },
        { x: window.screenX, y: window.screenY, width: window.innerWidth, height: window.innerHeight }
      );
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
        window.baoyin.pet.resizeMove(latestPointerScreenPoint(event));
        if (resizeViewportFrameRef.current === null) {
          resizeViewportFrameRef.current = window.requestAnimationFrame(() => {
            resizeViewportFrameRef.current = null;
            if (activePointer.current !== gesture || !gesture.viewport) return;
            const compensated = compensateResizeViewport(gesture);
            if (compensated) updateModelViewport(compensated, false);
          });
        }
        event.preventDefault();
      }
    };

    const finalizeActivePointer = (event: PointerEvent | null, cancelled = false): void => {
      const gesture = activePointer.current;
      if (!gesture || (event && gesture.pointerId !== event.pointerId)) {
        return;
      }
      try {
        const pointerId = event?.pointerId ?? gesture.pointerId;
        if (gesture.captureTarget?.hasPointerCapture(pointerId)) {
          gesture.captureTarget.releasePointerCapture(pointerId);
        }
      } catch {
        // Capture can already be released by Chromium on cancellation.
      }
      activePointer.current = null;
      if (gesture.operation === 'model-transform') {
        persistModelViewport(viewportRef.current);
        event?.preventDefault();
        return;
      }
      if (gesture.operation === 'window-and-model-drag') {
        if (cancelled) dragSchedulerRef.current?.cancel();
        else dragSchedulerRef.current?.flush();
        window.baoyin.pet.dragEnd();
        event?.preventDefault();
        const transparentHit = hitRegionRef.current === 'transparent';
        const nextMode = interactionModeRef.current && !transparentHit ? 'interactive' : 'passthrough';
        inputMode.current = nextMode;
        window.baoyin.app.setInputMode(nextMode);
        if (event && !cancelled && Math.hypot(event.screenX - gesture.screenX, event.screenY - gesture.screenY) < 5 && !locked.current) {
          const width = Math.max(1, window.innerWidth);
          const height = Math.max(1, window.innerHeight);
          setTapPoint({ x: (event.clientX / width - 0.5) * 2, y: (0.5 - event.clientY / height) * 2 });
          window.setTimeout(() => setTapPoint(null), 0);
        }
      }
      if (gesture.operation === 'window-resize') {
        if (resizeViewportFrameRef.current !== null) {
          window.cancelAnimationFrame(resizeViewportFrameRef.current);
          resizeViewportFrameRef.current = null;
        }
        const compensated = compensateResizeViewport(gesture);
        if (compensated) {
          updateModelViewport(compensated, false);
          persistModelViewport(viewportRef.current);
        }
        window.baoyin.pet.resizeEnd();
        event?.preventDefault();
      }
      if (cancelled) {
        inputMode.current = 'passthrough';
        window.baoyin.app.setInputMode('passthrough');
      }
    };
    const cancelActivePointer = (): void => {
      finalizeActivePointer(null, true);
    };
    const handlePointerEnd = (event: PointerEvent): void => {
      finalizeActivePointer(event, event.type === 'pointercancel');
    };
    const handleWheel = (event: WheelEvent): void => {
      if (!modelEditMode || locked.current) {
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
    window.addEventListener('blur', cancelActivePointer, true);
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
      window.removeEventListener('blur', cancelActivePointer, true);
      window.removeEventListener('wheel', handleWheel, true);
      if (resizeViewportFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeViewportFrameRef.current);
        resizeViewportFrameRef.current = null;
      }
      cancelActivePointer();
      dragSchedulerRef.current?.cancel();
    };
  }, [interactionMode, modelEditMode]);

  if (!appState) {
    return <main className="pet-shell pet-loading" aria-label="白音桌宠窗口" data-pet-role="pet" />;
  }

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
          live2d={appState.live2d}
          modelViewport={{ ...modelViewport, modelOpacity: displayedModelOpacity }}
          cursor={cursor}
          gazeConfig={{
            enabled: appState.settings.cursorTrackingEnabled,
            eyeWeight: appState.settings.cursorEyeWeight,
            headWeight: appState.settings.cursorHeadWeight,
            bodyWeight: appState.settings.cursorBodyWeight,
            smoothing: appState.settings.cursorSmoothing,
            maxStep: appState.settings.cursorMaxStep,
            rangeX: appState.settings.cursorRangeX,
            rangeY: appState.settings.cursorRangeY,
            idleMotionAmplitude: appState.settings.cursorIdleMotion,
            bodyFollowStrength: presentationSettings?.bodyFollowStrength,
            bodyLag: presentationSettings?.bodyLag,
            inertiaStrength: presentationSettings?.inertiaStrength,
            idleSwayStrength: presentationSettings?.idleSwayStrength,
            physicsEnabled: presentationSettings?.physicsEnabled
          }}
          tapPoint={tapPoint}
          showWatermark={appState.settings.live2dShowWatermark}
          debugCommand={debugCommand}
          onFitFrame={fitFrameToRenderedModel}
          onModelHitChange={setModelHit}
          onRuntimeReady={handleRuntimeReady}
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
