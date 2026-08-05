import { describe, expect, it } from "vitest";
import { validateTokenLaunch } from "./bellCycleValidation";

describe("validateTokenLaunch", () => {
  it("accepts a normal token name/ticker, escapes the name, and uppercases the ticker", () => {
    expect(validateTokenLaunch("<b>Moon</b> Coin", "moon")).toEqual({
      valid: true,
      tokenName: "&lt;b&gt;Moon&lt;/b&gt; Coin",
      ticker: "MOON",
    });
  });

  it("trims whitespace from both fields", () => {
    expect(validateTokenLaunch("  Moon Coin  ", "  moon  ")).toEqual({
      valid: true,
      tokenName: "Moon Coin",
      ticker: "MOON",
    });
  });

  it("rejects a token name shorter than the minimum", () => {
    expect(validateTokenLaunch("A", "MOON")).toEqual({
      valid: false,
      reason: "Token name must be at least 2 characters.",
    });
  });

  it("rejects a token name longer than the maximum", () => {
    expect(validateTokenLaunch("a".repeat(25), "MOON")).toEqual({
      valid: false,
      reason: "Token name must be 24 characters or fewer.",
    });
  });

  it("rejects a ticker shorter than the minimum", () => {
    expect(validateTokenLaunch("Moon Coin", "M")).toEqual({
      valid: false,
      reason: "Ticker must be at least 2 characters.",
    });
  });

  it("rejects a ticker longer than the maximum", () => {
    expect(validateTokenLaunch("Moon Coin", "MOOOOON")).toEqual({
      valid: false,
      reason: "Ticker must be 6 characters or fewer.",
    });
  });

  it("rejects a ticker with non-alphanumeric characters", () => {
    expect(validateTokenLaunch("Moon Coin", "MO-ON")).toEqual({
      valid: false,
      reason: "Ticker can only contain letters and numbers.",
    });
  });

  it("accepts values exactly at each length boundary", () => {
    expect(validateTokenLaunch("ab", "AB").valid).toBe(true);
    expect(validateTokenLaunch("a".repeat(24), "A".repeat(6)).valid).toBe(true);
  });
});
