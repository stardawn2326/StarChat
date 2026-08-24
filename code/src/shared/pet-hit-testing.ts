import { petResizeEdge, PET_RESIZE_EDGE_PX, type PetResizeEdge } from './window-contract';

export type PetHitRegion = 'model' | 'frame' | 'transparent';

export interface PetHitClassification {
  region: PetHitRegion;
  resizeEdge: PetResizeEdge | null;
}

export function classifyPetHit(
  localX: number,
  localY: number,
  width: number,
  height: number,
  modelHit: boolean,
  edge = PET_RESIZE_EDGE_PX
): PetHitClassification {
  if (![localX, localY, width, height, edge].every(Number.isFinite) || width <= 0 || height <= 0) {
    return { region: 'transparent', resizeEdge: null };
  }
  if (localX < 0 || localY < 0 || localX > width || localY > height) {
    return { region: 'transparent', resizeEdge: null };
  }
  const resizeEdge = petResizeEdge(localX, localY, width, height, edge);
  if (resizeEdge) {
    return { region: 'frame', resizeEdge };
  }
  return { region: modelHit ? 'model' : 'transparent', resizeEdge: null };
}
