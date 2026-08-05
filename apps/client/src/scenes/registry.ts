import { SPAWN_POINTS, WORLD_BOUNDS, type SpawnPoint } from "@multiplayer/shared";

export interface SceneConfig {
  id: string;
  label: string;
  type: "react" | "editor";
  configUrl?: string;
  sceneUrl?: string;
  spawnPoints: SpawnPoint[];
  worldBounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  };
}

export const SCENES: Record<string, SceneConfig> = {
  "trading-floor": {
    id: "trading-floor",
    label: "Trading Floor",
    type: "react",
    spawnPoints: [...SPAWN_POINTS],
    worldBounds: { ...WORLD_BOUNDS },
  },
  "small-office": {
    id: "small-office",
    label: "Small Office",
    type: "editor",
    configUrl: "/scenes/small-office/config.json",
    sceneUrl: "/scenes/small-office/scenes/test.json",
    spawnPoints: [
      { x: 0, y: 1, z: 0 },
      { x: 1, y: 1, z: 0 },
      { x: -1, y: 1, z: 0 },
      { x: 0, y: 1, z: 1 },
    ],
    worldBounds: { minX: -20, maxX: 20, minY: -1, maxY: 15, minZ: -20, maxZ: 20 },
  },
  "trading-space": {
    id: "trading-space",
    label: "Trading Space",
    type: "editor",
    configUrl: "/scenes/trading-space/config.json",
    sceneUrl: "/scenes/trading-space/scenes/trading-space.json",
    spawnPoints: [
      { x: 0, y: 1, z: 0 },
      { x: 1, y: 1, z: 1 },
      { x: -1, y: 1, z: 0 },
      { x: 0, y: 1, z: -1 },
    ],
    worldBounds: { minX: -30, maxX: 30, minY: -1, maxY: 20, minZ: -30, maxZ: 30 },
  },
  "trading-space-v2": {
    id: "trading-space-v2",
    label: "Trading Space v2",
    type: "editor",
    configUrl: "/scenes/trading-space-v2/config.json",
    sceneUrl: "/scenes/trading-space-v2/scenes/trading-space-2.json",
    spawnPoints: [
      { x: 0, y: 1, z: 0 },
      { x: 1, y: 1, z: 1 },
      { x: -1, y: 1, z: 0 },
      { x: 0, y: 1, z: -1 },
    ],
    worldBounds: { minX: -30, maxX: 30, minY: -1, maxY: 20, minZ: -30, maxZ: 30 },
  },
};

export function getSceneConfig(id: string): SceneConfig {
  const config = SCENES[id];
  if (!config) throw new Error(`Unknown scene: ${id}`);
  return config;
}
