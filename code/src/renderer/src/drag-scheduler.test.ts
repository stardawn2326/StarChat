import { describe, expect, it } from 'vitest';
import { createPetDragScheduler, latestPointerScreenPoint } from './drag-scheduler';

describe('PetWindow drag scheduler', () => {
  it('coalesces a burst of pointer moves to the latest screen point', () => {
    const callbacks = new Map<number, () => void>();
    const sent: Array<{ screenX: number; screenY: number }> = [];
    const scheduler = createPetDragScheduler(
      (point) => sent.push(point),
      (callback) => {
        callbacks.set(1, callback);
        return 1;
      },
      (handle) => callbacks.delete(handle)
    );

    scheduler.queue({ screenX: 100, screenY: 200 });
    scheduler.queue({ screenX: 120, screenY: 230 });
    scheduler.queue({ screenX: 160, screenY: 280 });
    callbacks.get(1)?.();

    expect(sent).toEqual([{ screenX: 160, screenY: 280 }]);
  });

  it('flushes the pending point before drag end and drops cancelled points', () => {
    const callbacks = new Map<number, () => void>();
    const sent: Array<{ screenX: number; screenY: number }> = [];
    const scheduler = createPetDragScheduler(
      (point) => sent.push(point),
      (callback) => {
        const handle = callbacks.size + 1;
        callbacks.set(handle, callback);
        return handle;
      },
      (handle) => callbacks.delete(handle)
    );

    scheduler.queue({ screenX: 100, screenY: 200 });
    scheduler.flush();
    scheduler.queue({ screenX: 300, screenY: 400 });
    scheduler.cancel();

    expect(sent).toEqual([{ screenX: 100, screenY: 200 }]);
    expect(callbacks).toHaveLength(0);
  });

  it('uses the last coalesced pointer event when Chromium provides one', () => {
    expect(latestPointerScreenPoint({
      screenX: 100,
      screenY: 200,
      getCoalescedEvents: () => [
        { screenX: 110, screenY: 220 },
        { screenX: 140, screenY: 260 }
      ]
    })).toEqual({ screenX: 140, screenY: 260 });
  });
});
