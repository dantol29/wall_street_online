import { Fragment, memo, useEffect, useState } from "react";
import { Entity } from "@playcanvas/react";
import { Render } from "@playcanvas/react/components";
import { useMaterial, useTexture } from "@playcanvas/react/hooks";
import {
  BLEND_NORMAL,
  CULLFACE_NONE,
  StandardMaterial,
  type Asset,
  type Texture,
} from "playcanvas";
import { TickerDisplay } from "./TickerDisplay";
import { StaticBox, VisualBox, VisualCylinder } from "./primitives";
import { CoinScreenRows } from "./CoinScreenRows";
import { ROOM_WIDTH, ROOM_LENGTH, ROOM_HEIGHT, WALL_THICKNESS } from "./roomConstants";
import {
  TICKER_PANEL_POSITION,
  TICKER_ROD_X_OFFSET,
  TICKER_SIZE,
} from "./tradingFloorLayout";
import { useDayNight } from "./DayNightContext";
import { CityView } from "./CityView";

/** `Asset.resource` is typed as a generic `object` since its shape depends on asset type; narrow it here. */
function textureOf(asset: Asset | null): Texture | undefined {
  return (asset?.resource as Texture | undefined) ?? undefined;
}

// These StandardMaterial properties are installed by PlayCanvas's runtime
// parameter definitions but are missing from its generated 2.17 declaration.
interface DynamicRefractionMaterial extends StandardMaterial {
  useDynamicRefraction: boolean;
  thickness: number;
}

/**
 * Architectural glass using PlayCanvas's dynamic scene-color refraction.
 * This is deliberately a raw StandardMaterial: @playcanvas/react's current
 * useMaterial serializer does not expose useDynamicRefraction.
 */
function useWindowGlassMaterial(): StandardMaterial {
  const [material] = useState(() => {
    const glass = new StandardMaterial() as DynamicRefractionMaterial;
    glass.name = "trading-floor-window-glass";
    glass.diffuse.set(0.72, 0.82, 0.88);
    // Keep the scene-color refraction, but suppress direct-light glare. The
    // previous strong specular response exposed the large interior key light
    // as a bright reflection across the panes.
    glass.specular.set(0.04, 0.05, 0.06);
    glass.metalness = 0;
    glass.gloss = 0.96;
    glass.opacity = 0.16;
    glass.opacityFadesSpecular = true;
    glass.blendType = BLEND_NORMAL;
    glass.depthWrite = false;
    glass.cull = CULLFACE_NONE;
    glass.twoSidedLighting = true;

    // PlayCanvas defines IOR as outer / surface. Air (1.0) / glass (1.5).
    glass.refraction = 0.92;
    glass.refractionIndex = 1 / 1.5;
    glass.useDynamicRefraction = true;
    // A thin value keeps a flat architectural pane from heavily warping the
    // skyline while still making the surface visible as real glass.
    glass.thickness = 0.035;
    glass.update();
    return glass;
  });

  useEffect(() => () => material.destroy(), [material]);
  return material;
}


/**
 * Room shell: width 20m (x: -10..10), length 25m (z: -12.5..12.5), height
 * 7.5m (y: 0..7.5) — lowered back down from an earlier, much taller 12m pass
 * per explicit feedback, so the ticker/clock fascia (mounted just under the
 * ceiling) sits close under it rather than dangling in a much taller void.
 * Footprint otherwise kept as-is rather than `design.md`'s "recommended"
 * 24x18x5, since `WORLD_BOUNDS` in `packages/shared` (used for server-side
 * movement validation) is built from this width/length and changing it
 * ripples into the server and its tests.
 * Surfaces use tileable PBR textures from Poly Haven (CC0, freely
 * redistributable — see README), tinted toward `design.md`'s "warm beige /
 * faded blue-grey" 1980s palette rather than the neutral tones they ship with.
 *
 * Layout is a single large exchange floor around a fixed coordinate
 * convention:
 *   - North wall (z = -12.5): full-height framed windows, layered foreground
 *     buildings and a daytime HDR skybox beyond them.
 *   - South wall (z = +12.5): reception, near the spawn points.
 *   - West wall (x = -10): the market/exchange board.
 *   - Three rows of freestanding token displays define the main launchpad.
 *   - Wide lanes between screen rows remain clear for movement and gathering.
 *   - The west wall groups the collaborative drawing and sticky-note boards.
 *   - The lanes between token displays are intentionally furniture-free.
 */


/**
 * North wall "steel-framed office tower curtain wall": black steel frame
 * (thick vertical mullions, a header, a sill) with one continuous, full-height
 * glazed opening behind it — floor to near-ceiling, not split by a desk-height
 * crossbar/spandrel — showing a daytime skyline through the open panes rather
 * than an opaque backdrop card.
 */
const WINDOW_GLASS_BOTTOM_Y = 0.15;
const WINDOW_GLASS_TOP_Y = ROOM_HEIGHT - 0.25;
/** Curtain-wall mullions spanning the enlarged north facade. */
const WINDOW_MULLION_X_POSITIONS = [-15, -12, -9, -6, -3, 0, 3, 6, 9, 12, 15];
const WINDOW_PANES = WINDOW_MULLION_X_POSITIONS.slice(0, -1).map((left, index) => ({
  left,
  right: WINDOW_MULLION_X_POSITIONS[index + 1],
}));
const WINDOW_MULLION_WIDTH = 0.22;
const WINDOW_HEADER_THICKNESS = 0.16;
const WINDOW_SILL_THICKNESS = 0.1;
const WINDOW_FRAME_SPAN_X = 30.2;

/** Exterior grade sits around 18 storeys below the trading floor. */
const SKYLINE_GROUND_Y = -55;

/** Imported Sketchfab skyline asset, placed in front of the handmade tower row. */
export const SKYSCRAPER_SKYLINE_POSITION: [number, number, number] = [0, SKYLINE_GROUND_Y, -48];
export const SKYSCRAPER_SKYLINE_SCALE: [number, number, number] = [5.2, 10, 5.2];
export const SKYSCRAPER_SKYLINE_PIVOT: [number, number, number] = [5.8, 0, 0];
const PROCEDURAL_TOWER_POSITION_SCALE = 4;
const PROCEDURAL_TOWER_DEPTH_SCALE = 4;
const PROCEDURAL_TOWER_WIDTH_SCALE = 7.5;
const PROCEDURAL_TOWER_HEIGHT_SCALE = 12.5;

type SkylineCrown = "flat" | "setback" | "spire" | "pyramid";

interface SkylineTowerSpec {
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  bodyColor: string;
  windowColor: string;
  crown: SkylineCrown;
}

/**
 * Layered blocky towers matching the reference image's dense Manhattan view:
 * muted stone/steel colors, strong setbacks, and a few recognizable spires.
 */
const REFERENCE_SKYLINE_TOWERS: SkylineTowerSpec[] = [
  { x: -9.3, z: -17.5, width: 2.4, depth: 2.1, height: 6.4, bodyColor: "#555b60", windowColor: "#7d878b", crown: "flat" },
  { x: -7.5, z: -15.3, width: 1.45, depth: 1.55, height: 9.2, bodyColor: "#66635d", windowColor: "#9a8d76", crown: "setback" },
  { x: -5.8, z: -18.2, width: 2.0, depth: 1.9, height: 7.3, bodyColor: "#4f565c", windowColor: "#7a858c", crown: "flat" },
  { x: -4.0, z: -14.8, width: 1.55, depth: 1.65, height: 10.6, bodyColor: "#6b6860", windowColor: "#a29172", crown: "pyramid" },
  { x: -2.1, z: -17.1, width: 2.25, depth: 2.1, height: 7.8, bodyColor: "#535960", windowColor: "#7c878d", crown: "flat" },
  { x: -0.3, z: -15.8, width: 1.65, depth: 1.7, height: 11.1, bodyColor: "#706d65", windowColor: "#a49478", crown: "spire" },
  { x: 1.6, z: -18.4, width: 2.15, depth: 2.0, height: 6.8, bodyColor: "#4c5359", windowColor: "#758087", crown: "setback" },
  { x: 3.4, z: -15.0, width: 1.55, depth: 1.6, height: 9.7, bodyColor: "#63645f", windowColor: "#948a73", crown: "setback" },
  { x: 5.3, z: -17.3, width: 2.35, depth: 2.15, height: 7.6, bodyColor: "#50575d", windowColor: "#79848a", crown: "flat" },
  { x: 7.0, z: -14.6, width: 1.7, depth: 1.75, height: 11.5, bodyColor: "#74716a", windowColor: "#a89a7e", crown: "spire" },
  { x: 8.8, z: -17.8, width: 2.2, depth: 2.0, height: 6.9, bodyColor: "#4d545a", windowColor: "#747f86", crown: "flat" },
];

export function LowPolySkylineTower({ tower: sourceTower }: { tower: SkylineTowerSpec }) {
  const tower: SkylineTowerSpec = {
    ...sourceTower,
    x: sourceTower.x * PROCEDURAL_TOWER_POSITION_SCALE,
    z: sourceTower.z * PROCEDURAL_TOWER_DEPTH_SCALE,
    width: sourceTower.width * PROCEDURAL_TOWER_WIDTH_SCALE,
    depth: sourceTower.depth * PROCEDURAL_TOWER_WIDTH_SCALE,
    height: sourceTower.height * PROCEDURAL_TOWER_HEIGHT_SCALE,
  };
  // Match the imported GLB's five-material palette: gray structure, black
  // borders / frames, cyan mirror glass, and a nearly black roof.
  const bodyMaterial = useMaterial({
    diffuse: "#555b5e",
    emissive: "#25292b",
    emissiveIntensity: 0.12,
    gloss: 0.44,
    metalness: 0,
  });
  const trimMaterial = useMaterial({ diffuse: "#111417", gloss: 0.5, metalness: 0 });
  const windowMaterial = useMaterial({
    diffuse: "#719da6",
    emissive: "#3f626a",
    emissiveIntensity: 0.32,
    gloss: 0.78,
    metalness: 0,
  });
  const crownMaterial = useMaterial({
    diffuse: "#444b4e",
    emissive: "#202426",
    emissiveIntensity: 0.1,
    gloss: 0.42,
    metalness: 0,
  });
  const roofEquipmentMaterial = useMaterial({ diffuse: "#111417", gloss: 0.5, metalness: 0 });

  const hasCrown = tower.crown !== "flat";
  const bodyHeight = hasCrown ? tower.height * 0.84 : tower.height * 0.94;
  // One facade band per ~3.2m storey preserves human scale on 80–145m towers.
  const floorCount = Math.max(5, Math.floor(bodyHeight / 3.2));
  const floorLines = Array.from(
    { length: floorCount + 1 },
    (_, index) => 1.6 + index * ((bodyHeight - 3.2) / floorCount),
  );
  const frontMullionCount = Math.max(3, Math.round(tower.width / 2.4));
  const sideMullionCount = Math.max(3, Math.round(tower.depth / 2.4));
  const frontMullionXs = Array.from(
    { length: frontMullionCount + 1 },
    (_, index) => tower.x - tower.width * 0.41 + index * ((tower.width * 0.82) / frontMullionCount),
  );
  const sideMullionZs = Array.from(
    { length: sideMullionCount + 1 },
    (_, index) => tower.z - tower.depth * 0.4 + index * ((tower.depth * 0.8) / sideMullionCount),
  );
  const tierOneHeight = tower.height * 0.075;
  const tierTwoHeight = tower.height * 0.04;
  const crownBaseY = bodyHeight;
  const remainingHeight = Math.max(0.25, tower.height - bodyHeight - tierOneHeight - tierTwoHeight);
  const facadeHeight = Math.max(1, bodyHeight - 2);
  const facadeCenterY = 1 + facadeHeight / 2;
  const frameThickness = 0.14;
  const frontFacadeZ = tower.z + tower.depth / 2 + 0.064;
  const sideFacadeX = tower.x + tower.width / 2 + 0.064;

  return (
    <Entity position={[0, SKYLINE_GROUND_Y, 0]}>
      <VisualBox
        position={[tower.x, 0.18, tower.z]}
        size={[tower.width * 1.08, 0.36, tower.depth * 1.08]}
        material={crownMaterial}
      />
      <VisualBox
        position={[tower.x, bodyHeight / 2, tower.z]}
        size={[tower.width, bodyHeight, tower.depth]}
        material={bodyMaterial}
      />

      {/* Cyan mirror-glass planes match the downloaded building material. */}
      <VisualBox
        position={[tower.x, facadeCenterY, tower.z + tower.depth / 2 + 0.028]}
        size={[tower.width * 0.82, facadeHeight, 0.04]}
        material={windowMaterial}
      />
      <VisualBox
        position={[tower.x + tower.width / 2 + 0.028, facadeCenterY, tower.z]}
        size={[0.04, facadeHeight, tower.depth * 0.8]}
        material={windowMaterial}
      />

      {/* Thick black perimeter borders reproduce the GLB's framed facade. */}
      {[-1, 1].map((direction) => (
        <Fragment key={`facade-border-${tower.x}-${direction}`}>
          <VisualBox
            position={[tower.x + direction * tower.width * 0.41, facadeCenterY, frontFacadeZ]}
            size={[frameThickness, facadeHeight, frameThickness]}
            material={trimMaterial}
          />
          <VisualBox
            position={[sideFacadeX, facadeCenterY, tower.z + direction * tower.depth * 0.4]}
            size={[frameThickness, facadeHeight, frameThickness]}
            material={trimMaterial}
          />
        </Fragment>
      ))}
      {[
        1,
        Math.max(1, bodyHeight - 1),
      ].map((y, index) => (
        <Fragment key={`facade-horizontal-border-${tower.x}-${index}`}>
          <VisualBox
            position={[tower.x, y, frontFacadeZ]}
            size={[tower.width * 0.84, frameThickness, frameThickness]}
            material={trimMaterial}
          />
          <VisualBox
            position={[sideFacadeX, y, tower.z]}
            size={[frameThickness, frameThickness, tower.depth * 0.82]}
            material={trimMaterial}
          />
        </Fragment>
      ))}

      {/* Black floor bands and mullions divide the continuous reflective glass. */}
      {floorLines.map((y, index) => (
        <Fragment key={`floor-line-${tower.x}-${index}`}>
          <VisualBox
            position={[tower.x, y, frontFacadeZ]}
            size={[tower.width * 0.84, frameThickness, frameThickness]}
            material={trimMaterial}
          />
          <VisualBox
            position={[sideFacadeX, y, tower.z]}
            size={[frameThickness, frameThickness, tower.depth * 0.82]}
            material={trimMaterial}
          />
        </Fragment>
      ))}
      {frontMullionXs.map((x, index) => (
        <VisualBox
          key={`front-mullion-${tower.x}-${index}`}
          position={[x, facadeCenterY, frontFacadeZ]}
          size={[frameThickness, facadeHeight, frameThickness]}
          material={trimMaterial}
        />
      ))}
      {sideMullionZs.map((z, index) => (
        <VisualBox
          key={`side-mullion-${tower.x}-${index}`}
          position={[sideFacadeX, facadeCenterY, z]}
          size={[frameThickness, facadeHeight, frameThickness]}
          material={trimMaterial}
        />
      ))}

      {hasCrown && (
        <>
          <VisualBox
            position={[tower.x, crownBaseY + 0.035, tower.z]}
            size={[tower.width * 1.035, 0.07, tower.depth * 1.035]}
            material={crownMaterial}
          />
          <VisualBox
            position={[tower.x, crownBaseY + tierOneHeight / 2, tower.z]}
            size={[tower.width * 0.72, tierOneHeight, tower.depth * 0.74]}
            material={bodyMaterial}
          />
          <VisualBox
            position={[tower.x, crownBaseY + tierOneHeight + 0.025, tower.z]}
            size={[tower.width * 0.76, 0.05, tower.depth * 0.78]}
            material={trimMaterial}
          />
          <VisualBox
            position={[tower.x, crownBaseY + tierOneHeight + tierTwoHeight / 2, tower.z]}
            size={[tower.width * 0.46, tierTwoHeight, tower.depth * 0.48]}
            material={crownMaterial}
          />
        </>
      )}

      {tower.crown === "flat" && (
        <VisualBox
          position={[tower.x, bodyHeight + (tower.height - bodyHeight) / 2, tower.z]}
          size={[tower.width * 0.58, tower.height - bodyHeight, tower.depth * 0.55]}
          material={crownMaterial}
        />
      )}
      {tower.crown === "setback" && (
        <VisualBox
          position={[tower.x, tower.height - remainingHeight / 2, tower.z]}
          size={[tower.width * 0.28, remainingHeight, tower.depth * 0.3]}
          material={crownMaterial}
        />
      )}
      {tower.crown === "pyramid" && (
        <Entity
          position={[tower.x, tower.height - remainingHeight / 2, tower.z]}
          scale={[tower.width * 0.44, remainingHeight, tower.depth * 0.46]}
        >
          <Render type="cone" material={crownMaterial} />
        </Entity>
      )}
      {tower.crown === "spire" && (
        <Entity
          position={[tower.x, tower.height - remainingHeight / 2, tower.z]}
          scale={[tower.width * 0.14, remainingHeight, tower.width * 0.14]}
        >
          <Render type="cone" material={crownMaterial} />
        </Entity>
      )}

      {/* Small rooftop mechanical housings and antennas sell real scale from the interior. */}
      {(tower.crown === "flat" || tower.crown === "setback") && (
        <>
          <VisualBox
            position={[tower.x - tower.width * 0.17, tower.height + 0.11, tower.z]}
            size={[Math.max(0.18, tower.width * 0.18), 0.22, Math.max(0.2, tower.depth * 0.2)]}
            material={roofEquipmentMaterial}
          />
          <VisualCylinder
            position={[tower.x + tower.width * 0.18, tower.height + 0.28, tower.z]}
            radius={0.025}
            height={0.56}
            material={roofEquipmentMaterial}
          />
        </>
      )}
    </Entity>
  );
}

/**
 * Sparse warm office windows on the handmade skyline layer. Keeping these as
 * a separate transparent layer lets the original imported skyscraper model
 * retain its authored glass/reflections while the city still visibly wakes up
 * at dusk.
 */
export function SkylineNightWindows() {
  const { night } = useDayNight();
  const litWindowMaterial = useMaterial({
    diffuse: "#5b3b18",
    emissive: "#ffc46b",
    emissiveIntensity: night * 4.5,
    opacity: night * 0.92,
    blendType: BLEND_NORMAL,
    depthWrite: false,
    gloss: 0.2,
    metalness: 0,
  });

  return (
    <>
      {REFERENCE_SKYLINE_TOWERS.flatMap((sourceTower, towerIndex) => {
        const x = sourceTower.x * PROCEDURAL_TOWER_POSITION_SCALE;
        const z = sourceTower.z * PROCEDURAL_TOWER_DEPTH_SCALE;
        const width = sourceTower.width * PROCEDURAL_TOWER_WIDTH_SCALE;
        const depth = sourceTower.depth * PROCEDURAL_TOWER_WIDTH_SCALE;
        const height = sourceTower.height * PROCEDURAL_TOWER_HEIGHT_SCALE;
        const columns = Math.max(3, Math.floor(width / 3.1));
        const rows = Math.max(5, Math.floor(height / 8));
        const windows: React.ReactNode[] = [];

        for (let row = 1; row < rows; row += 1) {
          for (let column = 0; column < columns; column += 1) {
            // Stable checker/noise pattern: roughly half the offices stay dark.
            if ((row * 7 + column * 11 + towerIndex * 5) % 5 < 2) continue;
            const xOffset = ((column + 0.5) / columns - 0.5) * width * 0.76;
            const y = SKYLINE_GROUND_Y + 3 + (row / rows) * height * 0.78;
            windows.push(
              <VisualBox
                key={`night-window-${towerIndex}-${row}-${column}`}
                position={[x + xOffset, y, z + depth / 2 + 0.09]}
                size={[Math.max(0.5, width / columns * 0.42), 1.25, 0.035]}
                material={litWindowMaterial}
              />,
            );
          }
        }
        return windows;
      })}
    </>
  );
}

export const RoomEnvironment = memo(function RoomEnvironment() {
  const { asset: plasterWallDiffuse } = useTexture("/assets/textures/painted_plaster_wall_diff_2k.jpg");
  const { asset: plasterWallNormal } = useTexture("/assets/textures/painted_plaster_wall_nor_gl_2k.jpg");
  const { asset: floorTileDiffuse } = useTexture("/assets/textures/wood_floor_diff_2k.jpg");
  const { asset: floorTileNormal } = useTexture("/assets/textures/wood_floor_nor_gl_2k.jpg");
  const { asset: ceilingGridDiffuse } = useTexture("/assets/textures/ceiling_grid.jpg");

  // Poly Haven "Painted Plaster Wall" (CC0). The restrained cool tint keeps
  // its wear visible without turning the trading hall into a bright exterior.
  const plasterWallMaterial = useMaterial({
    diffuseMap: textureOf(plasterWallDiffuse),
    normalMap: textureOf(plasterWallNormal),
    diffuseMapTiling: [8, 5],
    normalMapTiling: [8, 5],
    diffuse: "#74787c",
    gloss: 0.08,
    metalness: 0,
  });
  // A procedurally-generated coffered grid texture (no suitable suspended-
  // ceiling-tile texture was available from Poly Haven — see docs/assets.md)
  // standing in for the reference photo's grid-pattern drop ceiling; the real
  // fluorescent fixtures in Lighting.tsx supply the actual light, so this
  // texture only needs the recessed-panel grid, not baked-in glowing squares.
  // Tint likewise sampled from two ceiling patches in the reference photo
  // (~31,24,14) divided by this generated texture's own average RGB.
  const plasterCeilingMaterial = useMaterial({
    diffuseMap: textureOf(ceilingGridDiffuse),
    diffuseMapTiling: [8, 10],
    diffuse: "#343b43",
    gloss: 0.08,
    metalness: 0,
  });
  // Poly Haven "Wood Floor" — clean satin-finished office planks. The source
  // material is CC0 and uses the OpenGL normal-map orientation PlayCanvas
  // expects. Tiling follows its real-world 1.7m scan width closely.
  const floorMaterial = useMaterial({
    diffuseMap: textureOf(floorTileDiffuse),
    normalMap: textureOf(floorTileNormal),
    diffuseMapTiling: [19, 24],
    normalMapTiling: [19, 24],
    diffuse: "#766452",
    gloss: 0.32,
    metalness: 0,
  });

  const crateMaterial = useMaterial({ diffuse: "#353b42" });
  const chillZoneCarpetMaterial = useMaterial({
    diffuse: "#34383d",
    gloss: 0.04,
    metalness: 0,
  });

  const steelFrameMaterial = useMaterial({ diffuse: "#14161a", metalness: 0.7, gloss: 0.55 });
  const windowGlassMaterial = useWindowGlassMaterial();
  const tickerBorderMaterial = useMaterial({ diffuse: "#383d42", metalness: 0.72, gloss: 0.58 });
  const sillMaterial = useMaterial({ diffuse: "#2f3134", metalness: 0.5, gloss: 0.4 });

  return (
    <>
      {/* Floor */}
      <StaticBox position={[0, -0.25, 0]} size={[ROOM_WIDTH, 0.5, ROOM_LENGTH]} material={floorMaterial} />

      {/* Ceiling */}
      <StaticBox
        position={[0, ROOM_HEIGHT + 0.25, 0]}
        size={[ROOM_WIDTH, 0.5, ROOM_LENGTH]}
        material={plasterCeilingMaterial}
      />

      {/*
        Four walls, plain and single-toned — matching the reference photo's
        smooth, uniform-color columns (no wainscot/two-tone banding, unlike
        the earlier design.md pass). North (-Z) carries the windows/skyline;
        south (+Z) is the reception/entrance side.
      */}
      <StaticBox
        position={[0, ROOM_HEIGHT / 2, -ROOM_LENGTH / 2]}
        size={[ROOM_WIDTH, ROOM_HEIGHT, WALL_THICKNESS]}
        material={plasterWallMaterial}
        renderVisible={false}
      />
      <StaticBox
        position={[0, ROOM_HEIGHT / 2, ROOM_LENGTH / 2]}
        size={[ROOM_WIDTH, ROOM_HEIGHT, WALL_THICKNESS]}
        material={plasterWallMaterial}
      />
      <StaticBox
        position={[ROOM_WIDTH / 2, ROOM_HEIGHT / 2, 0]}
        size={[WALL_THICKNESS, ROOM_HEIGHT, ROOM_LENGTH]}
        material={plasterWallMaterial}
      />
      <StaticBox
        position={[-ROOM_WIDTH / 2, ROOM_HEIGHT / 2, 0]}
        size={[WALL_THICKNESS, ROOM_HEIGHT, ROOM_LENGTH]}
        material={plasterWallMaterial}
      />

      {/*
        Invisible boundary colliders, set slightly inside the visible walls.
        Kept as a distinct layer from the wall visuals per the brief's separate
        "invisible wall collision boxes" requirement — this is what stops players
        clipping through the perimeter if a future wall mesh has gaps or doorways.
      */}
      <StaticBox
        position={[0, ROOM_HEIGHT / 2, -ROOM_LENGTH / 2 + WALL_THICKNESS]}
        size={[ROOM_WIDTH, ROOM_HEIGHT, 0.1]}
        material={plasterWallMaterial}
        renderVisible={false}
      />
      <StaticBox
        position={[0, ROOM_HEIGHT / 2, ROOM_LENGTH / 2 - WALL_THICKNESS]}
        size={[ROOM_WIDTH, ROOM_HEIGHT, 0.1]}
        material={plasterWallMaterial}
        renderVisible={false}
      />
      <StaticBox
        position={[ROOM_WIDTH / 2 - WALL_THICKNESS, ROOM_HEIGHT / 2, 0]}
        size={[0.1, ROOM_HEIGHT, ROOM_LENGTH]}
        material={plasterWallMaterial}
        renderVisible={false}
      />
      <StaticBox
        position={[-ROOM_WIDTH / 2 + WALL_THICKNESS, ROOM_HEIGHT / 2, 0]}
        size={[0.1, ROOM_HEIGHT, ROOM_LENGTH]}
        material={plasterWallMaterial}
        renderVisible={false}
      />

      {/*
        North wall: a steel-framed 1980s office-tower curtain wall, full
        height (floor to near-ceiling) rather than split by a desk-height
        crossbar — layered foreground buildings in front of the daytime HDR
        skybox, divided visually into panes by the vertical mullions in front
        of it. The panes intentionally have no rendered glass surface so the
        exterior stays clearly visible.
        All purely decorative (no collision of their own — the wall behind
        already blocks that space).
      */}
      <CityView />

      {WINDOW_PANES.map(({ left, right }) => {
        const paneWidth = right - left - WINDOW_MULLION_WIDTH;
        return (
          <Entity
            key={`glass-${left}-${right}`}
            position={[(left + right) / 2, (WINDOW_GLASS_BOTTOM_Y + WINDOW_GLASS_TOP_Y) / 2, -ROOM_LENGTH / 2 + 0.62]}
            rotation={[90, 0, 0]}
            scale={[paneWidth, 1, WINDOW_GLASS_TOP_Y - WINDOW_GLASS_BOTTOM_Y]}
          >
            <Render type="plane" material={windowGlassMaterial} />
          </Entity>
        );
      })}

      {WINDOW_MULLION_X_POSITIONS.map((x) => (
        <VisualBox
          key={`mullion-${x}`}
          position={[x, (WINDOW_GLASS_BOTTOM_Y + WINDOW_GLASS_TOP_Y) / 2, -ROOM_LENGTH / 2 + 0.6]}
          size={[WINDOW_MULLION_WIDTH, WINDOW_GLASS_TOP_Y - WINDOW_GLASS_BOTTOM_Y, 0.22]}
          material={steelFrameMaterial}
        />
      ))}
      <VisualBox
        position={[0, WINDOW_GLASS_TOP_Y, -ROOM_LENGTH / 2 + 0.6]}
        size={[WINDOW_FRAME_SPAN_X, WINDOW_HEADER_THICKNESS, 0.24]}
        material={steelFrameMaterial}
      />
      {/* Simple window sill, protruding slightly further into the room than the frame. */}
      <VisualBox
        position={[0, WINDOW_GLASS_BOTTOM_Y, -ROOM_LENGTH / 2 + 0.7]}
        size={[WINDOW_FRAME_SPAN_X, WINDOW_SILL_THICKNESS, 0.2]}
        material={sillMaterial}
      />

      {/*
        Market ticker, hanging directly above the center of the trading pit —
        a simple matte-black steel box (see TickerDisplay) suspended on two
        black steel rods, per the brief's 80s-exchange spec (not a hanging
        HTML-overlay-backed panel). The ticker's own dot-matrix LED texture is
        the only strongly glowing element in this assembly.
      */}
      <VisualCylinder
        position={[TICKER_PANEL_POSITION[0] - TICKER_ROD_X_OFFSET, (TICKER_PANEL_POSITION[1] + ROOM_HEIGHT) / 2, TICKER_PANEL_POSITION[2]]}
        radius={0.03}
        height={ROOM_HEIGHT - TICKER_PANEL_POSITION[1]}
        material={steelFrameMaterial}
      />
      <VisualCylinder
        position={[TICKER_PANEL_POSITION[0] + TICKER_ROD_X_OFFSET, (TICKER_PANEL_POSITION[1] + ROOM_HEIGHT) / 2, TICKER_PANEL_POSITION[2]]}
        radius={0.03}
        height={ROOM_HEIGHT - TICKER_PANEL_POSITION[1]}
        material={steelFrameMaterial}
      />
      <TickerDisplay />
      {/* Raised steel bezel around both faces of the scrolling LED ticker. */}
      {[-1, 1].map((faceDirection) => {
        const faceZ = TICKER_PANEL_POSITION[2] + faceDirection * (TICKER_SIZE[2] / 2 + 0.035);
        return (
          <Fragment key={`ticker-border-${faceDirection}`}>
            {[-1, 1].map((verticalDirection) => (
              <VisualBox
                key={`ticker-border-horizontal-${faceDirection}-${verticalDirection}`}
                position={[
                  TICKER_PANEL_POSITION[0],
                  TICKER_PANEL_POSITION[1] + verticalDirection * TICKER_SIZE[1] / 2,
                  faceZ,
                ]}
                size={[TICKER_SIZE[0] + 0.16, 0.11, 0.09]}
                material={tickerBorderMaterial}
              />
            ))}
            {[-1, 1].map((horizontalDirection) => (
              <VisualBox
                key={`ticker-border-vertical-${faceDirection}-${horizontalDirection}`}
                position={[
                  TICKER_PANEL_POSITION[0] + horizontalDirection * TICKER_SIZE[0] / 2,
                  TICKER_PANEL_POSITION[1],
                  faceZ,
                ]}
                size={[0.11, TICKER_SIZE[1] + 0.16, 0.09]}
                material={tickerBorderMaterial}
              />
            ))}
          </Fragment>
        );
      })}

      <CoinScreenRows />

      {/* Low-pile carpet defining the west-side drawing/sticky-board chill zone. */}
      <VisualBox
        position={[-13.2, 0.025, -0.8]}
        size={[4.8, 0.05, 10.5]}
        material={chillZoneCarpetMaterial}
      />

      {/* Crates near the back corners */}
      <StaticBox position={[-9, 0.4, -11.5]} size={[0.8, 0.8, 0.8]} material={crateMaterial} />
      <StaticBox position={[9, 0.4, -11.5]} size={[0.8, 0.8, 0.8]} material={crateMaterial} />

    </>
  );
});
