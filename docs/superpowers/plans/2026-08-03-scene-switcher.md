# Scene Switcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let players pick between "Trading Floor" (existing React scene) and "Small Office" (PlayCanvas Editor export) before entering, sharing the same multiplayer infrastructure.

**Architecture:** A scene registry maps scene IDs to their config (type, asset URLs, spawn points). `Scene.tsx` receives a `sceneId` prop and conditionally renders either the existing React-based environment or a new `EditorScene` component that loads Editor-exported assets/hierarchy via the PlayCanvas runtime API. `MainMenuOverlay` gets a scene picker. `App.tsx` manages `selectedSceneId` state and gates trading-floor-only interactions.

**Tech Stack:** React 19, PlayCanvas 2.17+, `@playcanvas/react` 0.11.3, TypeScript, Vite 8

## Global Constraints

- No calls to `app.configure()` — the `@playcanvas/react` `<Application>` has already configured the app.
- Editor scene assets go under `apps/client/public/scenes/small-office/` to avoid collisions with the existing `assets/` directory.
- `@multiplayer/shared` is not modified — Small Office spawn points live in the client-side registry only.
- Server-side scene awareness is out of scope — no per-scene rooms or bounds validation changes.
- Interaction features (desk, whiteboard, sticky wall, office editor, Hyperliquid terminal) only run for `sceneId === "trading-floor"`.

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `apps/client/src/scenes/registry.ts` | `SceneConfig` interface + static `SCENES` map with `trading-floor` and `small-office` entries |
| Create | `apps/client/src/game/scene/EditorScene.tsx` | Load/unload PlayCanvas Editor scene: register assets, load hierarchy, apply render settings, cleanup |
| Modify | `apps/client/src/Scene.tsx` | Accept `sceneId` prop, branch rendering by scene type |
| Modify | `apps/client/src/ui/MainMenuOverlay.tsx` | Add scene picker cards before the Enter button |
| Modify | `apps/client/src/App.css` | Add scene picker CSS classes |
| Modify | `apps/client/src/App.tsx` | Add `selectedSceneId` state, pass to Scene + MainMenuOverlay, gate interaction proximity checks |
| Copy   | `apps/client/public/scenes/small-office/` | Editor export assets: `config.json`, `scenes/test.json`, `assets/` |

---

### Task 1: Copy Editor Scene Assets into Client Public Directory

**Files:**
- Copy from: `scenes/Small Office Scene/src/data/config.json` → `apps/client/public/scenes/small-office/config.json`
- Copy from: `scenes/Small Office Scene/src/data/scenes/test.json` → `apps/client/public/scenes/small-office/scenes/test.json`
- Copy from: `scenes/Small Office Scene/public/assets/*` → `apps/client/public/scenes/small-office/assets/`

**Interfaces:**
- Consumes: nothing
- Produces: Static asset files served by Vite at `/scenes/small-office/config.json`, `/scenes/small-office/scenes/test.json`, and `/scenes/small-office/assets/**`

- [ ] **Step 1: Create the target directory structure**

```bash
mkdir -p apps/client/public/scenes/small-office/scenes
```

- [ ] **Step 2: Copy config.json**

```bash
cp "scenes/Small Office Scene/src/data/config.json" apps/client/public/scenes/small-office/config.json
```

- [ ] **Step 3: Copy scene hierarchy**

```bash
cp "scenes/Small Office Scene/src/data/scenes/test.json" apps/client/public/scenes/small-office/scenes/test.json
```

- [ ] **Step 4: Copy all asset directories**

```bash
cp -R "scenes/Small Office Scene/public/assets/"* apps/client/public/scenes/small-office/assets/
```

Each GLB has its own subdirectory (e.g., `assets/Adjustable Desk.glb/Adjustable Desk.glb`). The copy preserves this structure.

- [ ] **Step 5: Verify the copy**

```bash
# Should show config.json, scenes/, assets/
ls apps/client/public/scenes/small-office/

# Should show test.json
ls apps/client/public/scenes/small-office/scenes/

# Should show ~73 directories (one per GLB + skybox + textures)
ls apps/client/public/scenes/small-office/assets/ | wc -l
```

- [ ] **Step 6: Commit**

```bash
git add apps/client/public/scenes/small-office/
git commit -m "feat: copy Small Office editor scene assets into client public dir"
```

---

### Task 2: Scene Registry

**Files:**
- Create: `apps/client/src/scenes/registry.ts`

**Interfaces:**
- Consumes: `SpawnPoint` type from `@multiplayer/shared`; `SPAWN_POINTS` and `WORLD_BOUNDS` from `@multiplayer/shared`
- Produces: `SceneConfig` interface (used by `Scene.tsx`, `EditorScene.tsx`, `App.tsx`, `MainMenuOverlay.tsx`); `SCENES` record keyed by scene ID; `getSceneConfig(id: string): SceneConfig` lookup function

- [ ] **Step 1: Write the test**

Create `apps/client/src/scenes/registry.test.ts`:

```ts
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

  it("getSceneConfig returns the right entry", () => {
    expect(getSceneConfig("trading-floor").type).toBe("react");
    expect(getSceneConfig("small-office").type).toBe("editor");
  });

  it("getSceneConfig throws for unknown id", () => {
    expect(() => getSceneConfig("nonexistent")).toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/client && npx vitest run src/scenes/registry.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the registry**

Create `apps/client/src/scenes/registry.ts`:

```ts
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
```

Note: The Small Office spawn points are set to the origin area initially. After running the scene for the first time (Task 7), adjust them based on the actual floor layout.

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd apps/client && npx vitest run src/scenes/registry.test.ts
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/scenes/registry.ts apps/client/src/scenes/registry.test.ts
git commit -m "feat: add scene registry with trading-floor and small-office entries"
```

---

### Task 3: EditorScene Component

**Files:**
- Create: `apps/client/src/game/scene/EditorScene.tsx`

**Interfaces:**
- Consumes: `useApp()` from `@playcanvas/react/hooks`; PlayCanvas `Application`, `Asset`, `Entity` types from `playcanvas`
- Produces: `<EditorScene configUrl={string} sceneUrl={string} />` React component

This is the most complex task. The component must:
1. Fetch `config.json` and register all 773 assets with `app.assets.add()`
2. Preload assets that have file references (containers, textures, cubemaps)
3. Fetch `test.json` and load the scene hierarchy via `app.scenes.loadSceneHierarchy()`
4. Destroy the loaded "Camera" entity (the existing `LocalPlayer` provides the camera)
5. Apply render settings from the scene JSON
6. Clean up everything on unmount

- [ ] **Step 1: Create the EditorScene component skeleton**

Create `apps/client/src/game/scene/EditorScene.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useApp } from "@playcanvas/react/hooks";
import { Asset, type Application, type Entity } from "playcanvas";

interface EditorSceneProps {
  configUrl: string;
  sceneUrl: string;
}

interface LoadState {
  phase: "loading" | "ready" | "error";
  message?: string;
}

const ASSET_BASE_PATH = "/scenes/small-office/";

function prefixUrl(url: string): string {
  if (url.startsWith("http") || url.startsWith("/")) return url;
  return ASSET_BASE_PATH + url;
}

const PRELOADABLE_TYPES = new Set(["container", "texture", "cubemap"]);

export function EditorScene({ configUrl, sceneUrl }: EditorSceneProps) {
  const app = useApp();
  const [loadState, setLoadState] = useState<LoadState>({ phase: "loading", message: "Loading scene…" });

  useEffect(() => {
    if (!app) return;

    let cancelled = false;
    const addedAssets: Asset[] = [];
    let loadedRoot: Entity | null = null;
    let savedRenderSettings: Record<string, unknown> | null = null;

    const load = async () => {
      try {
        setLoadState({ phase: "loading", message: "Fetching asset registry…" });
        const configResponse = await fetch(configUrl);
        if (!configResponse.ok) throw new Error(`Failed to fetch config: ${configResponse.status}`);
        const config = await configResponse.json();

        if (cancelled) return;

        setLoadState({ phase: "loading", message: "Registering assets…" });
        const assetMap = config.assets as Record<string, {
          type: string;
          name?: string;
          file?: { url: string; filename?: string; size?: number; hash?: string };
          data?: unknown;
          tags?: string[];
          preload?: boolean;
          i18n?: unknown;
        }>;

        for (const [idStr, entry] of Object.entries(assetMap)) {
          const id = Number(idStr);
          const asset = new Asset(
            entry.name || `asset-${id}`,
            entry.type,
            entry.file ? { url: prefixUrl(entry.file.url), filename: entry.file.filename || "" } : undefined,
            entry.data,
          );
          asset.id = id;
          if (entry.tags) {
            for (const tag of entry.tags) asset.tags.add(tag);
          }
          if (entry.i18n) {
            for (const [locale, localeAssetId] of Object.entries(entry.i18n as Record<string, number>)) {
              asset.addLocalizedAssetId(locale, localeAssetId);
            }
          }
          asset.preload = PRELOADABLE_TYPES.has(entry.type) && !!entry.file;
          app.assets.add(asset);
          addedAssets.push(asset);
        }

        if (cancelled) return;

        setLoadState({ phase: "loading", message: "Preloading assets…" });
        const preloadAssets = addedAssets.filter((a) => a.preload);
        await new Promise<void>((resolve, reject) => {
          let remaining = preloadAssets.length;
          if (remaining === 0) { resolve(); return; }
          for (const asset of preloadAssets) {
            asset.once("load", () => {
              remaining--;
              if (!cancelled && remaining <= 0) resolve();
            });
            asset.once("error", (err: string) => {
              console.warn(`[EditorScene] asset load error: ${asset.name}`, err);
              remaining--;
              if (!cancelled && remaining <= 0) resolve();
            });
            app.assets.load(asset);
          }
        });

        if (cancelled) return;

        setLoadState({ phase: "loading", message: "Loading scene hierarchy…" });
        const sceneResponse = await fetch(sceneUrl);
        if (!sceneResponse.ok) throw new Error(`Failed to fetch scene: ${sceneResponse.status}`);
        const sceneData = await sceneResponse.json();

        savedRenderSettings = captureRenderSettings(app);

        await new Promise<void>((resolve, reject) => {
          app.scenes.loadSceneHierarchy(sceneUrl, (err: string | null, entity?: Entity) => {
            if (err) { reject(new Error(err)); return; }
            loadedRoot = entity ?? null;
            resolve();
          });
        });

        if (cancelled) return;

        const cameraEntity = app.root.findByName("Camera");
        if (cameraEntity) cameraEntity.destroy();

        if (sceneData.settings?.render) {
          applyRenderSettings(app, sceneData.settings.render);
        }

        setLoadState({ phase: "ready" });
      } catch (error) {
        if (!cancelled) {
          console.error("[EditorScene] load error:", error);
          setLoadState({
            phase: "error",
            message: error instanceof Error ? error.message : "Failed to load scene",
          });
        }
      }
    };

    void load();

    return () => {
      cancelled = true;

      if (loadedRoot) {
        loadedRoot.destroy();
        loadedRoot = null;
      }

      for (const asset of addedAssets) {
        asset.unload();
        app.assets.remove(asset);
      }
      addedAssets.length = 0;

      if (savedRenderSettings) {
        restoreRenderSettings(app, savedRenderSettings);
        savedRenderSettings = null;
      }
    };
  }, [app, configUrl, sceneUrl]);

  if (loadState.phase === "loading") {
    return null;
  }

  if (loadState.phase === "error") {
    return null;
  }

  return null;
}

function captureRenderSettings(app: Application): Record<string, unknown> {
  const scene = app.scene;
  return {
    skyboxIntensity: scene.skyboxIntensity,
    exposure: scene.exposure,
    toneMapping: scene.toneMapping,
    fog: scene.fog,
    fogColor: scene.fogColor ? [scene.fogColor.r, scene.fogColor.g, scene.fogColor.b] : null,
    fogStart: scene.fogStart,
    fogEnd: scene.fogEnd,
    fogDensity: scene.fogDensity,
    ambientLight: scene.ambientLight
      ? [scene.ambientLight.r, scene.ambientLight.g, scene.ambientLight.b]
      : null,
    skybox: scene.skybox,
    skyboxMip: scene.skyboxMip,
    skyboxRotation: scene.skyboxRotation
      ? [scene.skyboxRotation.x, scene.skyboxRotation.y, scene.skyboxRotation.z]
      : null,
    gammaCorrection: scene.gammaCorrection,
    clusteredLightingEnabled: scene.clusteredLightingEnabled,
  };
}

function applyRenderSettings(
  app: Application,
  render: Record<string, unknown>,
): void {
  const scene = app.scene;
  if (render.skybox != null) {
    const skyboxAsset = app.assets.get(render.skybox as number);
    if (skyboxAsset?.resource) {
      scene.setSkybox(skyboxAsset.resource);
    } else if (skyboxAsset) {
      skyboxAsset.once("load", () => {
        if (skyboxAsset.resource) scene.setSkybox(skyboxAsset.resource);
      });
    }
  }
  if (render.skyboxIntensity != null) scene.skyboxIntensity = render.skyboxIntensity as number;
  if (render.skyboxMip != null) scene.skyboxMip = render.skyboxMip as number;
  if (render.exposure != null) scene.exposure = render.exposure as number;
  if (render.tonemapping != null) scene.toneMapping = render.tonemapping as number;
  if (render.gamma_correction != null) scene.gammaCorrection = render.gamma_correction as number;
  if (render.fog != null) {
    const FOG_MAP: Record<string, string> = { none: "none", linear: "linear", exp: "exp", exp2: "exp2" };
    scene.fog = FOG_MAP[render.fog as string] ?? render.fog as string;
  }
  if (render.fog_color != null) {
    const [r, g, b] = render.fog_color as number[];
    scene.fogColor.set(r, g, b);
  }
  if (render.fog_start != null) scene.fogStart = render.fog_start as number;
  if (render.fog_end != null) scene.fogEnd = render.fog_end as number;
  if (render.fog_density != null) scene.fogDensity = render.fog_density as number;
  if (render.global_ambient != null) {
    const [r, g, b] = render.global_ambient as number[];
    scene.ambientLight.set(r, g, b);
  }
  if (render.clusteredLightingEnabled != null)
    scene.clusteredLightingEnabled = render.clusteredLightingEnabled as boolean;
  if (render.lightingCells != null) {
    const cells = render.lightingCells as number[];
    scene.lighting.cells.set(cells[0], cells[1], cells[2]);
  }
  if (render.lightingMaxLightsPerCell != null)
    scene.lighting.maxLightsPerCell = render.lightingMaxLightsPerCell as number;
  if (render.lightingShadowsEnabled != null)
    scene.lighting.shadowsEnabled = render.lightingShadowsEnabled as boolean;
  if (render.lightingShadowAtlasResolution != null)
    scene.lighting.shadowAtlasResolution = render.lightingShadowAtlasResolution as number;
  if (render.lightingCookiesEnabled != null)
    scene.lighting.cookiesEnabled = render.lightingCookiesEnabled as boolean;
  if (render.lightingCookieAtlasResolution != null)
    scene.lighting.cookieAtlasResolution = render.lightingCookieAtlasResolution as number;
}

function restoreRenderSettings(
  app: Application,
  saved: Record<string, unknown>,
): void {
  const scene = app.scene;
  if (saved.skybox !== undefined) {
    if (saved.skybox) {
      const skyboxAsset = app.assets.get(saved.skybox as number);
      if (skyboxAsset?.resource) scene.setSkybox(skyboxAsset.resource);
    } else {
      scene.skybox = null;
    }
  }
  if (saved.skyboxIntensity != null) scene.skyboxIntensity = saved.skyboxIntensity as number;
  if (saved.skyboxMip != null) scene.skyboxMip = saved.skyboxMip as number;
  if (saved.exposure != null) scene.exposure = saved.exposure as number;
  if (saved.toneMapping != null) scene.toneMapping = saved.toneMapping as number;
  if (saved.gammaCorrection != null) scene.gammaCorrection = saved.gammaCorrection as number;
  if (saved.fog != null) scene.fog = saved.fog as string;
  if (saved.fogColor) {
    const [r, g, b] = saved.fogColor as number[];
    scene.fogColor.set(r, g, b);
  }
  if (saved.fogStart != null) scene.fogStart = saved.fogStart as number;
  if (saved.fogEnd != null) scene.fogEnd = saved.fogEnd as number;
  if (saved.fogDensity != null) scene.fogDensity = saved.fogDensity as number;
  if (saved.ambientLight) {
    const [r, g, b] = saved.ambientLight as number[];
    scene.ambientLight.set(r, g, b);
  }
  if (saved.skyboxRotation) {
    const [x, y, z] = saved.skyboxRotation as number[];
    scene.skyboxRotation.set(x, y, z);
  }
  if (saved.clusteredLightingEnabled != null)
    scene.clusteredLightingEnabled = saved.clusteredLightingEnabled as boolean;
}
```

- [ ] **Step 2: Verify the component compiles**

```bash
cd apps/client && npx tsc --noEmit src/game/scene/EditorScene.tsx
```

If type errors arise from the PlayCanvas API (some properties may be typed differently in the declarations vs runtime), fix them by checking the PlayCanvas engine source. Common adjustments:
- `scene.fog` may need a `FOG_*` constant instead of a string
- `scene.setSkybox()` may accept a `Texture` rather than being called directly on `.skybox`
- `scene.lighting` property access may require casting

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/game/scene/EditorScene.tsx
git commit -m "feat: add EditorScene component for PlayCanvas Editor scene loading"
```

---

### Task 4: Scene.tsx — Accept sceneId and Branch Rendering

**Files:**
- Modify: `apps/client/src/Scene.tsx`

**Interfaces:**
- Consumes: `SceneConfig` and `getSceneConfig` from `apps/client/src/scenes/registry.ts`; `EditorScene` from `apps/client/src/game/scene/EditorScene.tsx`
- Produces: Updated `SceneProps` with `sceneId: string`; rendering branches by scene type

- [ ] **Step 1: Add the sceneId prop to SceneProps**

In `apps/client/src/Scene.tsx`, add `sceneId: string` to the `SceneProps` interface (line 29):

```ts
interface SceneProps {
  sceneId: string;
  playerEntityRef?: Ref<PcEntity>;
  localAnimationRef: MutableRefObject<AnimationState>;
  localSeated: boolean;
  nameLabelsContainerRef: React.RefObject<HTMLDivElement | null>;
  speakingPlayerIds: ReadonlySet<string>;
  messages: ChatMessage[];
  whiteboardSnapshot: WhiteboardSnapshot;
  officeSlotContentById?: Record<string, OfficeSlotContent>;
  stickyNotes: StickyNote[];
  justPlacedStickyNoteAuthorSessionId?: string | null;
  worldTime: WorldTimeAnchor;
  worldTimeOverridePhase: number | null;
}
```

- [ ] **Step 2: Add imports for registry and EditorScene**

Add at the top of the file:

```ts
import { getSceneConfig } from "./scenes/registry";
import { EditorScene } from "./game/scene/EditorScene";
```

- [ ] **Step 3: Update the component destructuring to include sceneId**

In the `forwardRef` function signature (line 63), add `sceneId` to the destructured props:

```ts
const Scene = forwardRef<SceneHandle, SceneProps>(function Scene(
  {
    sceneId,
    playerEntityRef,
    // ...rest unchanged
  },
  ref,
) {
```

- [ ] **Step 4: Replace the hardcoded DEFAULT_SPAWN with scene-aware spawn**

Remove line 61:
```ts
// DELETE: const DEFAULT_SPAWN = SPAWN_POINTS[0];
```

Add inside the component body (after the `useImperativeHandle`, before the return):

```ts
const sceneConfig = getSceneConfig(sceneId);
const spawn = sceneConfig.spawnPoints[0];
```

- [ ] **Step 5: Branch the render output by scene type**

Replace the return block (lines 137-162) with:

```tsx
const sceneEnvironment =
  sceneConfig.type === "editor" && sceneConfig.configUrl && sceneConfig.sceneUrl ? (
    <EditorScene configUrl={sceneConfig.configUrl} sceneUrl={sceneConfig.sceneUrl} />
  ) : (
    <DayNightProvider worldTime={worldTime} overridePhase={worldTimeOverridePhase}>
      <RoomEnvironment officeSlotContentById={officeSlotContentById} />
      <CollaborativeWhiteboardDisplay snapshot={whiteboardSnapshot} />
      <StickyWallDisplay notes={stickyNotes} justPlacedAuthorSessionId={justPlacedStickyNoteAuthorSessionId} />
      <Lighting />
    </DayNightProvider>
  );

return (
  <>
    {sceneEnvironment}
    <LocalPlayer
      spawn={spawn}
      seated={localSeated}
      animationRef={localAnimationRef}
      ref={playerEntityRef}
    />

    {remoteIds.map((sessionId) => (
      <RemotePlayer key={sessionId} sessionId={sessionId} recordsRef={recordsRef} />
    ))}

    <NameLabelsOverlay
      remoteIds={remoteIds}
      recordsRef={recordsRef}
      containerRef={nameLabelsContainerRef}
      speakingPlayerIds={speakingPlayerIds}
    />
    <ChatBubblesOverlay messages={messages} recordsRef={recordsRef} containerRef={nameLabelsContainerRef} />
  </>
);
```

Note: The `DayNightProvider` only wraps the react scene environment — the editor scene uses its own lighting from the hierarchy. The `LocalPlayer`, `RemotePlayer`, and overlays are rendered unconditionally for both scene types.

- [ ] **Step 6: Clean up the unused SPAWN_POINTS import**

The `SPAWN_POINTS` import from `@multiplayer/shared` (line 4) is no longer used — the spawn comes from the registry. Remove it:

```ts
import {
  // SPAWN_POINTS removed
  type AnimationState,
  type ChatMessage,
  type StickyNote,
  type WhiteboardSnapshot,
} from "@multiplayer/shared";
```

- [ ] **Step 7: Verify it compiles**

```bash
cd apps/client && npx tsc --noEmit
```

This will report errors in `App.tsx` because `Scene` now requires a `sceneId` prop — that's expected and fixed in Task 6.

- [ ] **Step 8: Commit**

```bash
git add apps/client/src/Scene.tsx
git commit -m "feat: Scene accepts sceneId prop, branches rendering by scene type"
```

---

### Task 5: MainMenuOverlay Scene Picker

**Files:**
- Modify: `apps/client/src/ui/MainMenuOverlay.tsx`
- Modify: `apps/client/src/App.css`

**Interfaces:**
- Consumes: `SCENES` from `apps/client/src/scenes/registry.ts`
- Produces: Updated `MainMenuOverlayProps` with `selectedSceneId: string` and `onSceneSelect: (id: string) => void`

- [ ] **Step 1: Update MainMenuOverlay props and add scene picker**

Replace the full content of `apps/client/src/ui/MainMenuOverlay.tsx`:

```tsx
import { SCENES } from "../scenes/registry";

interface MainMenuOverlayProps {
  visible: boolean;
  connecting: boolean;
  selectedSceneId: string;
  onSceneSelect: (id: string) => void;
  onEnter: () => void;
}

const CONTROLS = [
  { key: "WASD", label: "Move" },
  { key: "Mouse", label: "Look around" },
  { key: "E", label: "Interact" },
  { key: "Enter", label: "Chat" },
];

const sceneEntries = Object.values(SCENES);

export function MainMenuOverlay({
  visible,
  connecting,
  selectedSceneId,
  onSceneSelect,
  onEnter,
}: MainMenuOverlayProps) {
  if (!visible) return null;

  return (
    <div className="main-menu" onClick={onEnter}>
      <div className="main-menu__panel" onClick={(e) => e.stopPropagation()}>
        <p className="main-menu__eyebrow">MULTIPLAYER TRADING FLOOR</p>
        <h1 className="main-menu__title">WALL STREET ONLINE</h1>

        <div className="main-menu__scenes">
          {sceneEntries.map((scene) => (
            <button
              key={scene.id}
              type="button"
              className={`main-menu__scene-card${selectedSceneId === scene.id ? " main-menu__scene-card--selected" : ""}`}
              onClick={() => onSceneSelect(scene.id)}
            >
              {scene.label}
            </button>
          ))}
        </div>

        <div className="main-menu__controls">
          {CONTROLS.map((control) => (
            <div className="main-menu__control" key={control.key}>
              <kbd>{control.key}</kbd>
              <span>{control.label}</span>
            </div>
          ))}
        </div>

        <button type="button" className="main-menu__play" onClick={onEnter}>
          {connecting ? "Connecting…" : "Enter the Floor"}
        </button>

        <p className="main-menu__hint">
          <span className="main-menu__hint-desktop">or click anywhere to enter</span>
          <span className="main-menu__hint-touch">or tap anywhere to enter</span>
        </p>
      </div>
    </div>
  );
}
```

Key changes from the original:
- Added `selectedSceneId` and `onSceneSelect` props
- Added `e.stopPropagation()` on the panel so clicking scene cards doesn't trigger `onEnter`
- Added the `main-menu__scenes` container with selectable card buttons
- The "Enter" button also has an explicit `onClick={onEnter}` (previously relied on the parent `div` click)

- [ ] **Step 2: Add scene picker CSS**

Append to `apps/client/src/App.css`, after the existing `.main-menu__hint` rules (after line 124):

```css
.main-menu__scenes {
  display: flex;
  gap: 10px;
}

.main-menu__scene-card {
  padding: 10px 18px;
  color: #cbc2a4;
  background: rgba(30, 32, 30, 0.6);
  border: 1px solid rgba(205, 188, 145, 0.25);
  font: 600 13px/1.2 "Courier New", monospace;
  letter-spacing: 0.03em;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}

.main-menu__scene-card:hover {
  color: #f1e7c7;
  border-color: rgba(205, 188, 145, 0.55);
}

.main-menu__scene-card--selected {
  color: #181a18;
  background: #d8c99e;
  border-color: #f1e7c7;
}

.main-menu__scene-card--selected:hover {
  color: #181a18;
}
```

- [ ] **Step 3: Verify it compiles**

```bash
cd apps/client && npx tsc --noEmit src/ui/MainMenuOverlay.tsx
```

Will succeed for the component itself. `App.tsx` will fail because it hasn't been updated yet — expected.

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/ui/MainMenuOverlay.tsx apps/client/src/App.css
git commit -m "feat: add scene picker to MainMenuOverlay"
```

---

### Task 6: App.tsx — Scene Selection State and Interaction Gating

**Files:**
- Modify: `apps/client/src/App.tsx`

**Interfaces:**
- Consumes: `getSceneConfig` from `apps/client/src/scenes/registry.ts`
- Produces: `selectedSceneId` state passed to `Scene` and `MainMenuOverlay`; proximity checks gated on scene type

This task makes four changes to `App.tsx`:

1. Add `selectedSceneId` state
2. Pass `sceneId` to `<Scene>`
3. Pass `selectedSceneId` and `onSceneSelect` to `<MainMenuOverlay>`
4. Gate proximity checks and interaction prompts on `sceneId === "trading-floor"`

- [ ] **Step 1: Add selectedSceneId state**

After the `entered` state declaration (line 481), add:

```ts
const [selectedSceneId, setSelectedSceneId] = useState("trading-floor");
```

Also add a ref for synchronous access in the sendTimer closure:

```ts
const selectedSceneIdRef = useRef("trading-floor");
```

And keep them in sync — add near the other ref-sync patterns in the file (search for patterns like `someRef.current = someValue`):

```ts
selectedSceneIdRef.current = selectedSceneId;
```

- [ ] **Step 2: Pass sceneId to Scene**

Find the `<Scene` JSX (around line 1493) and add the `sceneId` prop:

```tsx
<Scene
  sceneId={selectedSceneId}
  playerEntityRef={playerEntityRef}
  localAnimationRef={localAnimationRef}
  // ...rest unchanged
/>
```

- [ ] **Step 3: Update MainMenuOverlay props**

Find the `<MainMenuOverlay` JSX (around line 1676) and add the new props:

```tsx
<MainMenuOverlay
  visible={!entered && !showErrorOverlay}
  connecting={connectionState !== "connected"}
  selectedSceneId={selectedSceneId}
  onSceneSelect={setSelectedSceneId}
  onEnter={handleEnter}
/>
```

- [ ] **Step 4: Gate proximity checks on trading-floor scene**

In the `sendTimer` interval callback, the proximity checks block starts at line 1126 with `if (!seatedDeskIdRef.current) {`. Wrap the entire proximity-check block with an additional scene-type guard:

```ts
if (!seatedDeskIdRef.current && selectedSceneIdRef.current === "trading-floor") {
  // ... all existing proximity checks unchanged ...
}
```

This ensures whiteboard, desk, office, and sticky wall proximity checks only run in the Trading Floor scene.

- [ ] **Step 5: Gate interaction prompts on trading-floor scene**

The interaction prompt JSX elements (lines ~1581-1626) show "E" key hints for whiteboard, desk, office, sticky wall, and the seated HUD. These should only render for the trading floor. The simplest approach: each prompt already requires its respective `near*` state to be true, and those states will never become true in other scenes (because the proximity checks are gated), so no additional gating is needed in the JSX. The `triggerPrimaryInteraction` function (line 913) also checks `near*` refs, so it's inherently safe.

However, if the user switches scenes without a full remount, stale `near*` state could linger. To be safe, also reset interaction state when scene changes. Add a `useEffect` in App.tsx:

```ts
useEffect(() => {
  if (selectedSceneId !== "trading-floor") {
    setNearbyDeskId(null);
    nearbyDeskIdRef.current = null;
    setNearWhiteboard(false);
    nearWhiteboardRef.current = false;
    setNearOfficeSlotId(null);
    nearOfficeSlotIdRef.current = null;
    setNearStickyWall(false);
    nearStickyWallRef.current = false;
  }
}, [selectedSceneId]);
```

- [ ] **Step 6: Re-enable the menu overlay**

The `entered` state currently defaults to `true` (line 481), which hides the menu. Change it to `false` so players see the menu with the scene picker:

```ts
const [entered, setEntered] = useState(false);
```

- [ ] **Step 7: Verify the full project compiles**

```bash
cd apps/client && npx tsc --noEmit
```

Expected: no errors. If there are errors, fix them — the most likely cause is a missing import for `getSceneConfig` or a type mismatch in the new props.

- [ ] **Step 8: Commit**

```bash
git add apps/client/src/App.tsx
git commit -m "feat: add scene selection state, pass to Scene/MainMenuOverlay, gate interactions"
```

---

### Task 7: Integration Testing — Run and Verify Both Scenes

**Files:**
- Possibly modify: `apps/client/src/scenes/registry.ts` (spawn point tuning)
- Possibly modify: `apps/client/src/game/scene/EditorScene.tsx` (bug fixes)

**Interfaces:**
- Consumes: everything built in Tasks 1-6
- Produces: a working two-scene experience

This task is manual verification. Run the dev server and test both scenes in the browser.

- [ ] **Step 1: Start the dev server**

```bash
pnpm dev
```

- [ ] **Step 2: Test the Trading Floor scene**

1. Open the browser at `http://localhost:5173` (or whatever port Vite uses)
2. The MainMenuOverlay should appear with "Trading Floor" and "Small Office" cards
3. "Trading Floor" should be selected by default
4. Click "Enter the Floor" — the existing Trading Floor scene should load as before
5. Walk around, verify desk/whiteboard/sticky wall interactions still work
6. Verify remote players, chat, voice all function

- [ ] **Step 3: Test the Small Office scene**

1. Refresh the page to return to the menu (hot-switching is out of scope)
2. Click "Small Office" in the scene picker — it should highlight
3. Click "Enter the Floor" — the Small Office scene should load
4. Check the browser console for errors — fix any asset loading issues
5. Verify the player spawns at a reasonable position (not inside a wall or falling through the floor)
6. Walk around the office, verify the camera works
7. Verify no desk/whiteboard/office interaction prompts appear (they're trading-floor-only)
8. Verify chat and name labels still work

- [ ] **Step 4: Tune spawn points**

If the player spawns at a bad position in the Small Office (inside geometry, falling through floor), inspect the scene to find a good open area and update the `small-office` entry's `spawnPoints` in `apps/client/src/scenes/registry.ts`.

The scene has 195 entities with desks, couches, and floor planes. A spawn at `(0, 1, 0)` may need adjustment based on where the floor geometry actually is. Open the browser devtools, check the player position after landing, and pick coordinates in an open area.

- [ ] **Step 5: Fix any render settings issues**

If the editor scene has rendering problems (missing skybox, wrong exposure, no fog), check:
- Console errors from `applyRenderSettings`
- Whether the skybox cubemap asset (id `300840210`) loaded correctly
- Whether PlayCanvas API calls match the engine version's type signatures

Common fixes:
- Skybox might need `scene.skybox = skyboxAsset.resource.cubeMap` instead of `scene.setSkybox()`
- Fog type constants might differ between the scene JSON's string format and the engine's enum

- [ ] **Step 6: Fix any cleanup issues**

1. Load the Small Office
2. Refresh (or navigate back to menu if possible) and load the Trading Floor
3. Verify there's no render settings bleed (wrong skybox, exposure, fog in the Trading Floor)
4. Check the console for errors during unmount

- [ ] **Step 7: Commit any fixes**

```bash
git add -u
git commit -m "fix: tune spawn points and fix editor scene loading issues"
```

---

Plan complete and saved to `docs/superpowers/plans/2026-08-03-scene-switcher.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
