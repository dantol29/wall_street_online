import { describe, expect, it } from "vitest";
import { DESK_STATIONS } from "@multiplayer/shared";
import { findDeskStation, isWithinDeskInteractionRange } from "./seatValidation";

describe("seat validation", () => {
  it("finds a known shared desk", () => {
    const desk = DESK_STATIONS[0];
    expect(desk && findDeskStation(desk.id)).toEqual(desk);
  });

  it("rejects an unknown desk id", () => {
    expect(findDeskStation("not-a-desk")).toBeNull();
  });

  it("requires the player to be near the chair", () => {
    const desk = DESK_STATIONS[0]!;
    expect(isWithinDeskInteractionRange({ x: desk.seatX, z: desk.seatZ }, desk)).toBe(true);
    expect(isWithinDeskInteractionRange({ x: 0, z: 0 }, desk)).toBe(false);
  });
});
