export interface ScreenPoint {
  x: number;
  y: number;
}

/**
 * Maps a source rectangle to a destination quadrilateral using a CSS 3D
 * projective transform. Destination order: TL, TR, BR, BL.
 */
export function rectangleToQuadMatrix3d(
  sourceWidth: number,
  sourceHeight: number,
  [topLeft, topRight, bottomRight, bottomLeft]: readonly [
    ScreenPoint,
    ScreenPoint,
    ScreenPoint,
    ScreenPoint,
  ],
): string | null {
  const dx1 = topRight.x - bottomRight.x;
  const dx2 = bottomLeft.x - bottomRight.x;
  const dx3 = topLeft.x - topRight.x + bottomRight.x - bottomLeft.x;
  const dy1 = topRight.y - bottomRight.y;
  const dy2 = bottomLeft.y - bottomRight.y;
  const dy3 = topLeft.y - topRight.y + bottomRight.y - bottomLeft.y;
  const determinant = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(determinant) < 0.000001) return null;

  const g = (dx3 * dy2 - dx2 * dy3) / determinant;
  const h = (dx1 * dy3 - dx3 * dy1) / determinant;
  const a = topRight.x * (g + 1) - topLeft.x;
  const b = topRight.y * (g + 1) - topLeft.y;
  const c = bottomLeft.x * (h + 1) - topLeft.x;
  const d = bottomLeft.y * (h + 1) - topLeft.y;

  return `matrix3d(${[
    a / sourceWidth,
    b / sourceWidth,
    0,
    g / sourceWidth,
    c / sourceHeight,
    d / sourceHeight,
    0,
    h / sourceHeight,
    0,
    0,
    1,
    0,
    topLeft.x,
    topLeft.y,
    0,
    1,
  ].join(",")})`;
}
