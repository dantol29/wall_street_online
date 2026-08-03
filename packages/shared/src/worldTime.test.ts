import { describe, expect, it } from "vitest";
import { normalizeWorldPhase, worldPhaseAtTime } from "./worldTime";

describe("world time", () => {
  it("wraps phases in both directions", () => {
    expect(normalizeWorldPhase(1.25)).toBeCloseTo(0.25);
    expect(normalizeWorldPhase(-0.25)).toBeCloseTo(0.75);
  });

  it("derives a repeating phase from a server epoch", () => {
    expect(worldPhaseAtTime(1_000, 1_250, 1_000)).toBeCloseTo(0.25);
    expect(worldPhaseAtTime(1_000, 2_250, 1_000)).toBeCloseTo(0.25);
  });
});
