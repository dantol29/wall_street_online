/**
 * Deterministic per-session tilt for a note on the sticky wall — the same
 * session id always lands at the same slight rotation, computed
 * independently by the board renderer (StickyWallDisplay) without any
 * coordination. Mirrors the seeded-jitter trick already used for desk/office
 * prop placement in Environment.tsx. Position itself is no longer derived
 * here — it's chosen by the author via click-to-place (see
 * stickyWallBoardProjection.ts) and stored on the note.
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

const MAX_ROTATION_DEG = 8;

export function getStickyNoteRotation(sessionId: string): number {
  const seed = hashSessionId(sessionId);
  return (pseudoRandom(seed * 1.7 + 13.1) * 2 - 1) * MAX_ROTATION_DEG;
}
