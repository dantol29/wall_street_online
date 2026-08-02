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
