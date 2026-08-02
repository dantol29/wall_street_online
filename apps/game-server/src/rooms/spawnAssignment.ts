import { SPAWN_POINTS, type SpawnPoint } from "@multiplayer/shared";

export interface SpawnAssignment {
  index: number;
  point: SpawnPoint;
}

/**
 * Picks a spawn point index, preferring one not currently occupied.
 * Falls back to a random index if every spawn point is taken (e.g. >10 players).
 * `randomFn` is injectable so tests can make the choice deterministic.
 */
export function assignSpawnPoint(
  occupiedIndices: ReadonlySet<number>,
  randomFn: () => number = Math.random
): SpawnAssignment {
  const freeIndices = SPAWN_POINTS.map((_, index) => index).filter((index) => !occupiedIndices.has(index));
  const candidates = freeIndices.length > 0 ? freeIndices : SPAWN_POINTS.map((_, index) => index);

  const pickedIndex = candidates[Math.floor(randomFn() * candidates.length)] ?? 0;
  const point = SPAWN_POINTS[pickedIndex] ?? SPAWN_POINTS[0];

  if (!point) {
    throw new Error("SPAWN_POINTS must not be empty");
  }

  return { index: pickedIndex, point };
}
