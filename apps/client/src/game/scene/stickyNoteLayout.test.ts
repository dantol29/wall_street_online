import { describe, expect, it } from "vitest";
import { getStickyNoteLayout } from "./stickyNoteLayout";

describe("getStickyNoteLayout", () => {
  it("is deterministic for a given session id", () => {
    const first = getStickyNoteLayout("session-abc");
    const second = getStickyNoteLayout("session-abc");
    expect(first).toEqual(second);
  });

  it("keeps fractions within the board margins", () => {
    for (const sessionId of ["a", "b", "session-123", "xyz-789", ""]) {
      const layout = getStickyNoteLayout(sessionId);
      expect(layout.xFraction).toBeGreaterThanOrEqual(0.1);
      expect(layout.xFraction).toBeLessThanOrEqual(0.9);
      expect(layout.yFraction).toBeGreaterThanOrEqual(0.1);
      expect(layout.yFraction).toBeLessThanOrEqual(0.9);
      expect(Math.abs(layout.rotationDeg)).toBeLessThanOrEqual(8);
    }
  });

  it("gives different sessions different positions (not all collapsing to one spot)", () => {
    const layouts = ["session-1", "session-2", "session-3"].map(getStickyNoteLayout);
    const unique = new Set(layouts.map((layout) => `${layout.xFraction}:${layout.yFraction}`));
    expect(unique.size).toBe(3);
  });
});
