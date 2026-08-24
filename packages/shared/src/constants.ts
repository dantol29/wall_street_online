export const ROOM_NAME = "social_room";
export const MAX_PLAYERS = 50;
export const MOVEMENT_SEND_RATE_HZ = 12;
export const MAX_CHAT_LENGTH = 200;

export const WORLD_BOUNDS = {
  minX: -36,
  maxX: 36,
  minY: 0,
  maxY: 12,
  minZ: -36,
  maxZ: 36,
} as const;

export const MOVEMENT_CONFIG = {
  walkSpeed: 4,
  runSpeed: 6,
  mouseSensitivity: 0.15,
  playerHeight: 1.8,
  playerRadius: 0.35,
} as const;

export const CAMERA_PITCH_MIN_DEGREES = -85;
export const CAMERA_PITCH_MAX_DEGREES = 85;

export const TELEPORT_DISTANCE_THRESHOLD_METERS = 5;

export const NAME_LABEL_MAX_DISTANCE_METERS = 12;

export const CHAT_RATE_LIMIT_MAX_MESSAGES = 3;
export const CHAT_RATE_LIMIT_WINDOW_MS = 5000;
export const DESK_INTERACTION_DISTANCE_METERS = 1.8;
export const VOICE_FULL_VOLUME_DISTANCE_METERS = 2;
export const VOICE_MAX_DISTANCE_METERS = 10;
export const VOICE_TOKEN_REQUEST_COOLDOWN_MS = 3000;

/** Colyseus reconnection window; spec calls for 10-20s, we use the midpoint. */
export const RECONNECTION_TIMEOUT_SECONDS = 15;

export interface SpawnPoint {
  x: number;
  y: number;
  z: number;
}

export const SPAWN_POINTS: readonly SpawnPoint[] = [
  { x: 0, y: 1, z: 3.6 },
  { x: 1.4, y: 1, z: 3.6 },
  { x: -1.4, y: 1, z: 3.6 },
  { x: 3.6, y: 1, z: 0 },
  { x: -3.6, y: 1, z: 0 },
  { x: 3.1, y: 1, z: 2.1 },
  { x: -3.1, y: 1, z: 2.1 },
  { x: 3.1, y: 1, z: -2.1 },
  { x: -3.1, y: 1, z: -2.1 },
  { x: 0, y: 1, z: -3.6 },
] as const;

export interface DeskStation {
  id: string;
  deskX: number;
  deskZ: number;
  seatX: number;
  seatY: number;
  seatZ: number;
  rotationY: number;
}

const DESK_BANK_CENTERS = [
  { id: "west-north", x: -8, z: -7, facesPositiveX: true },
  { id: "west-south", x: -8, z: 7, facesPositiveX: true },
  { id: "east-north", x: 8, z: -7, facesPositiveX: false },
  { id: "east-south", x: 8, z: 7, facesPositiveX: false },
] as const;

const DESK_OFFSETS = [
  [-1.1, -1.1],
  [1.1, -1.1],
  [-1.1, 1.1],
  [1.1, 1.1],
] as const;

/** Shared with the server so seat proximity and occupancy are authoritative. */
export const DESK_STATIONS: readonly DeskStation[] = DESK_BANK_CENTERS.flatMap((bank) => {
  const chairSideSign = bank.facesPositiveX ? -1 : 1;
  return DESK_OFFSETS.map(([dx, dz], index) => {
    const deskX = bank.x + dx;
    const deskZ = bank.z + dz;
    return {
      id: `${bank.id}-${index + 1}`,
      deskX,
      deskZ,
      seatX: deskX + chairSideSign * 0.65,
      seatY: 1.26,
      seatZ: deskZ,
      rotationY: bank.facesPositiveX ? -Math.PI / 2 : Math.PI / 2,
    };
  });
});

// --- Personal trader offices ---
//
// Content is persisted (keyed by a player's durable Privy identity, see the
// game-server's officeRepository), but the *physical* slot a player occupies
// each session is transient — a shard has a small, bounded number of office
// alcoves, dynamically assigned to whoever is currently wallet-linked and
// present, mirroring how SPAWN_POINTS/DESK_STATIONS are already assigned.

export const OFFICE_INTERACTION_DISTANCE_METERS = 2.2;
export const THESIS_MAX_LENGTH = 2000;
export const WATCHLIST_MAX_ITEMS = 15;
export const WATCHLIST_SYMBOL_MAX_LENGTH = 20;
export const WATCHLIST_NOTE_MAX_LENGTH = 140;
export const VISITOR_BOOK_MESSAGE_MAX_LENGTH = 200;
export const VISITOR_BOOK_MAX_ENTRIES = 20;

export const THESIS_PUBLISH_COOLDOWN_MS = 30_000;
export const WATCHLIST_UPDATE_COOLDOWN_MS = 5000;
/** Global cap on how often one visitor can sign any visitor book at all. */
export const VISITOR_BOOK_SIGN_RATE_LIMIT_MAX = 3;
export const VISITOR_BOOK_SIGN_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
/** On top of the global cap, one visitor can only sign the *same* office's book this often, so one target can't be flooded. */
export const VISITOR_BOOK_SIGN_PER_OFFICE_COOLDOWN_MS = 60_000;

export interface OfficeSlot {
  id: string;
  /** Alcove center — where furniture/content displays are anchored. */
  deskX: number;
  deskZ: number;
  /** Just inside the glass front, on the corridor side — where a player interacts (own office) or peeks in (visiting). */
  interactionX: number;
  interactionZ: number;
  rotationY: number;
}

const OFFICE_CORRIDOR_HALF_WIDTH = 2;
const OFFICE_ALCOVE_DEPTH = 5;
const OFFICE_ALCOVE_ROW_CENTERS_Z = [14, 17, 20, 23] as const;

const OFFICE_ALCOVE_ROWS = [
  { id: "west", facesPositiveX: true },
  { id: "east", facesPositiveX: false },
] as const;

/** Shared with the server so office proximity and slot assignment are authoritative. */
export const OFFICE_SLOTS: readonly OfficeSlot[] = OFFICE_ALCOVE_ROWS.flatMap((row) => {
  const sign = row.facesPositiveX ? 1 : -1;
  const deskX = sign * (OFFICE_CORRIDOR_HALF_WIDTH + OFFICE_ALCOVE_DEPTH / 2);
  const interactionX = sign * (OFFICE_CORRIDOR_HALF_WIDTH + 0.7);
  return OFFICE_ALCOVE_ROW_CENTERS_Z.map((deskZ, index) => ({
    id: `${row.id}-${index + 1}`,
    deskX,
    deskZ,
    interactionX,
    interactionZ: deskZ,
    rotationY: row.facesPositiveX ? -Math.PI / 2 : Math.PI / 2,
  }));
});
