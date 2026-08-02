import { describe, expect, it } from "vitest";
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
    expect(isWithinWorldBounds(-10, 0, -12.5)).toBe(true);
    expect(isWithinWorldBounds(10, 8, 12.5)).toBe(true);
  });

  it("rejects coordinates just past the boundary", () => {
    expect(isWithinWorldBounds(-10.01, 0, 0)).toBe(false);
    expect(isWithinWorldBounds(0, 8.01, 0)).toBe(false);
  });
});

describe("isValidAnimation", () => {
  it("accepts idle, walk, and run", () => {
    expect(isValidAnimation("idle")).toBe(true);
    expect(isValidAnimation("walk")).toBe(true);
    expect(isValidAnimation("run")).toBe(true);
  });

  it("rejects an unknown animation name", () => {
    expect(isValidAnimation("dance")).toBe(false);
  });
});
