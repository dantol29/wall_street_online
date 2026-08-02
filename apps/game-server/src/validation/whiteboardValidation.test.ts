import { describe, expect, it } from "vitest";
import { validateWhiteboardShape } from "./whiteboardValidation";

describe("validateWhiteboardShape", () => {
  it("accepts a valid stroke", () => {
    expect(
      validateWhiteboardShape({
        id: "stroke-1",
        authorId: "player-1",
        type: "stroke",
        color: "#ffb347",
        points: [10, 20, 30, 40],
        width: 5,
      }),
    ).toBe(true);
  });

  it("rejects out-of-bounds points", () => {
    expect(
      validateWhiteboardShape({
        id: "stroke-1",
        authorId: "player-1",
        type: "stroke",
        color: "#ffb347",
        points: [10, 20, 2000, 40],
        width: 5,
      }),
    ).toBe(false);
  });

  it("accepts text and rejects oversized text", () => {
    const base = {
      id: "text-1",
      authorId: "player-1",
      type: "text",
      color: "#ffffff",
      x: 100,
      y: 100,
      fontSize: 30,
    };
    expect(validateWhiteboardShape({ ...base, text: "BTC funding flips positive" })).toBe(true);
    expect(validateWhiteboardShape({ ...base, text: "x".repeat(161) })).toBe(false);
  });
});
