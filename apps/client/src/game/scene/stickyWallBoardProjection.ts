import { STICKY_WALL_WORLD_HEIGHT, STICKY_WALL_WORLD_WIDTH } from "@multiplayer/shared";

/**
 * The camera overview shot (see frameStickyWallOverview in App.tsx) looks
 * straight on at the board — its east-wall view maps camera-right along the
 * board's world-Z width and
 * camera-up == world +Y. That means a click's screen position maps to a
 * board fraction by plain NDC scaling, with no raycast against the mesh
 * needed. `OVERVIEW_PADDING` must match the padding used there, or a click
 * would land somewhere other than where it visually appears.
 */
const OVERVIEW_PADDING = 1.25;

export interface StickyWallCameraFrame {
  distance: number;
  halfWidthAtDistance: number;
  halfHeightAtDistance: number;
}

export function computeStickyWallCameraFrame(verticalFovDeg: number, aspect: number): StickyWallCameraFrame {
  const halfVerticalFov = (verticalFovDeg * Math.PI) / 360;
  const verticalScale = Math.tan(halfVerticalFov);
  const distanceForHeight = STICKY_WALL_WORLD_HEIGHT / 2 / verticalScale;
  const distanceForWidth = STICKY_WALL_WORLD_WIDTH / 2 / (verticalScale * aspect);
  const distance = Math.max(distanceForHeight, distanceForWidth) * OVERVIEW_PADDING;
  const halfHeightAtDistance = distance * verticalScale;
  const halfWidthAtDistance = halfHeightAtDistance * aspect;
  return { distance, halfWidthAtDistance, halfHeightAtDistance };
}

/** clickXRatio/clickYRatio are canvas-relative, [0,1], top-left origin — same convention as a mouse event over getBoundingClientRect(). */
export function screenRatioToBoardFraction(
  clickXRatio: number,
  clickYRatio: number,
  frame: StickyWallCameraFrame,
): { xFraction: number; yFraction: number } | null {
  const ndcX = (clickXRatio - 0.5) * 2;
  const ndcY = (0.5 - clickYRatio) * 2;
  const xFraction = 0.5 + (ndcX * frame.halfWidthAtDistance) / STICKY_WALL_WORLD_WIDTH;
  const yFraction = 0.5 - (ndcY * frame.halfHeightAtDistance) / STICKY_WALL_WORLD_HEIGHT;
  if (xFraction < 0 || xFraction > 1 || yFraction < 0 || yFraction > 1) return null;
  return { xFraction, yFraction };
}

/** Inverse of screenRatioToBoardFraction — used to anchor the writer UI at the screen position of a chosen board spot. */
export function boardFractionToScreenRatio(
  xFraction: number,
  yFraction: number,
  frame: StickyWallCameraFrame,
): { xRatio: number; yRatio: number } {
  const worldZOffset = (xFraction - 0.5) * STICKY_WALL_WORLD_WIDTH;
  const worldYOffset = (0.5 - yFraction) * STICKY_WALL_WORLD_HEIGHT;
  const ndcX = worldZOffset / frame.halfWidthAtDistance;
  const ndcY = worldYOffset / frame.halfHeightAtDistance;
  return { xRatio: ndcX / 2 + 0.5, yRatio: 0.5 - ndcY / 2 };
}
