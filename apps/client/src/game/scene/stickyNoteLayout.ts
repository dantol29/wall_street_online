/**
 * Deterministic per-session placement on the sticky wall — the same
 * (session id) always lands at the same spot/tilt, computed independently
 * by both the board renderer (StickyWallDisplay) and the camera zoom target
 * (App.tsx) without any coordination between them. Mirrors the seeded-jitter
 * trick already used for desk/office prop placement in Environment.tsx.
 */

function hashSessionId(sessionId: string): number {
  let hash = 0;
  for (let index = 0; index < sessionId.length; index++) {
    hash = (hash * 31 + sessionId.charCodeAt(index)) % 1_000_000_007;
  }
  return hash;
}

function pseudoRandom(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

export interface StickyNoteLayout {
  /** [0,1] fraction across the board's width. */
  xFraction: number;
  /** [0,1] fraction across the board's height. */
  yFraction: number;
  rotationDeg: number;
}

const MARGIN_FRACTION = 0.1;

export function getStickyNoteLayout(sessionId: string): StickyNoteLayout {
  const seed = hashSessionId(sessionId);
  const span = 1 - MARGIN_FRACTION * 2;
  return {
    xFraction: MARGIN_FRACTION + pseudoRandom(seed * 1.7 + 1) * span,
    yFraction: MARGIN_FRACTION + pseudoRandom(seed * 1.7 + 7.3) * span,
    rotationDeg: (pseudoRandom(seed * 1.7 + 13.1) * 2 - 1) * 8,
  };
}
