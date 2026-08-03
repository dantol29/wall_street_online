import { describe, expect, it } from "vitest";
import { validateStickyNoteText, validateStickyNotePosition } from "./stickyNoteValidation";

describe("validateStickyNoteText", () => {
  it("accepts a normal note and HTML-escapes it", () => {
    expect(validateStickyNoteText("<b>BTC</b> to the moon")).toEqual({
      valid: true,
      text: "&lt;b&gt;BTC&lt;/b&gt; to the moon",
    });
  });

  it("trims whitespace", () => {
    expect(validateStickyNoteText("  hi  ")).toEqual({ valid: true, text: "hi" });
  });

  it("rejects an empty note", () => {
    expect(validateStickyNoteText("   ")).toEqual({ valid: false, reason: "empty note" });
  });

  it("rejects a note over 80 characters", () => {
    expect(validateStickyNoteText("a".repeat(81))).toEqual({ valid: false, reason: "note too long" });
  });

  it("accepts a note exactly at the limit", () => {
    expect(validateStickyNoteText("a".repeat(80)).valid).toBe(true);
  });
});

describe("validateStickyNotePosition", () => {
  it("accepts a position within the board margins", () => {
    expect(validateStickyNotePosition(0.5, 0.5)).toEqual({ valid: true, xFraction: 0.5, yFraction: 0.5 });
  });

  it("accepts numeric strings by coercing them", () => {
    expect(validateStickyNotePosition("0.2", "0.8")).toEqual({ valid: true, xFraction: 0.2, yFraction: 0.8 });
  });

  it("rejects a position outside the margin", () => {
    expect(validateStickyNotePosition(0.01, 0.5)).toEqual({ valid: false, reason: "invalid position" });
  });

  it("rejects non-finite input", () => {
    expect(validateStickyNotePosition(NaN, 0.5).valid).toBe(false);
    expect(validateStickyNotePosition("not a number", 0.5).valid).toBe(false);
    expect(validateStickyNotePosition(undefined, 0.5).valid).toBe(false);
  });
});
