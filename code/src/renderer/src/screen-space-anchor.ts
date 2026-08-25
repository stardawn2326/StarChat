export interface Point {
  x: number;
  y: number;
}

export function screenPointForLocalPoint(local: Point, windowOrigin: Point): Point {
  return { x: windowOrigin.x + local.x, y: windowOrigin.y + local.y };
}

export function localPointForScreenAnchor(anchor: Point, windowOrigin: Point): Point {
  return { x: anchor.x - windowOrigin.x, y: anchor.y - windowOrigin.y };
}
