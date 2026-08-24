/**
 * Main room shell dimensions — split out from Environment.tsx so other scene
 * modules (e.g. OfficeWing.tsx) can reuse them without a circular import
 * (Environment.tsx renders OfficeWing, so OfficeWing can't import back from
 * Environment.tsx). See Environment.tsx's own doc comment for the full
 * room-layout rationale.
 */
export const ROOM_WIDTH = 48;
// Starting value: adds 4m beyond each end of the original room. Pass when the
// launch podium has a clear circulation loop without breaking wall-mounted UI.
export const ROOM_LENGTH = 48;
export const ROOM_HEIGHT = 11.5;
export const WALL_THICKNESS = 0.5;
