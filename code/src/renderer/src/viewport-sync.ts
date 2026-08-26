export interface ViewportFrame {
  width: number;
  height: number;
  renderScale: number;
  screenX: number;
  screenY: number;
  preserveModelScreenAnchor: boolean;
}

export type ViewportFrameSource = 'initial' | 'resize-observer' | 'window-resize' | 'bounds';

function sameSize(left: ViewportFrame | null, right: ViewportFrame): boolean {
  return Boolean(left && left.width === right.width && left.height === right.height && left.renderScale === right.renderScale);
}

function sameFrame(left: ViewportFrame | null, right: ViewportFrame): boolean {
  return Boolean(left
    && left.width === right.width
    && left.height === right.height
    && left.renderScale === right.renderScale
    && left.screenX === right.screenX
    && left.screenY === right.screenY
    && left.preserveModelScreenAnchor === right.preserveModelScreenAnchor);
}

function sizeKey(frame: ViewportFrame): string {
  return `${frame.width}:${frame.height}:${frame.renderScale}`;
}

/**
 * Coalesces all renderer viewport notifications before the runtime applies a
 * frame. Bounds is the authoritative origin source; observer notifications
 * may update size, but never get to replace that origin with a stale sample.
 */
export function createViewportSyncCoordinator(apply: (frame: ViewportFrame) => void): {
  submit(source: ViewportFrameSource, frame: ViewportFrame): void;
  flush(): void;
  cancel(): void;
} {
  let latestOrigin = { x: 0, y: 0 };
  let preserveModelScreenAnchor = true;
  let originAuthority: 'initial' | 'window-resize' | 'bounds' = 'initial';
  let exactBoundsSizeKey: string | null = null;
  let pending: ViewportFrame | null = null;
  let applied: ViewportFrame | null = null;

  const queue = (frame: ViewportFrame): void => {
    pending = {
      ...frame,
      screenX: latestOrigin.x,
      screenY: latestOrigin.y,
      preserveModelScreenAnchor
    };
  };

  return {
    submit(source, frame) {
      if (source === 'initial') {
        latestOrigin = { x: frame.screenX, y: frame.screenY };
        preserveModelScreenAnchor = frame.preserveModelScreenAnchor;
        originAuthority = 'initial';
        queue(frame);
        return;
      }

      if (source === 'bounds') {
        const liveFrame = pending ?? applied;
        if (originAuthority === 'window-resize' && liveFrame && !sameSize(liveFrame, frame)) {
          // A bounds notification for the previous size can arrive after a
          // newer resize event. It must not roll the pending/current frame
          // back to the old origin.
          return;
        }
        latestOrigin = { x: frame.screenX, y: frame.screenY };
        preserveModelScreenAnchor = frame.preserveModelScreenAnchor;
        originAuthority = 'bounds';
        exactBoundsSizeKey = sizeKey(frame);
        queue(frame);
        return;
      }

      if (source === 'window-resize') {
        // Once an exact bounds event has arrived, a same-sized window event
        // is allowed to carry CSS/DPR only. Its screenX/Y can be an older
        // Chromium sample delivered after the bounds IPC message.
        // A native resize event can arrive after the exact rectangle IPC for
        // the same BrowserWindow.setBounds call. Its window.screenX/Y sample
        // may still be from the previous frame, so it must not overwrite the
        // exact origin. A different size still starts a new live frame and is
        // allowed to carry the next origin until the exact bounds IPC arrives.
        const exactBoundsForSize = originAuthority === 'bounds' && exactBoundsSizeKey === sizeKey(frame);
        const sizeChanged = !sameSize(applied, frame);
        if (!exactBoundsForSize && (originAuthority !== 'bounds' || sizeChanged)) {
          latestOrigin = { x: frame.screenX, y: frame.screenY };
          preserveModelScreenAnchor = frame.preserveModelScreenAnchor;
          originAuthority = 'window-resize';
        }
        queue(frame);
        return;
      }

      // ResizeObserver is intentionally origin-blind. It shares the latest
      // origin selected by the single coordinator owner above.
      queue(frame);
    },
    flush() {
      if (!pending || sameFrame(applied, pending)) {
        pending = null;
        return;
      }
      const next = pending;
      pending = null;
      applied = next;
      apply(next);
    },
    cancel() {
      pending = null;
    }
  };
}
