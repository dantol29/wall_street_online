import { describe, expect, it } from "vitest";
import { WORLD_BOUNDS } from "@multiplayer/shared";
import { validateMovementInput, isWithinWorldBounds, isValidAnimation } from "./movementValidation";

const baseCandidate = { x: 0, y: 1, z: 0, rotationY: 0, animation: "idle" as const };

describe("validateMovementInput", () => {
  it("accepts a valid first movement with no previous position", () => {
    const result = validateMovementInput(baseCandidate, null, 1000);
    expect(result.valid).toBe(true);
  });

  it("rejects non-finite coordinates", () => {
    const result = validateMovementInput({ ...baseCandidate, x: Number.NaN }, null, 1000);
    expect(result).toEqual({ valid: false, reason: "non-finite coordinates" });
  });

  it("rejects Infinity coordinates", () => {
    const result = validateMovementInput({ ...baseCandidate, z: Number.POSITIVE_INFINITY }, null, 1000);
    expect(result.valid).toBe(false);
  });

  it("rejects coordinates outside world bounds", () => {
    const result = validateMovementInput({ ...baseCandidate, x: 999 }, null, 1000);
    expect(result).toEqual({ valid: false, reason: "outside world bounds" });
  });

  it("rejects an invalid animation value", () => {
    const result = validateMovementInput({ ...baseCandidate, animation: "fly" }, null, 1000);
    expect(result).toEqual({ valid: false, reason: "invalid animation value" });
  });

  it("rejects updates sent faster than the allowed rate", () => {
    const previous = { x: 0, y: 1, z: 0, updatedAtMs: 1000 };
    const result = validateMovementInput(baseCandidate, previous, 1010);
    expect(result).toEqual({ valid: false, reason: "update rate too high" });
  });

  it("accepts a plausible move within the allowed speed", () => {
    const previous = { x: 0, y: 1, z: 0, updatedAtMs: 1000 };
    const result = validateMovementInput({ ...baseCandidate, x: 0.4 }, previous, 1100);
    expect(result.valid).toBe(true);
  });

  it("rejects an impossible teleport-speed move", () => {
    const previous = { x: -9, y: 1, z: -12, updatedAtMs: 1000 };
    const result = validateMovementInput({ ...baseCandidate, x: 9, y: 1, z: 12 }, previous, 1100);
    expect(result).toEqual({ valid: false, reason: "movement distance too large" });
  });
});

describe("isWithinWorldBounds", () => {
  it("accepts coordinates at the exact boundary", () => {
    // maxZ is extended south to fit the office wing corridor (see OFFICE_SLOTS) — assert against
    // the live WORLD_BOUNDS constant rather than a hardcoded literal so this can't silently drift.
    expect(isWithinWorldBounds(WORLD_BOUNDS.minX, WORLD_BOUNDS.minY, WORLD_BOUNDS.minZ)).toBe(true);
    expect(isWithinWorldBounds(WORLD_BOUNDS.maxX, WORLD_BOUNDS.maxY, WORLD_BOUNDS.maxZ)).toBe(true);
  });

  it("rejects coordinates just past the boundary", () => {
    expect(isWithinWorldBounds(WORLD_BOUNDS.minX - 0.01, 0, 0)).toBe(false);
    expect(isWithinWorldBounds(0, WORLD_BOUNDS.maxY + 0.01, 0)).toBe(false);
    expect(isWithinWorldBounds(0, 0, WORLD_BOUNDS.maxZ + 0.01)).toBe(false);
  });
});

describe("isValidAnimation", () => {
  it("accepts movement and social animations", () => {
    expect(isValidAnimation("idle")).toBe(true);
    expect(isValidAnimation("walk")).toBe(true);
    expect(isValidAnimation("run")).toBe(true);
    expect(isValidAnimation("wave")).toBe(true);
  });

  it("rejects an unknown animation name", () => {
    expect(isValidAnimation("dance")).toBe(false);
  });
});
