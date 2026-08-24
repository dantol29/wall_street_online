import { describe, expect, it } from "vitest";
import { getDockIconSize } from "./dockScale";

describe("getDockIconSize", () => {
  const size = 64;
  const magnification = 104;
  const falloffDistance = 160;

  it("returns full magnification at zero distance", () => {
    expect(getDockIconSize(0, size, magnification, falloffDistance)).toBe(magnification);
  });

  it("returns base size at the falloff distance", () => {
    expect(getDockIconSize(falloffDistance, size, magnification, falloffDistance)).toBe(size);
    expect(getDockIconSize(-falloffDistance, size, magnification, falloffDistance)).toBe(size);
  });

  it("clamps to base size beyond the falloff distance", () => {
    expect(getDockIconSize(falloffDistance * 3, size, magnification, falloffDistance)).toBe(size);
    expect(getDockIconSize(-falloffDistance * 3, size, magnification, falloffDistance)).toBe(size);
  });

  it("interpolates linearly halfway between base size and magnification", () => {
    expect(getDockIconSize(falloffDistance / 2, size, magnification, falloffDistance)).toBe(
      size + (magnification - size) / 2,
    );
  });

  it("is symmetric for positive and negative distances", () => {
    expect(getDockIconSize(40, size, magnification, falloffDistance)).toBe(
      getDockIconSize(-40, size, magnification, falloffDistance),
    );
  });

  it("returns base size for a zero falloff distance instead of dividing by zero", () => {
    expect(getDockIconSize(0, size, magnification, 0)).toBe(magnification);
    expect(getDockIconSize(5, size, magnification, 0)).toBe(size);
  });
});
