import { TELEPORT_DISTANCE_THRESHOLD_METERS } from "@multiplayer/shared";

interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface RemoteTransform {
  previousPosition: Vec3Like;
  targetPosition: Vec3Like;
  previousRotationY: number;
  targetRotationY: number;
  lastUpdateAt: number;
}

export interface RemoteTransformSample {
  x: number;
  y: number;
  z: number;
  rotationY: number;
}

function distance(a: Vec3Like, b: Vec3Like): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Shortest-path angle interpolation so a player turning through +/-180 degrees doesn't spin the long way around. */
function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

export function createRemoteTransform(initial: RemoteTransformSample, nowMs: number): RemoteTransform {
  const position = { x: initial.x, y: initial.y, z: initial.z };
  return {
    previousPosition: { ...position },
    targetPosition: { ...position },
    previousRotationY: initial.rotationY,
    targetRotationY: initial.rotationY,
    lastUpdateAt: nowMs,
  };
}

/**
 * Records a fresh network sample as the new interpolation target. If the jump is
 * larger than the teleport threshold (e.g. after a reconnect or respawn), snaps
 * immediately instead of visibly sliding across the room.
 */
export function updateRemoteTransformTarget(
  transform: RemoteTransform,
  sample: RemoteTransformSample,
  nowMs: number
): void {
  const nextPosition = { x: sample.x, y: sample.y, z: sample.z };
  const shouldTeleport = distance(transform.targetPosition, nextPosition) > TELEPORT_DISTANCE_THRESHOLD_METERS;

  transform.previousPosition = shouldTeleport ? { ...nextPosition } : { ...transform.targetPosition };
  transform.targetPosition = nextPosition;
  transform.previousRotationY = shouldTeleport ? sample.rotationY : transform.targetRotationY;
  transform.targetRotationY = sample.rotationY;
  transform.lastUpdateAt = nowMs;
}

/** Interpolates between the last two network samples based on elapsed time vs. the expected update interval. */
export function getVisualTransform(
  transform: RemoteTransform,
  nowMs: number,
  updateIntervalMs: number
): RemoteTransformSample {
  const elapsed = nowMs - transform.lastUpdateAt;
  const t = Math.min(Math.max(updateIntervalMs > 0 ? elapsed / updateIntervalMs : 1, 0), 1);

  return {
    x: lerp(transform.previousPosition.x, transform.targetPosition.x, t),
    y: lerp(transform.previousPosition.y, transform.targetPosition.y, t),
    z: lerp(transform.previousPosition.z, transform.targetPosition.z, t),
    rotationY: lerpAngle(transform.previousRotationY, transform.targetRotationY, t),
  };
}
