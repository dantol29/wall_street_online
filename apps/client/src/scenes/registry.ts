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
};

export function getSceneConfig(id: string): SceneConfig {
  const config = SCENES[id];
  if (!config) throw new Error(`Unknown scene: ${id}`);
  return config;
}
