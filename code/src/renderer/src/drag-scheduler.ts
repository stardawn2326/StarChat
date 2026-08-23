import type { PetDragPoint } from '../../shared/ipc';

export interface PointerScreenPoint {
  screenX: number;
  screenY: number;
}

export interface PetDragScheduler {
  queue(point: PetDragPoint): void;
  flush(): void;
  cancel(): void;
}

export function latestPointerScreenPoint(
  event: PointerScreenPoint & { getCoalescedEvents?: () => PointerScreenPoint[] }
): PetDragPoint {
  const coalesced = event.getCoalescedEvents?.() ?? [];
  const latest = coalesced.at(-1) ?? event;
  return { screenX: latest.screenX, screenY: latest.screenY };
}

export function createPetDragScheduler(
  send: (point: PetDragPoint) => void,
  requestFrame: (callback: () => void) => number,
  cancelFrame: (handle: number) => void
): PetDragScheduler {
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
