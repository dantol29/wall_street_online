/**
 * Main room shell dimensions — split out from Environment.tsx so other scene
 * modules (e.g. OfficeWing.tsx) can reuse them without a circular import
 * (Environment.tsx renders OfficeWing, so OfficeWing can't import back from
 * Environment.tsx). See Environment.tsx's own doc comment for the full
 * room-layout rationale.
 */
export const ROOM_WIDTH = 72;
// The larger footprint gives the radial market and navigation lights room to
// disappear into darkness before the player reaches the physical perimeter.
export const ROOM_LENGTH = 72;
export const ROOM_HEIGHT = 11.5;
export const WALL_THICKNESS = 0.5;
