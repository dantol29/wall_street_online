import { describe, expect, it } from "vitest";
import { getDayNightProfile, worldPhaseFromAnchor, type WorldTimeAnchor } from "./dayNight";

describe("day/night cycle", () => {
  it("advances from the locally received server anchor without wall-clock skew", () => {
    const anchor: WorldTimeAnchor = {
      phase: 0.25,
      dayDurationMs: 1_000,
      serverTimeMs: 500_000,
      receivedAtClientTimeMs: 10_000,
    };
    expect(worldPhaseFromAnchor(anchor, 10_250)).toBeCloseTo(0.5);
  });

  it("makes noon brighter than midnight and night fixtures stronger", () => {
    const noon = getDayNightProfile(0.5);
    const midnight = getDayNightProfile(0);
    expect(noon.daylight).toBeGreaterThan(0.95);
    expect(midnight.night).toBeGreaterThan(0.95);
    expect(noon.sunIntensity).toBeGreaterThan(midnight.sunIntensity);
    expect(midnight.fixtureIntensity).toBeGreaterThan(noon.fixtureIntensity);
  });
});
