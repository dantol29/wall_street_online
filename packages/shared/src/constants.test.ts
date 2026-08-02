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
  ROOM_NAME,
  SPAWN_POINTS,
  TELEPORT_DISTANCE_THRESHOLD_METERS,
  WORLD_BOUNDS,
} from "./constants";
import { ANIMATION_STATES } from "./messages";

describe("shared constants", () => {
  it("match the brief's exact values", () => {
    expect(ROOM_NAME).toBe("social_room");
    expect(MAX_PLAYERS).toBe(20);
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
    expect(SPAWN_POINTS[0]).toEqual({ x: -6, y: 1, z: -8 });
    expect(SPAWN_POINTS[9]).toEqual({ x: 6, y: 1, z: 8 });
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

  it("matches the brief's world bounds", () => {
    expect(WORLD_BOUNDS).toEqual({ minX: -10, maxX: 10, minY: 0, maxY: 8, minZ: -12.5, maxZ: 12.5 });
  });

  it("defines exactly idle, walk, and run animation states", () => {
    expect(ANIMATION_STATES).toEqual(["idle", "walk", "run"]);
  });
});
