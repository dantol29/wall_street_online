export const ROOM_NAME = "social_room";
export const MAX_PLAYERS = 20;
export const MOVEMENT_SEND_RATE_HZ = 12;
export const MAX_CHAT_LENGTH = 200;

export const WORLD_BOUNDS = {
  minX: -10,
  maxX: 10,
  minY: 0,
  maxY: 8,
  minZ: -12.5,
  maxZ: 12.5,
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

export const NAME_LABEL_MAX_DISTANCE_METERS = 20;

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
  { x: -6, y: 1, z: -8 },
  { x: -3, y: 1, z: -8 },
  { x: 0, y: 1, z: -8 },
  { x: 3, y: 1, z: -8 },
  { x: 6, y: 1, z: -8 },
  { x: -6, y: 1, z: 8 },
  { x: -3, y: 1, z: 8 },
  { x: 0, y: 1, z: 8 },
  { x: 3, y: 1, z: 8 },
  { x: 6, y: 1, z: 8 },
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
      seatY: 1,
      seatZ: deskZ,
      rotationY: bank.facesPositiveX ? -Math.PI / 2 : Math.PI / 2,
    };
  });
});
