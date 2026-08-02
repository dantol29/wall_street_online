/**
 * Main room shell dimensions — split out from Environment.tsx so other scene
 * modules (e.g. OfficeWing.tsx) can reuse them without a circular import
 * (Environment.tsx renders OfficeWing, so OfficeWing can't import back from
 * Environment.tsx). See Environment.tsx's own doc comment for the full
 * room-layout rationale.
 */
export const ROOM_WIDTH = 20;
export const ROOM_LENGTH = 25;
export const ROOM_HEIGHT = 7.5;
export const WALL_THICKNESS = 0.5;
