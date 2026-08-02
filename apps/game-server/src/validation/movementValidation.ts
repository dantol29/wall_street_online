import { ANIMATION_STATES, WORLD_BOUNDS, type AnimationState } from "@multiplayer/shared";

/** Generous ceiling above the 6 m/s run speed to absorb network jitter without allowing teleport-speed cheating. */
const MAX_METERS_PER_SECOND = 15;

/** Floor well above the 12Hz (~83ms) client send rate; blocks a client flooding the server with updates. */
const MIN_UPDATE_INTERVAL_MS = 40;

export interface PreviousPlayerPosition {
  x: number;
  y: number;
  z: number;
  updatedAtMs: number;
}

export interface MovementCandidate {
  x: number;
  y: number;
  z: number;
  rotationY: number;
  animation: string;
}

export type MovementValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

export function isFiniteCoordinate(value: number): boolean {
  return Number.isFinite(value);
}

export function areFiniteCoordinates(x: number, y: number, z: number, rotationY: number): boolean {
  return isFiniteCoordinate(x) && isFiniteCoordinate(y) && isFiniteCoordinate(z) && isFiniteCoordinate(rotationY);
}

export function isWithinWorldBounds(x: number, y: number, z: number): boolean {
  return (
    x >= WORLD_BOUNDS.minX &&
    x <= WORLD_BOUNDS.maxX &&
    y >= WORLD_BOUNDS.minY &&
    y <= WORLD_BOUNDS.maxY &&
    z >= WORLD_BOUNDS.minZ &&
    z <= WORLD_BOUNDS.maxZ
  );
}

export function isValidAnimation(value: string): value is AnimationState {
  return (ANIMATION_STATES as readonly string[]).includes(value);
}

export function isPlausibleDistance(
  previous: Pick<PreviousPlayerPosition, "x" | "y" | "z">,
  next: Pick<MovementCandidate, "x" | "y" | "z">,
  elapsedMs: number
): boolean {
  const dx = next.x - previous.x;
  const dy = next.y - previous.y;
  const dz = next.z - previous.z;
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const elapsedSeconds = Math.max(elapsedMs, MIN_UPDATE_INTERVAL_MS) / 1000;
  return distance <= MAX_METERS_PER_SECOND * elapsedSeconds;
}

export function isReasonableUpdateRate(elapsedMs: number): boolean {
  return elapsedMs >= MIN_UPDATE_INTERVAL_MS;
}

/**
 * Validates an incoming movement message against everything the server must enforce
 * per the brief: finite coordinates, world bounds, plausible speed, update rate, and
 * a known animation value. `previous` is null for a player's first movement message.
 */
export function validateMovementInput(
  candidate: MovementCandidate,
  previous: PreviousPlayerPosition | null,
  nowMs: number
): MovementValidationResult {
  if (!areFiniteCoordinates(candidate.x, candidate.y, candidate.z, candidate.rotationY)) {
    return { valid: false, reason: "non-finite coordinates" };
  }

  if (!isWithinWorldBounds(candidate.x, candidate.y, candidate.z)) {
    return { valid: false, reason: "outside world bounds" };
  }

  if (!isValidAnimation(candidate.animation)) {
    return { valid: false, reason: "invalid animation value" };
  }

  if (previous) {
    const elapsedMs = nowMs - previous.updatedAtMs;

    if (!isReasonableUpdateRate(elapsedMs)) {
      return { valid: false, reason: "update rate too high" };
    }

    if (!isPlausibleDistance(previous, candidate, elapsedMs)) {
      return { valid: false, reason: "movement distance too large" };
    }
  }

  return { valid: true };
}
