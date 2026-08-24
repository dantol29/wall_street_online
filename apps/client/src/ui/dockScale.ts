/**
 * Piecewise-linear falloff from `magnification` at zero distance down to
 * `size` at `falloffDistance`, mirroring the classic Mac dock's magnify
 * curve — just driven by an arbitrary distance value (index-based here)
 * instead of raw mouse-cursor pixels.
 */
export function getDockIconSize(
  distance: number,
  size: number,
  magnification: number,
  falloffDistance: number,
): number {
  if (falloffDistance <= 0) return distance === 0 ? magnification : size;
  const clamped = Math.max(-falloffDistance, Math.min(falloffDistance, distance));
  const proximity = 1 - Math.abs(clamped) / falloffDistance;
  return size + (magnification - size) * proximity;
}
