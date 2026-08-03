import { DESK_STATIONS } from "@multiplayer/shared";
import { Vec3 } from "playcanvas";

const DESK_MODEL_HEIGHT = 0.92 * 0.95;
const MONITOR_MODEL_SCALE = 0.011;

/**
 * Screen corners after the source model's -90° normalization rotation.
 * Order is top-left, top-right, bottom-right, bottom-left as viewed by the
 * seated trader.
 */
const SCREEN_CORNERS_LOCAL = [
  [40.102, 65.258, -8.293],
  [-40.102, 65.258, -8.293],
  [-40.102, 17.417, -16.166],
  [40.102, 17.417, -16.166],
] as const;

function pseudoRandom(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

export function deskMonitorRotationJitterDegrees(deskIndex: number): number {
  return (pseudoRandom(deskIndex * 7 + 1) * 2 - 1) * 10;
}

export function getDeskMonitorScreenWorldCorners(deskId: string): Vec3[] | null {
  const deskIndex = DESK_STATIONS.findIndex((desk) => desk.id === deskId);
  const desk = deskIndex >= 0 ? DESK_STATIONS[deskIndex] : null;
  if (!desk) return null;

  const facesPositiveX = desk.rotationY < 0;
  const monitorX = desk.deskX + (facesPositiveX ? 1 : -1) * 0.18;
  const rotationY =
    (facesPositiveX ? 90 : -90) + deskMonitorRotationJitterDegrees(deskIndex);
  const radians = (rotationY * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);

  return SCREEN_CORNERS_LOCAL.map(([rawX, rawY, rawZ]) => {
    const x = rawX * MONITOR_MODEL_SCALE;
    const y = rawY * MONITOR_MODEL_SCALE;
    const z = rawZ * MONITOR_MODEL_SCALE;
    return new Vec3(
      monitorX + cosine * x + sine * z,
      DESK_MODEL_HEIGHT + y,
      desk.deskZ - sine * x + cosine * z,
    );
  });
}
