import { describe, expect, it } from "vitest";
import { validateThesisBody, validateVisitorBookMessage, validateWatchlistItems } from "./officeValidation";

describe("validateThesisBody", () => {
  it("accepts a normal thesis and HTML-escapes it", () => {
    expect(validateThesisBody("<b>SOL</b> is undervalued")).toEqual({
      valid: true,
      text: "&lt;b&gt;SOL&lt;/b&gt; is undervalued",
    });
  });

  it("trims whitespace", () => {
    expect(validateThesisBody("  hello  ")).toEqual({ valid: true, text: "hello" });
  });

  it("rejects an empty thesis", () => {
    expect(validateThesisBody("   ")).toEqual({ valid: false, reason: "empty thesis" });
  });

  it("rejects a thesis over 2000 characters", () => {
    expect(validateThesisBody("a".repeat(2001))).toEqual({ valid: false, reason: "thesis too long" });
  });

  it("accepts a thesis exactly at the limit", () => {
    expect(validateThesisBody("a".repeat(2000)).valid).toBe(true);
  });
});

describe("validateVisitorBookMessage", () => {
  it("accepts and escapes a normal message", () => {
    expect(validateVisitorBookMessage("<script>alert(1)</script>")).toEqual({
      valid: true,
      text: "&lt;script&gt;alert(1)&lt;/script&gt;",
    });
  });

  it("rejects an empty message", () => {
    expect(validateVisitorBookMessage("")).toEqual({ valid: false, reason: "empty message" });
  });

  it("rejects a message over 200 characters", () => {
    expect(validateVisitorBookMessage("a".repeat(201))).toEqual({ valid: false, reason: "message too long" });
  });
});

describe("validateWatchlistItems", () => {
  it("accepts a normal list, uppercasing symbols and escaping notes", () => {
    const result = validateWatchlistItems([
      { symbol: "btc", note: "<i>core</i>" },
      { symbol: "eth" },
    ]);
    expect(result).toEqual({
      valid: true,
      items: [
        { symbol: "BTC", note: "&lt;i&gt;core&lt;/i&gt;" },
        { symbol: "ETH", note: "" },
      ],
    });
  });

  it("rejects a non-array payload", () => {
    expect(validateWatchlistItems("not an array")).toEqual({ valid: false, reason: "invalid watchlist" });
  });

  it("rejects more than 15 items", () => {
    const items = Array.from({ length: 16 }, (_, i) => ({ symbol: `S${i}` }));
    expect(validateWatchlistItems(items)).toEqual({ valid: false, reason: "too many watchlist items" });
  });

  it("accepts exactly 15 items", () => {
    const items = Array.from({ length: 15 }, (_, i) => ({ symbol: `S${i}` }));
    expect(validateWatchlistItems(items).valid).toBe(true);
  });

  it("rejects an item with a missing/non-string symbol", () => {
    expect(validateWatchlistItems([{ note: "no symbol" }])).toEqual({
      valid: false,
      reason: "invalid watchlist item",
    });
  });

  it("rejects an item whose symbol is only whitespace", () => {
    expect(validateWatchlistItems([{ symbol: "   " }])).toEqual({ valid: false, reason: "invalid watchlist item" });
  });

  it("truncates overlong symbols and notes", () => {
    const result = validateWatchlistItems([{ symbol: "x".repeat(30), note: "y".repeat(200) }]);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.items[0]?.symbol).toHaveLength(20);
      expect(result.items[0]?.note).toHaveLength(140);
    }
  });
});
