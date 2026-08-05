# Scene Switcher Design

Allow players to choose between multiple 3D environments before entering the game. The first two scenes are "Trading Floor" (existing React-based scene) and "Small Office" (PlayCanvas Editor export). Both share the same multiplayer infrastructure: player movement, remote players, text chat, and voice chat.

## Architecture

### Scene Registry

`apps/client/src/scenes/registry.ts`

A static map of available scenes. Each entry describes how to load the scene and its spatial configuration:

```ts
interface SceneConfig {
  id: string;
  label: string;
  type: "react" | "editor";
  configUrl?: string;   // editor scenes: path to config.json (asset registry)
  sceneUrl?: string;    // editor scenes: path to scene hierarchy JSON
  spawnPoints: SpawnPoint[];
  worldBounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
}
```

Two entries:

- `trading-floor`: type `"react"`, uses existing `SPAWN_POINTS` and `WORLD_BOUNDS` from `@multiplayer/shared`
- `small-office`: type `"editor"`, points to `/scenes/small-office/config.json` and `/scenes/small-office/scenes/test.json`, with its own spawn points derived from the scene geometry

### Asset Placement

Copy the editor export's assets and data into `apps/client/public/scenes/small-office/`:

```
apps/client/public/scenes/small-office/
  config.json          <- from src/data/config.json
  scenes/test.json     <- from src/data/scenes/test.json
  assets/              <- from public/assets/ (GLBs, textures, skybox PNGs)
```

Namespaced under `scenes/small-office/` to avoid collisions with the existing `assets/` directory.

### EditorScene Component

`apps/client/src/game/scene/EditorScene.tsx`

A React component that bridges the PlayCanvas Editor scene format with the `@playcanvas/react` app.

**Mount sequence:**

1. `useApp()` to get the PlayCanvas `Application` instance
2. Fetch `config.json`, extract the `assets` map (773 assets: 70 containers/GLBs, 282 materials, 317 render assets, 32 textures, 2 cubemaps)
3. Register each asset with `app.assets.add()`, prefixing file URLs with the scene's base path
4. Preload all assets with file references (containers, textures)
5. Fetch `test.json`, call `app.scenes.loadSceneHierarchy()` to instantiate the entity tree under the app root
6. Find and destroy the `Camera` entity (named "Camera") from the loaded hierarchy — the existing `LocalPlayer` provides the camera
7. Apply scene-level render settings from the scene JSON's `settings.render` block: skybox, skyboxIntensity, exposure, tonemapping, fog, ambient color, clustered lighting config

**Unmount sequence:**

1. Destroy all entities that were loaded from the scene hierarchy
2. Unregister and unload all assets that were added in step 3
3. Restore the app's render settings to defaults (so switching back to the React scene starts clean)

**Key constraint:** Do NOT call `app.configure()` — the `@playcanvas/react` `<Application>` component has already configured the app. Only use the asset registry and scene hierarchy loading APIs directly.

### Scene.tsx Changes

`Scene` receives a new `sceneId: string` prop. Based on the matching registry entry's `type`:

- `"react"` renders: `<DayNightProvider>`, `<RoomEnvironment>`, `<CollaborativeWhiteboardDisplay>`, `<StickyWallDisplay>`, `<Lighting>` (current behavior)
- `"editor"` renders: `<EditorScene configUrl={...} sceneUrl={...} />`

In both cases, always render:
- `<LocalPlayer>` with spawn point from the scene config
- `<RemotePlayer>` for each remote player
- `<NameLabelsOverlay>`
- `<ChatBubblesOverlay>`

### MainMenuOverlay Changes

Add a scene picker UI before the "Enter" button: two selectable cards showing scene names ("Trading Floor", "Small Office"). The selected scene ID is passed back to `App.tsx` via a new `onSceneSelect` callback.

### App.tsx Changes

- New state: `selectedSceneId` (default: `"trading-floor"`)
- `MainMenuOverlay` receives `selectedSceneId` and `onSceneSelect`
- `Scene` receives `sceneId={selectedSceneId}`
- Interaction features (desk sit/stand, whiteboard, sticky wall, office editor, Hyperliquid terminal) are gated on `sceneId === "trading-floor"` — the proximity checks and interaction prompts skip entirely for other scenes
- The `sendTimer` interval's proximity checks (desks, whiteboard, offices, sticky wall) only run when `sceneId === "trading-floor"`

### Spawn Points

The Small Office scene's spawn points are defined in the registry, not in `@multiplayer/shared`. Initial values will be set to a central open area in the office (to be determined by inspecting the scene geometry). The server's `WORLD_BOUNDS` validation remains permissive enough — if the office scene's bounds exceed the trading floor's, the server's bounds can be widened later without breaking anything (movement validation is a soft clamp, not a hard reject).

## Scope

### In scope

- Scene registry with two entries
- EditorScene component (load/unload editor scenes)
- MainMenuOverlay scene picker
- App.tsx scene selection state and conditional feature gating
- Copying editor assets into the client's public directory

### Out of scope

- Server-side scene awareness (rooms per scene, per-scene bounds validation)
- Desk/whiteboard/sticky wall/office interactions in the Small Office scene
- Scene-specific collision geometry (the editor scene's own colliders from its entities will be used as-is)
- Hot-switching scenes without returning to the menu

## Risks

- **Asset loading time:** 773 assets (including 70 GLB containers) may take a few seconds to preload. A loading indicator should display during this phase.
- **Memory:** Both scenes' assets could coexist in memory if switching back and forth. The unmount cleanup must fully unload editor scene assets.
- **Render settings bleed:** Scene-level settings (skybox, fog, exposure) are global on the app. Switching scenes must explicitly reset these.
- **Collision gaps:** The editor scene may not have floor/wall colliders configured. The player could fall through. This will be caught during testing and fixed by adding collision components in the editor.
