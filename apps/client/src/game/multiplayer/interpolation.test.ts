import { describe, expect, it } from "vitest";
import { createRemoteTransform, getVisualTransform, updateRemoteTransformTarget } from "./interpolation";

const UPDATE_INTERVAL_MS = 1000 / 12;

describe("createRemoteTransform", () => {
  it("initializes previous and target to the same sample", () => {
    const transform = createRemoteTransform({ x: 1, y: 2, z: 3, rotationY: 0.5 }, 1000);
    expect(transform.previousPosition).toEqual({ x: 1, y: 2, z: 3 });
    expect(transform.targetPosition).toEqual({ x: 1, y: 2, z: 3 });
    expect(transform.previousRotationY).toBe(0.5);
    expect(transform.targetRotationY).toBe(0.5);
  });
});

describe("updateRemoteTransformTarget", () => {
  it("shifts the previous target to become the new previous position", () => {
    const transform = createRemoteTransform({ x: 0, y: 1, z: 0, rotationY: 0 }, 1000);
    updateRemoteTransformTarget(transform, { x: 1, y: 1, z: 0, rotationY: 0 }, 1083);
    expect(transform.previousPosition).toEqual({ x: 0, y: 1, z: 0 });
    expect(transform.targetPosition).toEqual({ x: 1, y: 1, z: 0 });
  });

  it("teleports (snaps previous to target) when the jump exceeds the threshold", () => {
    const transform = createRemoteTransform({ x: 0, y: 1, z: 0, rotationY: 0 }, 1000);
    updateRemoteTransformTarget(transform, { x: 20, y: 1, z: 0, rotationY: 0 }, 1083);
    expect(transform.previousPosition).toEqual({ x: 20, y: 1, z: 0 });
    expect(transform.targetPosition).toEqual({ x: 20, y: 1, z: 0 });
  });

  it("does not teleport at exactly the threshold distance", () => {
    const transform = createRemoteTransform({ x: 0, y: 1, z: 0, rotationY: 0 }, 1000);
    updateRemoteTransformTarget(transform, { x: 5, y: 1, z: 0, rotationY: 0 }, 1083);
    expect(transform.previousPosition).toEqual({ x: 0, y: 1, z: 0 });
  });
});

describe("getVisualTransform", () => {
  it("returns the previous position at t=0", () => {
    const transform = createRemoteTransform({ x: 0, y: 1, z: 0, rotationY: 0 }, 1000);
    // 3m jump stays under the 5m teleport threshold, so this exercises interpolation, not a snap.
    updateRemoteTransformTarget(transform, { x: 3, y: 1, z: 0, rotationY: 0 }, 1000);
    const visual = getVisualTransform(transform, 1000, UPDATE_INTERVAL_MS);
    expect(visual.x).toBeCloseTo(0);
  });

  it("returns the halfway point at half the update interval", () => {
    const transform = createRemoteTransform({ x: 0, y: 1, z: 0, rotationY: 0 }, 1000);
    updateRemoteTransformTarget(transform, { x: 3, y: 1, z: 0, rotationY: 0 }, 1000);
    const visual = getVisualTransform(transform, 1000 + UPDATE_INTERVAL_MS / 2, UPDATE_INTERVAL_MS);
    expect(visual.x).toBeCloseTo(1.5, 1);
  });

  it("clamps at the target position once the update interval has fully elapsed", () => {
    const transform = createRemoteTransform({ x: 0, y: 1, z: 0, rotationY: 0 }, 1000);
    updateRemoteTransformTarget(transform, { x: 3, y: 1, z: 0, rotationY: 0 }, 1000);
    const visual = getVisualTransform(transform, 1000 + UPDATE_INTERVAL_MS * 5, UPDATE_INTERVAL_MS);
    expect(visual.x).toBeCloseTo(3);
  });

  it("interpolates rotation along the shortest path across the +/-180 degree wrap", () => {
    const transform = createRemoteTransform({ x: 0, y: 1, z: 0, rotationY: Math.PI - 0.1 }, 1000);
    updateRemoteTransformTarget(transform, { x: 0, y: 1, z: 0, rotationY: -(Math.PI - 0.1) }, 1000);
    const visual = getVisualTransform(transform, 1000 + UPDATE_INTERVAL_MS / 2, UPDATE_INTERVAL_MS);
    // Shortest path crosses the +/-PI seam, so the midpoint should be near PI, not near 0.
    expect(Math.abs(visual.rotationY)).toBeGreaterThan(Math.PI - 0.5);
  });
});
