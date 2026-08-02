import { describe, expect, it } from "vitest";
import { SPAWN_POINTS } from "@multiplayer/shared";
import { assignSpawnPoint } from "./spawnAssignment";

describe("assignSpawnPoint", () => {
  it("picks the spawn point at the given random index when none are occupied", () => {
    const result = assignSpawnPoint(new Set(), () => 0);
    expect(result).toEqual({ index: 0, point: SPAWN_POINTS[0] });
  });

  it("skips occupied indices", () => {
    const occupied = new Set([0, 1]);
    // randomFn(() => 0) picks the first free index in the filtered candidate list.
    const result = assignSpawnPoint(occupied, () => 0);
    expect(result.index).toBe(2);
    expect(occupied.has(result.index)).toBe(false);
  });

  it("falls back to reusing an index once every spawn point is occupied", () => {
    const occupied = new Set(SPAWN_POINTS.map((_, index) => index));
    const result = assignSpawnPoint(occupied, () => 0);
    expect(result.index).toBe(0);
    expect(result.point).toEqual(SPAWN_POINTS[0]);
  });

  it("uses randomFn to select among free candidates", () => {
    const result = assignSpawnPoint(new Set(), () => 0.99999);
    expect(result.index).toBe(SPAWN_POINTS.length - 1);
  });
});
