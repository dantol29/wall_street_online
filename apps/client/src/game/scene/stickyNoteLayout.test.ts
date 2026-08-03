import { describe, expect, it } from "vitest";
import { getStickyNoteRotation } from "./stickyNoteLayout";

describe("getStickyNoteRotation", () => {
  it("is deterministic for a given session id", () => {
    const first = getStickyNoteRotation("session-abc");
    const second = getStickyNoteRotation("session-abc");
    expect(first).toEqual(second);
  });

  it("keeps rotation within the expected tilt range", () => {
    for (const sessionId of ["a", "b", "session-123", "xyz-789", ""]) {
      expect(Math.abs(getStickyNoteRotation(sessionId))).toBeLessThanOrEqual(8);
    }
  });

  it("gives different sessions different tilts (not all collapsing to one angle)", () => {
    const rotations = ["session-1", "session-2", "session-3"].map(getStickyNoteRotation);
    expect(new Set(rotations).size).toBe(3);
  });
});
