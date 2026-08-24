import { describe, expect, it } from "vitest";
import {
  CAMERA_PITCH_MAX_DEGREES,
  CAMERA_PITCH_MIN_DEGREES,
  CHAT_RATE_LIMIT_MAX_MESSAGES,
  CHAT_RATE_LIMIT_WINDOW_MS,
  MAX_CHAT_LENGTH,
  MAX_PLAYERS,
  MOVEMENT_CONFIG,
  MOVEMENT_SEND_RATE_HZ,
  OFFICE_SLOTS,
  ROOM_NAME,
  SPAWN_POINTS,
  TELEPORT_DISTANCE_THRESHOLD_METERS,
  WORLD_BOUNDS,
} from "./constants";
import { ANIMATION_STATES } from "./messages";

describe("shared constants", () => {
  it("match the brief's exact values", () => {
    expect(ROOM_NAME).toBe("social_room");
    expect(MAX_PLAYERS).toBe(50);
    expect(MOVEMENT_SEND_RATE_HZ).toBe(12);
    expect(MAX_CHAT_LENGTH).toBe(200);
    expect(CHAT_RATE_LIMIT_MAX_MESSAGES).toBe(3);
    expect(CHAT_RATE_LIMIT_WINDOW_MS).toBe(5000);
    expect(TELEPORT_DISTANCE_THRESHOLD_METERS).toBe(5);
    expect(CAMERA_PITCH_MIN_DEGREES).toBe(-85);
    expect(CAMERA_PITCH_MAX_DEGREES).toBe(85);
  });

  it("defines exactly the ten brief-specified spawn points", () => {
    expect(SPAWN_POINTS).toHaveLength(10);
    expect(SPAWN_POINTS[0]).toEqual({ x: -10, y: 1, z: -15 });
    expect(SPAWN_POINTS[9]).toEqual({ x: 10, y: 1, z: 15 });
  });

  it("matches the brief's movement config", () => {
    expect(MOVEMENT_CONFIG).toEqual({
      walkSpeed: 4,
      runSpeed: 6,
      mouseSensitivity: 0.15,
      playerHeight: 1.8,
      playerRadius: 0.35,
    });
  });

  it("matches the enlarged trading-floor world bounds", () => {
    expect(WORLD_BOUNDS).toEqual({ minX: -16, maxX: 16, minY: 0, maxY: 12, minZ: -20, maxZ: 24.5 });
  });

  it("defines 8 uniquely-identified office slots, all within WORLD_BOUNDS", () => {
    expect(OFFICE_SLOTS).toHaveLength(8);
    expect(new Set(OFFICE_SLOTS.map((slot) => slot.id)).size).toBe(8);
    for (const slot of OFFICE_SLOTS) {
      expect(slot.deskX).toBeGreaterThanOrEqual(WORLD_BOUNDS.minX);
      expect(slot.deskX).toBeLessThanOrEqual(WORLD_BOUNDS.maxX);
      expect(slot.deskZ).toBeGreaterThanOrEqual(WORLD_BOUNDS.minZ);
      expect(slot.deskZ).toBeLessThanOrEqual(WORLD_BOUNDS.maxZ);
    }
  });

  it("defines idle, walk/run, and left/right/backward directional animation states", () => {
    expect(ANIMATION_STATES).toEqual([
      "idle",
      "walk",
      "run",
      "walk_left",
      "walk_right",
      "run_left",
      "run_right",
      "walk_back",
      "run_back",
      "wave",
    ]);
  });
});
