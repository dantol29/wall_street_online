import { describe, expect, it } from "vitest";
import { BELL_MARKET_BASE_USD, BELL_MARKET_CHECKPOINT_INTERVAL_MS, computeMarketCapUsd } from "./bellCycle";

describe("computeMarketCapUsd", () => {
  it("starts at the base market cap at elapsedMs=0", () => {
    expect(computeMarketCapUsd(1, 0)).toBeCloseTo(BELL_MARKET_BASE_USD);
    expect(computeMarketCapUsd(42, 0)).toBeCloseTo(BELL_MARKET_BASE_USD);
  });

  it("is deterministic for the same seed and elapsed time", () => {
    const a = computeMarketCapUsd(7, 5 * BELL_MARKET_CHECKPOINT_INTERVAL_MS + 1234);
    const b = computeMarketCapUsd(7, 5 * BELL_MARKET_CHECKPOINT_INTERVAL_MS + 1234);
    expect(a).toBe(b);
  });

  it("produces different trajectories for different seeds", () => {
    const elapsed = 10 * BELL_MARKET_CHECKPOINT_INTERVAL_MS;
    expect(computeMarketCapUsd(1, elapsed)).not.toBeCloseTo(computeMarketCapUsd(2, elapsed));
  });

  it("is continuous across a checkpoint boundary", () => {
    const seed = 99;
    const checkpointMs = 3 * BELL_MARKET_CHECKPOINT_INTERVAL_MS;
    const justBefore = computeMarketCapUsd(seed, checkpointMs - 1);
    const at = computeMarketCapUsd(seed, checkpointMs);
    const justAfter = computeMarketCapUsd(seed, checkpointMs + 1);
    expect(Math.abs(justBefore - at)).toBeLessThan(1);
    expect(Math.abs(justAfter - at)).toBeLessThan(1);
  });

  it("interpolates smoothly between checkpoints", () => {
    const seed = 3;
    const start = computeMarketCapUsd(seed, 0);
    const mid = computeMarketCapUsd(seed, BELL_MARKET_CHECKPOINT_INTERVAL_MS / 2);
    const end = computeMarketCapUsd(seed, BELL_MARKET_CHECKPOINT_INTERVAL_MS);
    const lower = Math.min(start, end);
    const upper = Math.max(start, end);
    expect(mid).toBeGreaterThanOrEqual(lower);
    expect(mid).toBeLessThanOrEqual(upper);
  });

  it("never goes negative even after many volatile steps", () => {
    for (let seed = 0; seed < 20; seed++) {
      const value = computeMarketCapUsd(seed, 96 * BELL_MARKET_CHECKPOINT_INTERVAL_MS);
      expect(value).toBeGreaterThan(0);
    }
  });

  it("clamps negative elapsed time to the base value", () => {
    expect(computeMarketCapUsd(5, -1000)).toBeCloseTo(BELL_MARKET_BASE_USD);
  });
});
