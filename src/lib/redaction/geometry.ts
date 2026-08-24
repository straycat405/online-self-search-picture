export type NormalizedRegion = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type Point = { x: number; y: number };

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function createNormalizedRegion(
  id: string,
  start: Point,
  end: Point,
): NormalizedRegion {
  const startX = clamp(start.x);
  const startY = clamp(start.y);
  const endX = clamp(end.x);
  const endY = clamp(end.y);

  return {
    id,
    x: Math.min(startX, endX),
    y: Math.min(startY, endY),
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY),
  };
}

export function isUsableRegion(region: NormalizedRegion) {
  return region.width >= 0.015 && region.height >= 0.015;
}
