import { useEffect, useState } from "react";
import { Entity } from "@playcanvas/react";
import { Render } from "@playcanvas/react/components";
import { useApp, useMaterial } from "@playcanvas/react/hooks";
import { BLEND_NORMAL, FILTER_LINEAR, StandardMaterial, Texture } from "playcanvas";
import { Prop } from "./Props";
import { CLOCK_BOARD_POSITION, CLOCK_BOARD_SIZE, CLOCK_LABELS, CLOCK_POSITIONS } from "./tradingFloorLayout";

/**
 * Real modeled analogue clock (poly.pizza, "Analog clock" by Poly by Google,
 * CC-BY 3.0 — see docs/assets.md / README Credits). Its face lies in the
 * model's own Y-Z plane (a disc, diameter ~27.65 local units, bottom edge at
 * local Y=0) with the thin case protruding along local X. This is a single
 * static mesh with no separate hand nodes, so the hands don't animate to the
 * real time in each city; it's a fixed display (a tradeoff of using a real 3D
 * prop instead of a procedural texture).
 */
const CLOCK_MODEL_PATH = "/assets/AnalogClock.glb";
/** Target diameter ~0.75m — enlarged from an earlier ~0.48m pass per explicit follow-up feedback ("make clock bigger"). */
const CLOCK_MODEL_SCALE = 0.75 / 27.651;
/** Recenters the model's off-center bounding box (X: -1.75..2.10, Y: 0..27.65, Z: symmetric) onto the entity's own origin. */
const CLOCK_MODEL_PIVOT_OFFSET: [number, number, number] = [-0.1766, -13.8255, 0];
/**
 * Local X (the case's thickness/normal axis) rotated onto world Z, so the
 * dial faces the room. Flipped 180° from an earlier `[0, 90, 0]` pass per
 * explicit feedback that the clock was facing the wrong way.
 */
const CLOCK_MODEL_ROTATION: [number, number, number] = [0, -90, 0];

/** Transparent label plaque with just the city name, mounted just below each clock model — enlarged per explicit follow-up feedback ("make city names bigger"). */
const LABEL_WIDTH = 0.9;
const LABEL_HEIGHT = 0.22;
const LABEL_Y_OFFSET = -0.55;
const LABEL_CANVAS_WIDTH = 360;
const LABEL_CANVAS_HEIGHT = 90;
const LABEL_FONT = "48px Arial, sans-serif";

interface CityLabelProps {
  position: [number, number, number];
  label: string;
}

/** A native asset with dynamic-capable content (unused here beyond a single draw, since the label text never changes) rather than an HTML overlay — same technique as TickerDisplay/the clock face used to use, just static. */
function CityLabel({ position, label }: CityLabelProps) {
  const app = useApp();
  const [material, setMaterial] = useState<StandardMaterial | null>(null);

  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = LABEL_CANVAS_WIDTH;
    canvas.height = LABEL_CANVAS_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = LABEL_FONT;
    ctx.fillStyle = "#141414";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, canvas.width / 2, canvas.height / 2);

    const texture = new Texture(app.graphicsDevice, {
      name: `clock-label-${label}`,
      width: canvas.width,
      height: canvas.height,
      mipmaps: false,
      minFilter: FILTER_LINEAR,
      magFilter: FILTER_LINEAR,
    });
    texture.setSource(canvas);

    const labelMaterial = new StandardMaterial();
    labelMaterial.diffuse.set(1, 1, 1);
    labelMaterial.diffuseMap = texture;
    labelMaterial.opacityMap = texture;
    labelMaterial.opacityMapChannel = "a";
    labelMaterial.blendType = BLEND_NORMAL;
    labelMaterial.alphaTest = 0.05;
    labelMaterial.emissiveMap = texture;
    labelMaterial.emissive.set(1, 1, 1);
    labelMaterial.emissiveIntensity = 0.35;
    labelMaterial.update();
    setMaterial(labelMaterial);

    return () => {
      labelMaterial.destroy();
      texture.destroy();
    };
  }, [app, label]);

  return (
    <Entity position={position} scale={[LABEL_WIDTH, LABEL_HEIGHT, 0.01]}>
      {material && <Render type="box" material={material} />}
    </Entity>
  );
}

/**
 * The full ticker-adjacent clock assembly as one self-contained component —
 * a white painted-metal board with the four clocks and their labels mounted
 * on it, per explicit request ("clocks should be in a component like on an
 * image", matching the reference image's single housing rather than four
 * independently-floating clocks).
 */
export function WorldClocksDisplay() {
  // A vertical board mounted directly under an overhead ceiling fixture gets
  // very little of that fixture's light (the fixture-to-face angle is
  // near-grazing) — a modest emissive floor keeps it from reading as black.
  const boardMaterial = useMaterial({
    diffuse: "#f2f2ee",
    gloss: 0.1,
    metalness: 0,
    emissive: "#f2f2ee",
    emissiveIntensity: 0.3,
  });

  return (
    <>
      <Entity position={CLOCK_BOARD_POSITION} scale={CLOCK_BOARD_SIZE}>
        <Render type="box" material={boardMaterial} />
      </Entity>

      {CLOCK_POSITIONS.map((position, index) => {
        const label = CLOCK_LABELS[index] ?? "";
        return (
          <Entity key={label}>
            <Prop
              src={CLOCK_MODEL_PATH}
              position={position}
              rotation={CLOCK_MODEL_ROTATION}
              scale={[CLOCK_MODEL_SCALE, CLOCK_MODEL_SCALE, CLOCK_MODEL_SCALE]}
              pivotOffset={CLOCK_MODEL_PIVOT_OFFSET}
            />
            <CityLabel position={[position[0], position[1] + LABEL_Y_OFFSET, position[2]]} label={label} />
          </Entity>
        );
      })}
    </>
  );
}
