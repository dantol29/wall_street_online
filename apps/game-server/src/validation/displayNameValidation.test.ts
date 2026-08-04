import { describe, expect, it } from "vitest";
import { validateDisplayName } from "./displayNameValidation";

describe("validateDisplayName", () => {
  it("accepts a normal name and HTML-escapes it", () => {
    expect(validateDisplayName("<b>Alice</b>")).toEqual({
      valid: true,
      text: "&lt;b&gt;Alice&lt;/b&gt;",
    });
  });

  it("trims whitespace", () => {
    expect(validateDisplayName("  Bob  ")).toEqual({ valid: true, text: "Bob" });
  });

  it("rejects a name shorter than the minimum", () => {
    expect(validateDisplayName("A")).toEqual({
      valid: false,
      reason: "Name must be at least 2 characters.",
    });
  });

  it("rejects a name longer than the maximum", () => {
    expect(validateDisplayName("a".repeat(25))).toEqual({
      valid: false,
      reason: "Name must be 24 characters or fewer.",
    });
  });

  it("accepts a name exactly at each length boundary", () => {
    expect(validateDisplayName("ab").valid).toBe(true);
    expect(validateDisplayName("a".repeat(24)).valid).toBe(true);
  });

  it("rejects whitespace-only input", () => {
    expect(validateDisplayName("   ").valid).toBe(false);
  });

  it("rejects a name matching the guest tag pattern", () => {
    expect(validateDisplayName("Trader-1234")).toEqual({
      valid: false,
      reason: "That name looks like a guest tag — pick something else.",
    });
  });

  it("allows a name that merely resembles but doesn't exactly match the guest pattern", () => {
    expect(validateDisplayName("Trader-12345").valid).toBe(true);
    expect(validateDisplayName("SuperTrader-1234").valid).toBe(true);
  });
});
