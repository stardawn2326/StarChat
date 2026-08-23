import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { CubismDebugCommand, CursorUpdate, PublicAppState } from '../../shared/ipc';
import type { PresentationEvent } from '../../shared/presentation';
import {
  DEFAULT_MODEL_VIEWPORT,
  modelViewportForPath,
  normalizeModelViewportKey,
  sanitizeModelViewport,
  type ModelViewportSettings
} from '../../shared/settings';
import type { PetPointerOperation } from '../../shared/window-contract';
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
  captureTarget: Element | null;
}

function isModelApproximation(cursor: CursorUpdate | null): boolean {
  if (!cursor?.insideWindow) {
    return false;
  }
  const x = cursor.localX;
  const y = cursor.localY;
  if (x < 0.12 || x > 0.88 || y < 0.04 || y > 0.98) {
    return false;
  }
  // Conservative silhouette approximation: an elliptical head/torso area with
  // a wider lower body. The actual ArtMesh hit test remains in the runtime.
  const head = ((x - 0.5) / 0.34) ** 2 + ((y - 0.3) / 0.32) ** 2 <= 1;
  const body = ((x - 0.5) / 0.4) ** 2 + ((y - 0.68) / 0.46) ** 2 <= 1;
  return head || body;
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
  const inputMode = useRef<'interactive' | 'passthrough'>('interactive');
  const activePointer = useRef<ActivePointer | null>(null);
  const hoverShowTimer = useRef<number | null>(null);
  const hoverFadeTimer = useRef<number | null>(null);
  const viewportRef = useRef<ModelViewportSettings>(DEFAULT_MODEL_VIEWPORT);
  const appStateRef = useRef<PublicAppState | null>(null);
  const dragSchedulerRef = useRef<PetDragScheduler | null>(null);
  const locked = useRef(false);
  const hovered = isModelApproximation(cursor);
  const hoveredRef = useRef(false);
  const isLocked = appState?.settings.petLocked === true;
  const interactionMode = (appState?.settings.petInteractionMode === true || modelEditMode) && !isLocked;
  appStateRef.current = appState;
  if (!dragSchedulerRef.current) {
    dragSchedulerRef.current = createPetDragScheduler(
      (point) => window.baoyin.pet.dragMove(point),
      (callback) => window.requestAnimationFrame(callback),
      (handle) => window.cancelAnimationFrame(handle)
    );
  }

  const updateModelViewport = (next: Partial<ModelViewportSettings>): ModelViewportSettings => {
    const updated = sanitizeModelViewport({ ...viewportRef.current, ...next });
    viewportRef.current = updated;
    setModelViewport(updated);
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

  useEffect(() => {
    document.body.dataset.window = 'pet';
    void window.baoyin.state.get().then((next) => {
      setAppState(next);
      setPresentationSettings(next.settings.presentation);
    });
    const unsubscribeState = window.baoyin.state.onChange(setAppState);
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
    locked.current = appState?.settings.petLocked === true;
    if (locked.current) {
      setModelEditMode(false);
      inputMode.current = 'passthrough';
      window.baoyin.app.setInputMode('passthrough');
    }
  }, [appState?.settings.petLocked]);

  useEffect(() => {
    hoveredRef.current = hovered;
    if (hoverShowTimer.current) window.clearTimeout(hoverShowTimer.current);
    if (hoverFadeTimer.current) window.clearTimeout(hoverFadeTimer.current);
    if (hovered && !locked.current) {
      hoverShowTimer.current = window.setTimeout(() => setHintVisible(true), appState?.settings.petHoverShowDelayMs ?? 80);
    } else {
      hoverFadeTimer.current = window.setTimeout(() => setHintVisible(false), appState?.settings.petHoverFadeMs ?? 420);
    }
    return () => {
      if (hoverShowTimer.current) window.clearTimeout(hoverShowTimer.current);
      if (hoverFadeTimer.current) window.clearTimeout(hoverFadeTimer.current);
    };
  }, [hovered, appState?.settings.petHoverFadeMs, appState?.settings.petHoverShowDelayMs]);

  useEffect(() => {
    const nextMode = interactionMode && hovered && !locked.current ? 'interactive' : 'passthrough';
    if (nextMode !== inputMode.current && !activePointer.current) {
      inputMode.current = nextMode;
      window.baoyin.app.setInputMode(nextMode);
    }
  }, [hovered, interactionMode, appState?.settings.petLocked]);

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
      const target = event.target;
      if (target instanceof Element && target.closest('.model-viewport-controls')) {
        return;
      }
      if (locked.current || activePointer.current || (!modelEditMode && (!interactionMode || !hoveredRef.current))) {
        return;
      }
      const captureTarget = event.target instanceof Element ? event.target : null;
      try {
        captureTarget?.setPointerCapture(event.pointerId);
      } catch {
        // Some Chromium targets reject capture after a forwarded click. The
        // document-level listener remains the safe fallback.
      }
      if (modelEditMode) {
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
      }
      activePointer.current = {
        operation: 'window-drag',
        pointerId: event.pointerId,
        screenX: event.screenX,
        screenY: event.screenY,
        captureTarget
      };
      inputMode.current = 'interactive';
      window.baoyin.app.setInputMode('interactive');
      window.baoyin.pet.dragStart({ screenX: event.screenX, screenY: event.screenY });
      event.preventDefault();
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
      if (gesture.operation === 'window-drag') {
        dragSchedulerRef.current?.queue(latestPointerScreenPoint(event));
        event.preventDefault();
      }
    };
    const handlePointerEnd = (event: PointerEvent): void => {
      const gesture = activePointer.current;
      if (!gesture || gesture.pointerId !== event.pointerId) {
        return;
      }
      try {
        if (gesture.captureTarget?.hasPointerCapture(event.pointerId)) {
          gesture.captureTarget.releasePointerCapture(event.pointerId);
        }
      } catch {
        // Capture can already be released by Chromium on cancellation.
      }
      activePointer.current = null;
      if (gesture.operation === 'model-transform') {
        const next = viewportRef.current;
        persistModelViewport(next);
        event.preventDefault();
        return;
      }
      if (gesture.operation === 'window-drag') {
        dragSchedulerRef.current?.flush();
        window.baoyin.pet.dragEnd();
        event.preventDefault();
        const nextMode = interactionMode && hoveredRef.current ? 'interactive' : 'passthrough';
        inputMode.current = nextMode;
        window.baoyin.app.setInputMode(nextMode);
        if (Math.hypot(event.screenX - gesture.screenX, event.screenY - gesture.screenY) < 5 && !locked.current) {
          const width = Math.max(1, window.innerWidth);
          const height = Math.max(1, window.innerHeight);
          setTapPoint({ x: (event.clientX / width - 0.5) * 2, y: (0.5 - event.clientY / height) * 2 });
          window.setTimeout(() => setTapPoint(null), 0);
        }
      }
    };
    const handleWheel = (event: WheelEvent): void => {
      const target = event.target;
      if (target instanceof Element && target.closest('.model-viewport-controls')) {
        return;
      }
      if (!modelEditMode || locked.current) {
        return;
      }
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.08 : 0.925;
      const next = updateModelViewport({ modelScale: viewportRef.current.modelScale * factor });
      persistModelViewport(next);
    };
    document.addEventListener('contextmenu', handleContextMenu, true);
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('pointermove', handlePointerMove, true);
    document.addEventListener('pointerup', handlePointerEnd, true);
    document.addEventListener('pointercancel', handlePointerEnd, true);
    document.addEventListener('wheel', handleWheel, { capture: true, passive: false });
    const initialMode = modelEditMode && !locked.current ? 'interactive' : 'passthrough';
    inputMode.current = initialMode;
    window.baoyin.app.setInputMode(initialMode);
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu, true);
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('pointermove', handlePointerMove, true);
      document.removeEventListener('pointerup', handlePointerEnd, true);
      document.removeEventListener('pointercancel', handlePointerEnd, true);
      document.removeEventListener('wheel', handleWheel, true);
       const gesture = activePointer.current;
       if (gesture) {
         if (gesture.operation === 'window-drag') {
           dragSchedulerRef.current?.flush();
           window.baoyin.pet.dragEnd();
         }
        if (gesture.operation === 'model-transform') persistModelViewport(viewportRef.current);
        try {
          if (gesture.captureTarget?.hasPointerCapture(gesture.pointerId)) {
            gesture.captureTarget.releasePointerCapture(gesture.pointerId);
          }
        } catch {
          // no-op
        }
         activePointer.current = null;
       }
       dragSchedulerRef.current?.cancel();
     };
  }, [interactionMode, modelEditMode]);

  if (!appState) {
    return <main className="pet-shell pet-loading" aria-label="白音桌宠窗口" data-pet-role="pet" />;
  }

  const modelReady = appState.live2d.status === 'ready' || appState.live2d.status === 'ready_with_warnings';
  return (
    <main
      className={`pet-shell${hintVisible ? ' pet-hovered' : ''}${modelEditMode ? ' pet-model-editing' : ''}`}
      aria-label="白音透明桌宠窗口"
      data-pet-role="pet"
      data-pet-hovered={hovered ? 'true' : 'false'}
      data-pet-interaction-mode={interactionMode ? 'true' : 'false'}
      data-pet-model-edit-mode={modelEditMode ? 'true' : 'false'}
      data-pet-locked={isLocked ? 'true' : 'false'}
      data-live2d-status={appState.live2d.status}
      data-model-offset-x={modelViewport.modelOffsetX}
      data-model-offset-y={modelViewport.modelOffsetY}
      data-model-scale={modelViewport.modelScale}
      style={{ '--pet-hover-border-opacity': appState.settings.petHoverBorderOpacity } as CSSProperties}
    >
      {modelReady ? (
        <Live2DCanvas
          event={presentation}
          live2d={appState.live2d}
          modelViewport={modelViewport}
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
        />
      ) : (
        <section className="pet-safe-state" aria-label="外部模型状态">
          <strong>外部模型未就绪</strong>
          <span>{appState.live2d.message}</span>
        </section>
      )}
      {modelEditMode && modelReady ? (
        <div className="model-viewport-controls" role="toolbar" aria-label="模型视口调整">
          <span>调整模型：拖动 · 滚轮缩放</span>
          <button type="button" onClick={() => persistModelViewport(updateModelViewport({ modelOffsetX: 0, modelOffsetY: 0 }))}>模型居中</button>
          <button type="button" onClick={() => persistModelViewport(updateModelViewport({ modelOffsetX: 0, modelOffsetY: 0, modelScale: 0.92 }))}>适应高度</button>
          <button type="button" onClick={() => persistModelViewport(updateModelViewport(DEFAULT_MODEL_VIEWPORT))}>恢复默认</button>
        </div>
      ) : null}
    </main>
  );
}

export default PetApp;
