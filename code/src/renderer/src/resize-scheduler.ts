import type { PetDragPoint } from '../../shared/ipc';

export interface PetResizeScheduler {
  queue(point: PetDragPoint): void;
  flush(): void;
  cancel(): void;
}

/** Keep the resize IPC path to one latest point per renderer frame. */
export function createPetResizeScheduler(
  send: (point: PetDragPoint) => void,
  requestFrame: (callback: () => void) => number,
  cancelFrame: (handle: number) => void
): PetResizeScheduler {
  let pending: PetDragPoint | null = null;
  let frameHandle: number | null = null;

  const flush = (): void => {
    if (frameHandle !== null) {
      cancelFrame(frameHandle);
      frameHandle = null;
    }
    const point = pending;
    pending = null;
    if (point) {
      send(point);
    }
  };

  return {
    queue(point) {
      pending = point;
      if (frameHandle !== null) {
        return;
      }
      frameHandle = requestFrame(() => {
        frameHandle = null;
        const next = pending;
        pending = null;
        if (next) {
          send(next);
        }
      });
    },
    flush,
    cancel() {
      if (frameHandle !== null) {
        cancelFrame(frameHandle);
        frameHandle = null;
      }
      pending = null;
    }
  };
}
