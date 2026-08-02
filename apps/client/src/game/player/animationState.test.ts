import { describe, expect, it } from "vitest";
import { selectAnimationState } from "./animationState";

describe("selectAnimationState", () => {
  it("returns idle when speed is below the threshold", () => {
    expect(selectAnimationState(0, false)).toBe("idle");
    expect(selectAnimationState(0.09, true)).toBe("idle");
  });

  it("returns walk when moving without the run modifier", () => {
    expect(selectAnimationState(4, false)).toBe("walk");
  });

  it("returns run when moving with the run modifier", () => {
    expect(selectAnimationState(6, true)).toBe("run");
  });

  it("treats exactly the threshold speed as moving, not idle", () => {
    expect(selectAnimationState(0.1, false)).toBe("walk");
  });
});
