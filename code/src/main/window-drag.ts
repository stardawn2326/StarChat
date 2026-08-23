import type { PetDragPoint } from '../shared/ipc';
import type { WindowBounds } from '../shared/window-contract';

const finite = (value: number, fallback: number): number => Number.isFinite(value) ? value : fallback;

/**
 * A desktop drag is position-only. The captured width/height are deliberately
 * carried through so a native resize hit cannot leak into the custom drag IPC.
 */
export function nextPetDragBounds(startBounds: WindowBounds, startPoint: PetDragPoint, currentPoint: PetDragPoint): WindowBounds {
  const deltaX = finite(currentPoint.screenX, startPoint.screenX) - finite(startPoint.screenX, 0);
  const deltaY = finite(currentPoint.screenY, startPoint.screenY) - finite(startPoint.screenY, 0);
  return {
    x: Math.round(finite(startBounds.x, 0) + deltaX),
    y: Math.round(finite(startBounds.y, 0) + deltaY),
    width: Math.round(finite(startBounds.width, 1)),
    height: Math.round(finite(startBounds.height, 1))
  };
}
