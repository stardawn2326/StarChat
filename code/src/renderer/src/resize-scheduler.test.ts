import { describe, expect, it } from 'vitest';
import { createPetResizeScheduler } from './resize-scheduler';

describe('PetWindow resize scheduler', () => {
  it('coalesces high-frequency pointer moves to one IPC point per frame', () => {
    const callbacks = new Map<number, () => void>();
    const sent: Array<{ screenX: number; screenY: number }> = [];
    const scheduler = createPetResizeScheduler(
      (point) => sent.push(point),
      (callback) => {
        callbacks.set(1, callback);
        return 1;
      },
      (handle) => callbacks.delete(handle)
    );

    scheduler.queue({ screenX: 100, screenY: 200 });
    scheduler.queue({ screenX: 130, screenY: 240 });
    scheduler.queue({ screenX: 180, screenY: 290 });
    expect(sent).toEqual([]);
    callbacks.get(1)?.();

    expect(sent).toEqual([{ screenX: 180, screenY: 290 }]);
  });

  it('flushes once at gesture end and cancels a pending frame without sending it', () => {
    const callbacks = new Map<number, () => void>();
    const sent: Array<{ screenX: number; screenY: number }> = [];
    const scheduler = createPetResizeScheduler(
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
});
