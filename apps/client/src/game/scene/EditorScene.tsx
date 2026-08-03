import { useEffect, useState } from "react";
import { useApp } from "@playcanvas/react/hooks";
import { Asset, Entity as PcEntity, type Application, type Entity, type Quat, type Texture } from "playcanvas";

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
    let floorCollider: Entity | null = null;
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
            entry.type as Asset["type"],
            entry.file ? { url: prefixUrl(entry.file.url), filename: entry.file.filename || "" } : undefined,
            entry.data as object | string | undefined,
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
        await new Promise<void>((resolve) => {
          let remaining = preloadAssets.length;
          if (remaining === 0) { resolve(); return; }
          for (const asset of preloadAssets) {
            asset.once("load", () => {
              remaining--;
              if (remaining <= 0) resolve();
            });
            asset.once("error", (err: string) => {
              console.warn(`[EditorScene] asset load error: ${asset.name}`, err);
              remaining--;
              if (remaining <= 0) resolve();
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

        // Editor scenes have no collision geometry — add a static floor
        // so the player's physics capsule has something to stand on.
        const floorEntity = new PcEntity("editor-scene-floor", app);
        floorEntity.addComponent("collision", { type: "box", halfExtents: [50, 0.25, 50] });
        floorEntity.addComponent("rigidbody", { type: "static" });
        floorEntity.setLocalPosition(0, -0.25, 0);
        app.root.addChild(floorEntity);
        floorCollider = floorEntity;

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

      if (floorCollider) {
        floorCollider.destroy();
        floorCollider = null;
      }

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
    fog: scene.fog.type,
    fogColor: scene.fogColor ? [scene.fogColor.r, scene.fogColor.g, scene.fogColor.b] : null,
    fogStart: scene.fogStart,
    fogEnd: scene.fogEnd,
    fogDensity: scene.fogDensity,
    ambientLight: scene.ambientLight
      ? [scene.ambientLight.r, scene.ambientLight.g, scene.ambientLight.b]
      : null,
    skybox: scene.skybox,
    skyboxMip: scene.skyboxMip,
    skyboxRotation: scene.skyboxRotation.clone(),
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
    if (skyboxAsset?.resources?.length) {
      scene.setSkybox(skyboxAsset.resources as Texture[]);
    } else if (skyboxAsset) {
      skyboxAsset.once("load", () => {
        if (skyboxAsset.resources?.length) scene.setSkybox(skyboxAsset.resources as Texture[]);
      });
    }
  }
  if (render.skyboxIntensity != null) scene.skyboxIntensity = render.skyboxIntensity as number;
  if (render.skyboxMip != null) scene.skyboxMip = render.skyboxMip as number;
  if (render.exposure != null) scene.exposure = render.exposure as number;
  if (render.fog != null) {
    const FOG_MAP: Record<string, string> = { none: "none", linear: "linear", exp: "exp", exp2: "exp2" };
    scene.fog.type = FOG_MAP[render.fog as string] ?? (render.fog as string);
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
    scene.skybox = (saved.skybox as Texture | null) ?? null;
  }
  if (saved.skyboxIntensity != null) scene.skyboxIntensity = saved.skyboxIntensity as number;
  if (saved.skyboxMip != null) scene.skyboxMip = saved.skyboxMip as number;
  if (saved.exposure != null) scene.exposure = saved.exposure as number;
  if (saved.fog != null) scene.fog.type = saved.fog as string;
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
    scene.skyboxRotation = saved.skyboxRotation as Quat;
  }
  if (saved.clusteredLightingEnabled != null)
    scene.clusteredLightingEnabled = saved.clusteredLightingEnabled as boolean;
}
