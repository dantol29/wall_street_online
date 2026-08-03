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

export const STICKY_WALL_POSITION = { x: 9.68, y: 2.2, z: 0 } as const;
export const STICKY_WALL_INTERACTION_POSITION = { x: 8.35, z: 0 } as const;
export const STICKY_WALL_INTERACTION_DISTANCE_METERS = 2.2;
export const STICKY_WALL_WORLD_WIDTH = 3.2;
export const STICKY_WALL_WORLD_HEIGHT = 2.4;

export interface StickyNote {
  authorSessionId: string;
  authorDisplayName: string;
  text: string;
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
}

export interface StickyNoteUpsertResultMessage {
  requestId: number;
  success: boolean;
  note?: StickyNote;
  message?: string;
}
