import { describe, expect, it } from "vitest";
import { validateStickyNoteText } from "./stickyNoteValidation";

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
