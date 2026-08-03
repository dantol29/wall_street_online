import { Fragment, memo, useEffect, useRef } from "react";
import { Entity } from "@playcanvas/react";
import { Render } from "@playcanvas/react/components";
import { useApp, useMaterial, useModel, useTexture } from "@playcanvas/react/hooks";
import {
  BLEND_NORMAL,
  Mesh,
  MeshInstance,
  calculateNormals,
  type Asset,
  type Entity as PcEntity,
  type Texture,
} from "playcanvas";
import { Prop } from "./Props";
import { TickerDisplay } from "./TickerDisplay";
import { WorldClocksDisplay } from "./WorldClockDisplay";
import { StaticBox, VisualBox, StaticCylinder, VisualCylinder, VisualSphere } from "./primitives";
import { OfficeWing, OFFICE_WING_HALF_WIDTH } from "./OfficeWing";
import type { OfficeSlotContent } from "./OfficeContentDisplay";
import { ROOM_WIDTH, ROOM_LENGTH, ROOM_HEIGHT, WALL_THICKNESS } from "./roomConstants";
import {
  TICKER_PANEL_POSITION,
  TICKER_ROD_X_OFFSET,
  TICKER_SIZE,
} from "./tradingFloorLayout";
import { useDayNight } from "./DayNightContext";
import { deskMonitorRotationJitterDegrees } from "./deskMonitor";

/** Office Pack trading desk, authored at 1.82m × 0.92m × 0.85m. */
const DESK_MODEL_SCALE = 0.95;
const DESK_MODEL_HEIGHT = 0.92 * DESK_MODEL_SCALE;
const DESK_PIVOT_OFFSET: [number, number, number] = [0, 0, 0.03];
/** Poly by Google widescreen monitor, normalized to roughly 95cm wide. */
const DESK_MONITOR_SCALE = 0.011;
const KEYBOARD_SCALE: [number, number, number] = [0.006, 0.006, 0.006];
const KEYBOARD_PIVOT: [number, number, number] = [0, 0, -8.805];
const OFFICE_CHAIR_SCALE: [number, number, number] = [0.8, 0.8, 0.8];
const OFFICE_CHAIR_BASE_Y = 0.26;
/** Coffee mug raw mesh ~0.68m × 0.96m × 0.68m; scaled down to a real ~9cm-tall mug. */
const MUG_MODEL_SCALE: [number, number, number] = [0.095, 0.095, 0.095];
/** Recenters the mug's off-center bounding box (origin sits near its rim, not its base/center) onto the entity's own origin. */
const MUG_PIVOT_OFFSET: [number, number, number] = [0.026, 0.658, 0];
/** A small stack of papers/notes; raw mesh ~0.33m × 0.14m × 0.5m, scaled to a modest desk-clutter size. */
const PAPER_STACK_SCALE: [number, number, number] = [0.42, 0.42, 0.42];
/** Recenters the paper stack horizontally and drops its base onto the desk surface. */
const PAPER_STACK_PIVOT_OFFSET: [number, number, number] = [0.011, 0.054, 0.03];

/**
 * Small deterministic "randomness" seeded per desk index — stable across
 * re-renders (unlike `Math.random()`), so each of the 16 repeated desks gets
 * a slightly different monitor angle/prop placement/chair angle without the
 * scene jittering every frame. Per the brief: "each desk should appear
 * slightly different... this prevents the trading floor from looking
 * artificially uniform."
 */
function pseudoRandom(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

/** Maps a pseudoRandom() [0,1) value to a signed [-1, 1) range. */
function signedJitter(seed: number): number {
  return pseudoRandom(seed) * 2 - 1;
}

/** `Asset.resource` is typed as a generic `object` since its shape depends on asset type; narrow it here. */
function textureOf(asset: Asset | null): Texture | undefined {
  return (asset?.resource as Texture | undefined) ?? undefined;
}

interface DeskMonitorProps {
  position: [number, number, number];
  rotationY: number;
  screenMaterial: ReturnType<typeof useMaterial>;
  scaleMultiplier?: number;
}

/** UV-mapped surface fitted exactly over the monitor's modeled, angled screen. */
function MonitorScreenSurface({ material }: { material: ReturnType<typeof useMaterial> }) {
  const app = useApp();
  const entityRef = useRef<PcEntity | null>(null);

  useEffect(() => {
    const entity = entityRef.current;
    if (!entity) return;

    // Exact screen corners read from the downloaded GLB. A tiny offset along
    // the screen-facing -X axis prevents z-fighting with the modeled panel.
    const positions = [
      -16.166, 17.417, 40.102,
      -16.166, 17.417, -40.102,
      -8.293, 65.258, 40.102,
      -8.293, 65.258, -40.102,
    ];
    // The source site's captured texture is mirrored vertically and
    // horizontally relative to PlayCanvas' mesh UV convention.
    const uvs = [1, 1, 0, 1, 1, 0, 0, 0];
    const indices = [0, 2, 1, 1, 2, 3];

    const mesh = new Mesh(app.graphicsDevice);
    mesh.setPositions(positions);
    mesh.setNormals(calculateNormals(positions, indices));
    mesh.setUvs(0, uvs);
    mesh.setIndices(indices);
    mesh.update();

    const meshInstance = new MeshInstance(mesh, material, entity);
    entity.addComponent("render", { meshInstances: [meshInstance] });

    return () => {
      if (entity.render) entity.removeComponent("render");
      mesh.destroy();
    };
  }, [app, material]);

  return <Entity ref={entityRef} />;
}

/** Large Poly Pizza monitor whose panel carries the ambient HyperLiquid view. */
function DeskMonitor({
  position,
  rotationY,
  screenMaterial,
  scaleMultiplier = 1,
}: DeskMonitorProps) {
  const { asset } = useModel("/assets/office/monitor-poly-google.glb");
  const scale = DESK_MONITOR_SCALE * scaleMultiplier;
  return (
    <Entity position={position} rotation={[0, rotationY, 0]} scale={[scale, scale, scale]}>
      {/* The source model faces -X; normalize it so every placement faces local -Z. */}
      <Entity rotation={[0, -90, 0]}>
        {asset && <Render type="asset" asset={asset} />}
        <MonitorScreenSurface material={screenMaterial} />
      </Entity>
    </Entity>
  );
}

/**
 * Room shell: width 20m (x: -10..10), length 25m (z: -12.5..12.5), height
 * 7.5m (y: 0..7.5) — lowered back down from an earlier, much taller 12m pass
 * per explicit feedback, so the ticker/clock fascia (mounted just under the
 * ceiling) sits close under it rather than dangling in a much taller void.
 * Footprint otherwise kept as-is rather than `design.md`'s "recommended"
 * 24x18x5, since `WORLD_BOUNDS` in `packages/shared` (used for server-side
 * movement validation) is built from this width/length and changing it
 * ripples into the server and its tests. The one deliberate exception is
 * `WORLD_BOUNDS.maxZ`, extended 12m south to fit the office wing (see
 * OfficeWing.tsx) — everything else about this footprint is unchanged.
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
 *   - Center (roughly x: -4..4, z: -5..5): an ~8x10m open area kept clear for
 *     movement/gathering, with a small raised, stepped trading-pit platform
 *     and a cluster of CRT terminals at its center. A ticker strip and a
 *     four frameless world clocks hang just under the ceiling above it.
 *   - Four 2x2 "desk banks" (16 desks total) occupy the space between the
 *     windows and reception, flanking the pit on both sides.
 *   - South wall now has a doorway cut into it (see OFFICE_WING_HALF_WIDTH)
 *     leading into a small office wing — see OfficeWing.tsx.
 */

interface DeskBankProps {
  centerX: number;
  centerZ: number;
  facesPositiveX: boolean;
  bankIndex: number;
  deskMaterial: ReturnType<typeof useMaterial>;
  terminalScreenMaterial: ReturnType<typeof useMaterial>;
}

/** Spacing between adjacent desks within a bank — wide enough that their (axis-aligned) collision boxes never overlap regardless of facing. */
const DESK_BANK_SPACING = 2.2;

/**
 * A 2x2 cluster of 4 trading desks, all facing the same direction (into the
 * room, away from whichever side wall the bank is against). The desk surfaces
 * intentionally contain only a Poly Pizza CRT and keyboard; chairs remain
 * behind the desks for seating. Small deterministic angle/position differences
 * keep the repeated workstations from looking artificially identical.
 */
function DeskBank({ centerX, centerZ, facesPositiveX, bankIndex, deskMaterial, terminalScreenMaterial }: DeskBankProps) {
  // Rotate each complete workstation toward the room center.
  const rotationY = facesPositiveX ? -90 : 90;
  const deskFacingSign = facesPositiveX ? 1 : -1;
  const half = DESK_BANK_SPACING / 2;
  const offsets: Array<[number, number]> = [
    [-half, -half],
    [half, -half],
    [-half, half],
    [half, half],
  ];
  // The chair sits on the wall side of the desk (away from the room center,
  // where the trader would sit facing in); the desk's own footprint is ~0.8m
  // deep, so this clears it without overlapping. The monitor/screen sit
  // toward that same side (slightly left of desk center, per the brief).
  const chairSideSign = facesPositiveX ? -1 : 1;
  const monitorRotationY = facesPositiveX ? 90 : -90;

  return (
    <>
      {offsets.map(([dx, dz], index) => {
        const x = centerX + dx;
        const z = centerZ + dz;
        // Stable per-desk seed (0-15 across the 4 banks) driving every
        // jittered offset below — same seed always produces the same
        // jitter, so this doesn't shift between renders.
        const seed = bankIndex * 4 + index;
        const monitorRotationJitter = deskMonitorRotationJitterDegrees(seed);
        const keyboardJitterX = signedJitter(seed * 7 + 2) * 0.025;
        const keyboardJitterZ = signedJitter(seed * 7 + 3) * 0.025;
        const chairAngleJitter = signedJitter(seed * 7 + 7) * 10;
        const mugAngleJitter = signedJitter(seed * 7 + 8) * 30;
        const paperAngleJitter = signedJitter(seed * 7 + 9) * 15;

        return (
          <Fragment key={index}>
            <StaticBox position={[x, DESK_MODEL_HEIGHT / 2, z]} size={[1.75, DESK_MODEL_HEIGHT, 0.82]} material={deskMaterial} renderVisible={false} />
            <Prop
              src="/assets/office/trading-desk.glb"
              position={[x, 0, z]}
              rotation={[0, rotationY, 0]}
              scale={[DESK_MODEL_SCALE, DESK_MODEL_SCALE, DESK_MODEL_SCALE]}
              pivotOffset={DESK_PIVOT_OFFSET}
            />
            <DeskMonitor
              position={[x + deskFacingSign * 0.18, DESK_MODEL_HEIGHT, z]}
              rotationY={monitorRotationY + monitorRotationJitter}
              screenMaterial={terminalScreenMaterial}
            />
            <Prop
              src="/assets/office/keyboard.glb"
              position={[x - deskFacingSign * 0.16 + keyboardJitterX, DESK_MODEL_HEIGHT + 0.015, z + keyboardJitterZ]}
              rotation={[0, rotationY, 0]}
              scale={KEYBOARD_SCALE}
              pivotOffset={KEYBOARD_PIVOT}
            />
            <Prop
              src="/assets/office/office-chair.glb"
              position={[x + chairSideSign * 0.65, OFFICE_CHAIR_BASE_Y, z]}
              rotation={[0, (facesPositiveX ? 90 : -90) + chairAngleJitter, 0]}
              scale={OFFICE_CHAIR_SCALE}
            />
            {/* Mug shares the monitor's side of the desk; papers share the keyboard's but pushed well back in Z, clear of the keyboard itself. */}
            <Prop
              src="/assets/office/coffee-mug.glb"
              position={[x + deskFacingSign * 0.15, DESK_MODEL_HEIGHT, z + 0.32]}
              rotation={[0, rotationY + mugAngleJitter, 0]}
              scale={MUG_MODEL_SCALE}
              pivotOffset={MUG_PIVOT_OFFSET}
            />
            <Prop
              src="/assets/office/paper-stacks.glb"
              position={[x - deskFacingSign * 0.1, DESK_MODEL_HEIGHT, z - 0.42]}
              rotation={[0, rotationY + paperAngleJitter, 0]}
              scale={PAPER_STACK_SCALE}
              pivotOffset={PAPER_STACK_PIVOT_OFFSET}
            />
          </Fragment>
        );
      })}
    </>
  );
}

const DESK_BANKS: Array<{ centerX: number; centerZ: number; facesPositiveX: boolean }> = [
  { centerX: -8, centerZ: -7, facesPositiveX: true },
  { centerX: -8, centerZ: 7, facesPositiveX: true },
  { centerX: 8, centerZ: -7, facesPositiveX: false },
  { centerX: 8, centerZ: 7, facesPositiveX: false },
];

/** Filing cabinets along the side walls between the desk banks and reception ("peripheral office clutter"). */
const FILING_CABINET_POSITIONS: Array<[number, number, number]> = [
  [-9, 0.65, 8.5],
  [-9, 0.65, 10],
  [9, 0.65, 8.5],
  [9, 0.65, 10],
];

/**
 * North wall "steel-framed office tower curtain wall": black steel frame
 * (thick vertical mullions, a header, a sill) with one continuous, full-height
 * glazed opening behind it — floor to near-ceiling, not split by a desk-height
 * crossbar/spandrel — showing a daytime skyline through the open panes rather
 * than an opaque backdrop card.
 */
const WINDOW_GLASS_BOTTOM_Y = 0.15;
const WINDOW_GLASS_TOP_Y = 7.25;
/** 8 mullions spanning the full window height, spaced across ~80% of the 20m wall width. */
const WINDOW_MULLION_X_POSITIONS = [-9.05, -6.5, -3.9, -1.3, 1.3, 3.9, 6.5, 9.05];
const WINDOW_MULLION_WIDTH = 0.22;
const WINDOW_HEADER_THICKNESS = 0.16;
const WINDOW_SILL_THICKNESS = 0.1;
const WINDOW_FRAME_SPAN_X = 18.3; // header/sill length, covering the full mullion span

/** Exterior grade sits around 18 storeys below the trading floor. */
const SKYLINE_GROUND_Y = -55;

/** Imported Sketchfab skyline asset, placed in front of the handmade tower row. */
const SKYSCRAPER_SKYLINE_POSITION: [number, number, number] = [0, SKYLINE_GROUND_Y, -48];
const SKYSCRAPER_SKYLINE_SCALE: [number, number, number] = [5.2, 10, 5.2];
const SKYSCRAPER_SKYLINE_PIVOT: [number, number, number] = [5.8, 0, 0];
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

function LowPolySkylineTower({ tower: sourceTower }: { tower: SkylineTowerSpec }) {
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
function SkylineNightWindows() {
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

interface RoomEnvironmentProps {
  /** Content for currently-visible office slots, keyed by `OfficeSlot.id` — see OfficeWing.tsx. Populated by App.tsx once a player is near enough to have fetched it; defaults to all-vacant. */
  officeSlotContentById?: Record<string, OfficeSlotContent>;
}

export const RoomEnvironment = memo(function RoomEnvironment({ officeSlotContentById }: RoomEnvironmentProps = {}) {
  const { asset: concreteWallDiffuse } = useTexture("/assets/textures/concrete_wall_diff_2k.jpg");
  const { asset: concreteWallNormal } = useTexture("/assets/textures/concrete_wall_nor_2k.jpg");
  const { asset: floorTileDiffuse } = useTexture("/assets/textures/granite_tile_diff_2k.jpg");
  const { asset: floorTileNormal } = useTexture("/assets/textures/granite_tile_nor_2k.jpg");
  const { asset: ceilingGridDiffuse } = useTexture("/assets/textures/ceiling_grid.jpg");
  const { asset: hyperliquidScreenDiffuse } = useTexture("/assets/textures/hyperliquid-screen.png");

  // Wall material: Poly Haven "Concrete Wall 009" (CC0), smooth cast concrete
  // with formwork seams and tie-bolt marks, tinted to the user's explicitly
  // specified #372f22 (a dark warm brown).
  const plasterWallMaterial = useMaterial({
    diffuseMap: textureOf(concreteWallDiffuse),
    normalMap: textureOf(concreteWallNormal),
    diffuseMapTiling: [12, 2],
    normalMapTiling: [12, 2],
    diffuse: "#372f22",
    gloss: 0.15,
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
    diffuseMapTiling: [5, 6],
    diffuse: "#726444",
    gloss: 0.12,
    metalness: 0,
  });
  // Large-format floor tile (Poly Haven "Granite Tile") — dark blue-grey
  // granite with neat grout lines, already close to the target color on its
  // own, so only a light near-neutral lift is applied (a heavier tint like
  // the earlier "Grey Tiles" texture needed would just over-darken this one).
  const floorMaterial = useMaterial({
    diffuseMap: textureOf(floorTileDiffuse),
    normalMap: textureOf(floorTileNormal),
    diffuseMapTiling: [10, 12],
    normalMapTiling: [10, 12],
    diffuse: "#dce0e6",
    gloss: 0.4,
    metalness: 0,
  });

  const deskMaterial = useMaterial({ diffuse: "#4a3a2a" });
  const terminalScreenMaterial = useMaterial({
    diffuseMap: textureOf(hyperliquidScreenDiffuse),
    emissiveMap: textureOf(hyperliquidScreenDiffuse),
    diffuse: "#b7c5c2",
    emissive: "#263c39",
    emissiveIntensity: 0.48,
    gloss: 0.72,
    metalness: 0,
  });
  const crateMaterial = useMaterial({ diffuse: "#6b5a3a" });
  const pipeMaterial = useMaterial({ diffuse: "#5a3a30", metalness: 0.5, gloss: 0.4 });

  // Central trading-pit platform + terminal cluster.
  const pitStepMaterial = useMaterial({ diffuse: "#4a4d52", metalness: 0.3, gloss: 0.4 });
  const pitTopMaterial = useMaterial({ diffuse: "#5c6066", metalness: 0.3, gloss: 0.45 });
  const terminalDeskMaterial = useMaterial({ diffuse: "#3a3630" });

  // The window is an open visual layer: the daytime HDR skybox and low-poly
  // foreground buildings remain fully visible behind the steel frame. Keeping
  // the glass surface out of the render avoids alpha sorting making the panes
  // look like opaque white cards.
  const steelFrameMaterial = useMaterial({ diffuse: "#14161a", metalness: 0.7, gloss: 0.55 });
  const tickerBorderMaterial = useMaterial({ diffuse: "#383d42", metalness: 0.72, gloss: 0.58 });
  const sillMaterial = useMaterial({ diffuse: "#2f3134", metalness: 0.5, gloss: 0.4 });
  const skylineGroundMaterial = useMaterial({ diffuse: "#25292c", gloss: 0.08, metalness: 0.04 });

  // Small clutter/furniture.
  const plantPotMaterial = useMaterial({ diffuse: "#8a5a3c" });
  const foliageMaterial = useMaterial({ diffuse: "#2f4a2f" });

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
      {/*
        South wall has a doorway cut into it (width = 2 * OFFICE_WING_HALF_WIDTH,
        centered at x=0) leading into the office wing — see OfficeWing.tsx,
        mounted below. Two stub segments flank the opening instead of one
        full-width wall.
      */}
      <StaticBox
        position={[-(ROOM_WIDTH / 2 + OFFICE_WING_HALF_WIDTH) / 2, ROOM_HEIGHT / 2, ROOM_LENGTH / 2]}
        size={[ROOM_WIDTH / 2 - OFFICE_WING_HALF_WIDTH, ROOM_HEIGHT, WALL_THICKNESS]}
        material={plasterWallMaterial}
      />
      <StaticBox
        position={[(ROOM_WIDTH / 2 + OFFICE_WING_HALF_WIDTH) / 2, ROOM_HEIGHT / 2, ROOM_LENGTH / 2]}
        size={[ROOM_WIDTH / 2 - OFFICE_WING_HALF_WIDTH, ROOM_HEIGHT, WALL_THICKNESS]}
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
        position={[-(ROOM_WIDTH / 2 + OFFICE_WING_HALF_WIDTH) / 2, ROOM_HEIGHT / 2, ROOM_LENGTH / 2 - WALL_THICKNESS]}
        size={[ROOM_WIDTH / 2 - OFFICE_WING_HALF_WIDTH, ROOM_HEIGHT, 0.1]}
        material={plasterWallMaterial}
        renderVisible={false}
      />
      <StaticBox
        position={[(ROOM_WIDTH / 2 + OFFICE_WING_HALF_WIDTH) / 2, ROOM_HEIGHT / 2, ROOM_LENGTH / 2 - WALL_THICKNESS]}
        size={[ROOM_WIDTH / 2 - OFFICE_WING_HALF_WIDTH, ROOM_HEIGHT, 0.1]}
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
      {/* Exterior city base: its top aligns with the towers below the interior floor. */}
      <VisualBox
        position={[0, SKYLINE_GROUND_Y - 0.25, -62]}
        size={[140, 0.5, 110]}
        material={skylineGroundMaterial}
      />

      {/* Downloaded Sketchfab set forms the foreground skyline layer. */}
      <Prop
        src="/assets/low-poly-skyscrapers.glb"
        position={SKYSCRAPER_SKYLINE_POSITION}
        scale={SKYSCRAPER_SKYLINE_SCALE}
        pivotOffset={SKYSCRAPER_SKYLINE_PIVOT}
      />

      {/* Handmade Manhattan towers form the deeper skyline layer. */}
      {REFERENCE_SKYLINE_TOWERS.map((tower) => (
        <LowPolySkylineTower key={`${tower.x}-${tower.z}`} tower={tower} />
      ))}
      <SkylineNightWindows />

      {WINDOW_MULLION_X_POSITIONS.map((x) => (
        <VisualBox
          key={`mullion-${x}`}
          position={[x, (WINDOW_GLASS_BOTTOM_Y + WINDOW_GLASS_TOP_Y) / 2, -11.9]}
          size={[WINDOW_MULLION_WIDTH, WINDOW_GLASS_TOP_Y - WINDOW_GLASS_BOTTOM_Y, 0.22]}
          material={steelFrameMaterial}
        />
      ))}
      <VisualBox
        position={[0, WINDOW_GLASS_TOP_Y, -11.9]}
        size={[WINDOW_FRAME_SPAN_X, WINDOW_HEADER_THICKNESS, 0.24]}
        material={steelFrameMaterial}
      />
      {/* Simple window sill, protruding slightly further into the room than the frame. */}
      <VisualBox
        position={[0, WINDOW_GLASS_BOTTOM_Y, -11.8]}
        size={[WINDOW_FRAME_SPAN_X, WINDOW_SILL_THICKNESS, 0.2]}
        material={sillMaterial}
      />

      {/*
        A standing desk facing the windows, per explicit request — rotation
        [0,0,0] is the trading-desk model's neutral facing direction (matching
        the reception desk, which uses the same rotation), so this desk faces
        north into the glass rather than south into the room like the desk
        banks: someone at it would be looking out over the skyline, not at
        another player. No chair, since it's a standing desk.
      */}
      <StaticBox position={[0, DESK_MODEL_HEIGHT / 2, -10.3]} size={[1.75, DESK_MODEL_HEIGHT, 0.82]} material={deskMaterial} renderVisible={false} />
      <Prop
        src="/assets/office/trading-desk.glb"
        position={[0, 0, -10.3]}
        rotation={[0, 0, 0]}
        scale={[DESK_MODEL_SCALE, DESK_MODEL_SCALE, DESK_MODEL_SCALE]}
        pivotOffset={DESK_PIVOT_OFFSET}
      />
      <DeskMonitor
        position={[0, DESK_MODEL_HEIGHT, -10.45]}
        rotationY={180}
        screenMaterial={terminalScreenMaterial}
      />
      <Prop
        src="/assets/office/keyboard.glb"
        position={[0, DESK_MODEL_HEIGHT + 0.015, -10]}
        rotation={[0, 0, 0]}
        scale={KEYBOARD_SCALE}
        pivotOffset={KEYBOARD_PIVOT}
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

      {/*
        Four frameless world clocks directly beneath the ticker. Each circular
        face, moving hands, and city label is drawn onto a transparent live
        canvas texture, with no shared rectangular backing panel.
      */}
      <WorldClocksDisplay />

      {/*
        16 trading desks in four 2x2 banks, flanking the central pit on the
        west (x=-8) and east (x=8) sides, between the windows and reception.
      */}
      {DESK_BANKS.map((bank, index) => (
        <DeskBank
          key={`desk-bank-${index}`}
          centerX={bank.centerX}
          centerZ={bank.centerZ}
          facesPositiveX={bank.facesPositiveX}
          bankIndex={index}
          deskMaterial={deskMaterial}
          terminalScreenMaterial={terminalScreenMaterial}
        />
      ))}

      {/*
        Central trading pit: a raised, stepped circular platform (~5m at its
        base) with a small cluster of CRT terminals at its center. Kept modest
        relative to the ~8x10m open area around it, so the room's middle stays
        clear for players to gather ("space for players to gather around it").
        Approximated with 4 terminal pedestals rather than the spec's 6-8
        "trader positions" — the platform's ~2.4m top isn't wide enough to fit
        that many desks at a legible scale, so the extra trader positions are
        represented by the open floor around the platform where real players
        stand, not by more furniture.
      */}
      <StaticCylinder position={[0, 0.075, 0]} rotation={[0, 0, 0]} radius={2.5} height={0.15} material={pitStepMaterial} />
      <StaticCylinder position={[0, 0.225, 0]} rotation={[0, 0, 0]} radius={1.8} height={0.15} material={pitStepMaterial} />
      <StaticCylinder position={[0, 0.375, 0]} rotation={[0, 0, 0]} radius={1.2} height={0.15} material={pitTopMaterial} />
      {[
        [-0.6, -0.6],
        [0.6, -0.6],
        [-0.6, 0.6],
        [0.6, 0.6],
      ].map(([dx, dz], index) => (
        <Fragment key={`pit-terminal-${index}`}>
          <StaticBox
            position={[dx, 0.65, dz]}
            size={[0.55, 0.5, 0.5]}
            material={terminalDeskMaterial}
            renderVisible={true}
          />
          <DeskMonitor
            position={[dx, 0.9, dz]}
            rotationY={index % 2 === 0 ? 0 : 180}
            screenMaterial={terminalScreenMaterial}
            scaleMultiplier={0.65}
          />
        </Fragment>
      ))}

      {/* First token-launch booth prototype, facing inward toward the IPO floor. */}

      {/* Filing cabinets along the side walls between the desk banks and reception — "peripheral office clutter". */}
      {FILING_CABINET_POSITIONS.map((position, index) => (
        <Fragment key={`cabinet-${index}`}>
          <StaticBox position={position} size={[0.7, 1.3, 0.6]} material={deskMaterial} renderVisible={false} />
          <Prop
            src="/assets/office/file-cabinet.glb"
            position={[position[0], 0, position[2]]}
            rotation={[0, position[0] < 0 ? 90 : -90, 0]}
            scale={[0.84, 0.84, 0.84]}
            pivotOffset={[-0.09, 0.02, 0]}
          />
        </Fragment>
      ))}

      {/* Reception desk near the south entrance, close to the spawn points. */}
      <StaticBox
        position={[0, DESK_MODEL_HEIGHT / 2, 10.5]}
        size={[1.75, DESK_MODEL_HEIGHT, 0.82]}
        material={deskMaterial}
        renderVisible={false}
      />
      <Prop
        src="/assets/office/trading-desk.glb"
        position={[0, 0, 10.5]}
        rotation={[0, 0, 0]}
        scale={[DESK_MODEL_SCALE, DESK_MODEL_SCALE, DESK_MODEL_SCALE]}
        pivotOffset={DESK_PIVOT_OFFSET}
      />
      {/* Office-pack coat rack near reception. */}
      <StaticCylinder
        position={[2.5, 0.9, 11]}
        rotation={[0, 0, 0]}
        radius={0.2}
        height={1.8}
        material={deskMaterial}
        renderVisible={false}
      />
      <Prop src="/assets/office/coat-rack.glb" position={[2.5, 0, 11]} scale={[0.18, 0.18, 0.18]} pivotOffset={[0, 0.01, 0]} />

      {/* Printer table and water cooler opposite the coat rack. */}
      <StaticBox position={[-2.5, 0.4, 11]} size={[0.8, 0.8, 0.5]} material={crateMaterial} />
      <Prop src="/assets/office/printer.glb" position={[-2.5, 0.8, 11]} scale={[2, 2, 2]} />
      <StaticBox position={[-3.5, 0.9, 11]} size={[0.45, 1.8, 0.55]} material={deskMaterial} renderVisible={false} />
      <Prop
        src="/assets/office/water-cooler.glb"
        position={[-3.5, 0, 11]}
        scale={[0.45, 0.45, 0.45]}
        pivotOffset={[-0.285, 0, 0.015]}
      />

      {/* Office-pack waste bins */}
      {[-9, 9].map((x) => (
        <Fragment key={`waste-bin-${x}`}>
          <StaticCylinder
            position={[x, 0.3, -10]}
            rotation={[0, 0, 0]}
            radius={0.2}
            height={0.6}
            material={deskMaterial}
            renderVisible={false}
          />
          <Prop src="/assets/office/trash-bin.glb" position={[x, 0, -10]} scale={[2, 2, 2]} />
        </Fragment>
      ))}

      {/* Low plants flanking the entrance */}
      <VisualCylinder position={[-9, 0.35, 11]} radius={0.22} height={0.7} material={plantPotMaterial} />
      <VisualSphere position={[-9, 0.95, 11]} radius={0.4} material={foliageMaterial} />
      <VisualCylinder position={[9, 0.35, 11]} radius={0.22} height={0.7} material={plantPotMaterial} />
      <VisualSphere position={[9, 0.95, 11]} radius={0.4} material={foliageMaterial} />

      {/* Crates near the back corners */}
      <StaticBox position={[-9, 0.4, -11.5]} size={[0.8, 0.8, 0.8]} material={crateMaterial} />
      <StaticBox position={[9, 0.4, -11.5]} size={[0.8, 0.8, 0.8]} material={crateMaterial} />

      {/* Pipes along the side walls, between the desk banks */}
      <StaticCylinder
        position={[-9.5, 0.3, 0]}
        rotation={[0, 0, 90]}
        radius={0.15}
        height={3}
        material={pipeMaterial}
      />
      <StaticCylinder position={[9.5, 0.3, 0]} rotation={[0, 0, 90]} radius={0.15} height={3} material={pipeMaterial} />

      {/* Office wing: a small corridor of personal trader offices through the doorway cut into the south wall above. */}
      <OfficeWing
        floorMaterial={floorMaterial}
        ceilingMaterial={plasterCeilingMaterial}
        wallMaterial={plasterWallMaterial}
        deskMaterial={deskMaterial}
        slotContentById={officeSlotContentById}
      />
    </>
  );
});
