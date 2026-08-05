import { describe, it, expect } from "vitest";
import { SCENES, getSceneConfig } from "./registry";

describe("scene registry", () => {
  it("has trading-floor entry with type react", () => {
    const scene = SCENES["trading-floor"];
    expect(scene).toBeDefined();
    expect(scene.id).toBe("trading-floor");
    expect(scene.type).toBe("react");
    expect(scene.label).toBe("Trading Floor");
    expect(scene.spawnPoints.length).toBeGreaterThan(0);
  });

  it("has small-office entry with type editor", () => {
    const scene = SCENES["small-office"];
    expect(scene).toBeDefined();
    expect(scene.id).toBe("small-office");
    expect(scene.type).toBe("editor");
    expect(scene.label).toBe("Small Office");
    expect(scene.configUrl).toBe("/scenes/small-office/config.json");
    expect(scene.sceneUrl).toBe("/scenes/small-office/scenes/test.json");
    expect(scene.spawnPoints.length).toBeGreaterThan(0);
  });

  it("has trading-space entry with type editor", () => {
    const scene = SCENES["trading-space"];
    expect(scene).toBeDefined();
    expect(scene.id).toBe("trading-space");
    expect(scene.type).toBe("editor");
    expect(scene.label).toBe("Trading Space");
    expect(scene.configUrl).toBe("/scenes/trading-space/config.json");
    expect(scene.sceneUrl).toBe("/scenes/trading-space/scenes/trading-space.json");
    expect(scene.spawnPoints.length).toBeGreaterThan(0);
  });

  it("getSceneConfig returns the right entry", () => {
    expect(getSceneConfig("trading-floor").type).toBe("react");
    expect(getSceneConfig("small-office").type).toBe("editor");
    expect(getSceneConfig("trading-space").type).toBe("editor");
  });

  it("getSceneConfig throws for unknown id", () => {
    expect(() => getSceneConfig("nonexistent")).toThrow();
  });
});
