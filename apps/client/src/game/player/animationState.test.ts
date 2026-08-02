import { describe, expect, it } from "vitest";
import { selectAnimationState } from "./animationState";

describe("selectAnimationState", () => {
  it("returns idle when speed is below the threshold", () => {
    expect(selectAnimationState(0, false)).toBe("idle");
    expect(selectAnimationState(0.09, true)).toBe("idle");
  });

  it("returns walk when moving forward without the run modifier", () => {
    expect(selectAnimationState(4, false, 1, 0)).toBe("walk");
  });

  it("returns run when moving forward with the run modifier", () => {
    expect(selectAnimationState(6, true, 1, 0)).toBe("run");
  });

  it("treats exactly the threshold speed as moving, not idle", () => {
    expect(selectAnimationState(0.1, false, 1, 0)).toBe("walk");
  });

  it("returns walk_right when strafing right dominates forward/back motion", () => {
    expect(selectAnimationState(4, false, 0, 1)).toBe("walk_right");
  });

  it("returns walk_left when strafing left dominates forward/back motion", () => {
    expect(selectAnimationState(4, false, 0, -1)).toBe("walk_left");
  });

  it("returns run_right/run_left when strafing with the run modifier held", () => {
    expect(selectAnimationState(6, true, 0.2, 1)).toBe("run_right");
    expect(selectAnimationState(6, true, 0.2, -1)).toBe("run_left");
  });

  it("prefers forward/back over strafe when forward motion dominates, even off-axis", () => {
    expect(selectAnimationState(4, false, 1, 0.3)).toBe("walk");
  });

  it("returns walk_back/run_back when moving backward", () => {
    expect(selectAnimationState(4, false, -1, 0)).toBe("walk_back");
    expect(selectAnimationState(6, true, -1, 0)).toBe("run_back");
  });

  it("prefers strafe over backward when strafe motion dominates, even off-axis", () => {
    expect(selectAnimationState(4, false, -0.3, 1)).toBe("walk_right");
  });

  it("defaults to forward motion when direction components are omitted", () => {
    expect(selectAnimationState(4, false)).toBe("walk");
  });
});
