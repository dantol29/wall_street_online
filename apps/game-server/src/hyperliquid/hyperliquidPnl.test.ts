import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchHyperliquidAllTimePnl } from "./hyperliquidPnl";

function portfolioResponse(allTimePnlHistory: Array<[number, string]> | undefined) {
  return [
    ["day", { pnlHistory: [[0, "999"]] }],
    ["allTime", allTimePnlHistory ? { pnlHistory: allTimePnlHistory } : {}],
  ];
}

describe("fetchHyperliquidAllTimePnl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the latest point in the allTime period's pnlHistory", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () =>
          portfolioResponse([
            [1000, "0.0"],
            [2000, "-4.25"],
            [3000, "-10.0"],
          ]),
      }),
    );

    const result = await fetchHyperliquidAllTimePnl("0xabc");
    expect(result).toBe(-10);
  });

  it("does not fall back to another period when the allTime period has no history", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => portfolioResponse(undefined) }));

    const result = await fetchHyperliquidAllTimePnl("0xabc");
    expect(result).toBeNull();
  });

  it("returns null when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));

    const result = await fetchHyperliquidAllTimePnl("0xabc");
    expect(result).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));

    const result = await fetchHyperliquidAllTimePnl("0xabc");
    expect(result).toBeNull();
  });

  it("returns null when the response isn't the expected array shape", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ unexpected: true }) }));

    const result = await fetchHyperliquidAllTimePnl("0xabc");
    expect(result).toBeNull();
  });
});
