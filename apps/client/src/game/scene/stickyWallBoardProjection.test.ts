import { describe, expect, it } from "vitest";
import {
  boardFractionToScreenRatio,
  computeStickyWallCameraFrame,
  screenRatioToBoardFraction,
} from "./stickyWallBoardProjection";

const FRAME = computeStickyWallCameraFrame(60, 16 / 9);

describe("screenRatioToBoardFraction", () => {
  it("maps the screen center to the board center", () => {
    const spot = screenRatioToBoardFraction(0.5, 0.5, FRAME);
    expect(spot?.xFraction).toBeCloseTo(0.5, 5);
    expect(spot?.yFraction).toBeCloseTo(0.5, 5);
  });

  it("maps rightward/downward clicks to increasing fractions", () => {
    const right = screenRatioToBoardFraction(0.65, 0.5, FRAME);
    const down = screenRatioToBoardFraction(0.5, 0.65, FRAME);
    expect(right?.xFraction).toBeGreaterThan(0.5);
    expect(down?.yFraction).toBeGreaterThan(0.5);
  });

  it("rejects clicks outside the padded overview frame", () => {
    expect(screenRatioToBoardFraction(-0.1, 0.5, FRAME)).toBeNull();
    expect(screenRatioToBoardFraction(0.5, 1.5, FRAME)).toBeNull();
  });

  it("round-trips through boardFractionToScreenRatio", () => {
    for (const [x, y] of [[0.5, 0.5], [0.2, 0.8], [0.9, 0.15]] as const) {
      const screen = boardFractionToScreenRatio(x, y, FRAME);
      const back = screenRatioToBoardFraction(screen.xRatio, screen.yRatio, FRAME);
      expect(back?.xFraction).toBeCloseTo(x, 5);
      expect(back?.yFraction).toBeCloseTo(y, 5);
    }
  });
});
