import { describe, expect, it } from "vitest";
import { OFFICE_SLOTS } from "@multiplayer/shared";
import { assignOfficeSlot } from "./officeSlotAssignment";

describe("assignOfficeSlot", () => {
  it("picks the slot at the given random index when none are occupied", () => {
    const result = assignOfficeSlot(new Set(), () => 0);
    expect(result).toEqual({ index: 0, slot: OFFICE_SLOTS[0] });
  });

  it("skips occupied indices", () => {
    const occupied = new Set([0, 1]);
    const result = assignOfficeSlot(occupied, () => 0);
    expect(result?.index).toBe(2);
    expect(occupied.has(result!.index)).toBe(false);
  });

  it("returns null once every slot is occupied (no overlap fallback, unlike spawn points)", () => {
    const occupied = new Set(OFFICE_SLOTS.map((_, index) => index));
    expect(assignOfficeSlot(occupied, () => 0)).toBeNull();
  });

  it("uses randomFn to select among free candidates", () => {
    const result = assignOfficeSlot(new Set(), () => 0.99999);
    expect(result?.index).toBe(OFFICE_SLOTS.length - 1);
  });
});
