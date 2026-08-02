import { describe, expect, it } from "vitest";
import { calculateProximityGain } from "./spatialAudio";

describe("calculateProximityGain", () => {
  it.each([
    [0, 1],
    [2, 1],
    [6, 0.5],
    [10, 0],
    [15, 0],
  ])("returns %s metres as %s gain", (distance, gain) => {
    expect(calculateProximityGain(distance)).toBe(gain);
  });
});
