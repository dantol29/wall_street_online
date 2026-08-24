import { describe, expect, it } from "vitest";
import { getVisibleArcSlots, rotateArcIndex } from "./arcSelection";

describe("rotateArcIndex", () => {
  it("moves to the next index when rotating right", () => {
    expect(rotateArcIndex(0, 3, 1)).toBe(1);
  });

  it("moves to the previous index when rotating left", () => {
    expect(rotateArcIndex(1, 3, -1)).toBe(0);
  });

  it("wraps from the last index to the first when rotating right", () => {
    expect(rotateArcIndex(2, 3, 1)).toBe(0);
  });

  it("wraps from the first index to the last when rotating left", () => {
    expect(rotateArcIndex(0, 3, -1)).toBe(2);
  });

  it("stays at 0 for a single-item list in either direction", () => {
    expect(rotateArcIndex(0, 1, 1)).toBe(0);
    expect(rotateArcIndex(0, 1, -1)).toBe(0);
  });

  it("returns 0 for an empty list instead of dividing by zero", () => {
    expect(rotateArcIndex(0, 0, 1)).toBe(0);
  });
});

describe("getVisibleArcSlots", () => {
  const items = ["a", "b", "c", "d", "e"];

  it("centers the active item at offset 0", () => {
    const slots = getVisibleArcSlots(items, 2, 2);
    expect(slots.find((slot) => slot.offset === 0)?.item).toBe("c");
  });

  it("wraps neighbors around both ends of the list", () => {
    const slots = getVisibleArcSlots(items, 0, 2);
    expect(slots.map((slot) => slot.item)).toEqual(["d", "e", "a", "b", "c"]);
  });

  it("wraps forward past the end of the list", () => {
    const slots = getVisibleArcSlots(items, 4, 2);
    expect(slots.map((slot) => slot.item)).toEqual(["c", "d", "e", "a", "b"]);
  });

  it("never repeats an item when the list is shorter than the requested window", () => {
    const slots = getVisibleArcSlots(["a", "b", "c"], 0, 2);
    expect(slots.map((slot) => slot.item)).toEqual(["c", "a", "b"]);
  });

  it("returns a single slot for a one-item list regardless of radius", () => {
    const slots = getVisibleArcSlots(["only"], 0, 2);
    expect(slots).toEqual([{ item: "only", index: 0, offset: 0 }]);
  });

  it("returns an empty array for an empty list", () => {
    expect(getVisibleArcSlots([], 0, 2)).toEqual([]);
  });
});
