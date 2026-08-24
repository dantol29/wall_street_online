/**
 * The sticky-note wall — a lightweight, ephemeral, real-time-synced board
 * (same architecture as whiteboard.ts: plain server-side state, broadcast on
 * change, reset when a room shard empties/restarts — not persisted like the
 * office thesis wall). One note per session, enforced structurally by
 * keying notes on `authorSessionId`: an upsert always targets the caller's
 * own entry, so there's no message shape that could even express "add a
 * second note" or "edit someone else's." Plain text only — no sentiment/
 * category, just a note.
 */
export const STICKY_NOTE_MAX_TEXT_LENGTH = 80;
export const STICKY_NOTE_UPDATE_COOLDOWN_MS = 5000;

export const STICKY_WALL_POSITION = { x: -23.68, y: 2.2, z: 2.2 } as const;
export const STICKY_WALL_INTERACTION_POSITION = { x: -22.1, z: 2.2 } as const;
export const STICKY_WALL_INTERACTION_DISTANCE_METERS = 2.2;
export const STICKY_WALL_WORLD_WIDTH = 3.2;
export const STICKY_WALL_WORLD_HEIGHT = 2.4;

// The board's canvas-texture resolution and each note's fixed pixel footprint
// on it — shared so the client's click-to-place picker and the server's
// authoritative "is this spot free" check agree on the exact same geometry.
// Doubled from an original 768x576/130x110 baseline (same note-to-canvas
// ratio, so overlap/margin math is unaffected) — the lower resolution left
// note text an unreadable blur once a player could walk up and read a note
// up close, not just view the board from the fixed overview camera shot.
export const STICKY_NOTE_CANVAS_WIDTH = 1536;
export const STICKY_NOTE_CANVAS_HEIGHT = 1152;
export const STICKY_NOTE_WIDTH_PX = 260;
export const STICKY_NOTE_HEIGHT_PX = 220;

/** Keeps a note's whole footprint on the board, mirroring the old fixed-layout margin. */
export const STICKY_NOTE_PLACEMENT_MARGIN_FRACTION = 0.1;

export interface StickyNote {
  authorSessionId: string;
  authorDisplayName: string;
  text: string;
  /** [0,1] fraction across the board's width/height — chosen by the author via click-to-place. */
  xFraction: number;
  yFraction: number;
  updatedAt: number;
}

export interface StickyNoteSnapshot {
  notes: StickyNote[];
}

export interface StickyNoteDeleteMessage {
  authorSessionId: string;
}

export interface StickyNoteUpsertRequestMessage {
  requestId: number;
  text: string;
  xFraction: number;
  yFraction: number;
}

export interface StickyNoteUpsertResultMessage {
  requestId: number;
  success: boolean;
  note?: StickyNote;
  message?: string;
}

export interface StickyNoteDeleteRequestMessage {
  requestId: number;
}

export interface StickyNoteDeleteResultMessage {
  requestId: number;
  success: boolean;
  message?: string;
}

export function isStickyWallPositionValid(xFraction: number, yFraction: number): boolean {
  const margin = STICKY_NOTE_PLACEMENT_MARGIN_FRACTION;
  return (
    Number.isFinite(xFraction) &&
    Number.isFinite(yFraction) &&
    xFraction >= margin &&
    xFraction <= 1 - margin &&
    yFraction >= margin &&
    yFraction <= 1 - margin
  );
}

function stickyNotesOverlap(
  a: { xFraction: number; yFraction: number },
  b: { xFraction: number; yFraction: number },
): boolean {
  const dx = Math.abs(a.xFraction - b.xFraction) * STICKY_NOTE_CANVAS_WIDTH;
  const dy = Math.abs(a.yFraction - b.yFraction) * STICKY_NOTE_CANVAS_HEIGHT;
  return dx < STICKY_NOTE_WIDTH_PX && dy < STICKY_NOTE_HEIGHT_PX;
}

type StickyNoteLocation = Pick<StickyNote, "authorSessionId" | "xFraction" | "yFraction">;

/** Whichever note (if any) covers a given board spot — used client-side to tell "clicked my note" from "clicked empty space." */
export function findOverlappingStickyNote<T extends StickyNoteLocation>(
  existingNotes: readonly T[],
  xFraction: number,
  yFraction: number,
): T | undefined {
  return existingNotes.find((note) => stickyNotesOverlap(note, { xFraction, yFraction }));
}

/**
 * "Free space" for click-to-place: on the board, within margin, and not
 * overlapping anyone else's note. A player's own existing note (if any) is
 * excluded so re-opening the writer at your own spot never reads as taken.
 */
export function isStickyWallSpotFree(
  existingNotes: readonly StickyNoteLocation[],
  xFraction: number,
  yFraction: number,
  excludeAuthorSessionId: string | null,
): boolean {
  if (!isStickyWallPositionValid(xFraction, yFraction)) return false;
  return !existingNotes.some(
    (note) =>
      note.authorSessionId !== excludeAuthorSessionId && stickyNotesOverlap(note, { xFraction, yFraction }),
  );
}
