import { useEffect, useRef, useState } from "react";
import { Entity } from "@playcanvas/react";
import { Render } from "@playcanvas/react/components";
import { useApp, useAppEvent } from "@playcanvas/react/hooks";
import { BLEND_NORMAL, StandardMaterial, Texture, Vec3, type Entity as PcEntity } from "playcanvas";
import { NAME_LABEL_MAX_DISTANCE_METERS, VOICE_MAX_DISTANCE_METERS } from "@multiplayer/shared";
import { getVisualTransform } from "../multiplayer/interpolation";
import type { RemotePlayerRecord } from "./remotePlayerRecord";

const UPDATE_INTERVAL_MS = 1000 / 12;
const LOCAL_CAMERA_ENTITY_NAME = "local-camera";
/** Matches the height the old DOM name label used to float at above a player's capsule-center origin. */
const LABEL_HEIGHT_ABOVE_ORIGIN = 1.0;
const LABEL_WIDTH = 0.64;
const LABEL_HEIGHT = 0.28;
const CANVAS_WIDTH = 384;
const CANVAS_HEIGHT = 168;
/**
 * Confirmed mirrored at 0° once actually seen in a browser (text read
 * backwards) — the box's opposite face was the one facing the camera, so
 * this flips which face gets the texture's "front" orientation.
 */
const LABEL_YAW_OFFSET_DEGREES = 180;

interface PlayerLabelBillboardProps {
  sessionId: string;
  recordsRef: React.RefObject<Map<string, RemotePlayerRecord>>;
  speaking: boolean;
}

function formatPnl(pnlUsd: number): string {
  const sign = pnlUsd < 0 ? "-" : "+";
  return `${sign}$${Math.abs(pnlUsd).toFixed(2)}`;
}

function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

/** Same look as the DOM `.name-label` pill this replaces — name, optional colored PnL line below it, speaking highlight — just baked into a texture instead of an HTML element. */
function drawLabel(ctx: CanvasRenderingContext2D, displayName: string, pnlUsd: number | null, speaking: boolean): void {
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const hasPnl = pnlUsd !== null;
  const pillHeight = hasPnl ? 132 : 84;
  const pillY = (CANVAS_HEIGHT - pillHeight) / 2;
  roundedRectPath(ctx, 8, pillY, CANVAS_WIDTH - 16, pillHeight, 18);
  ctx.fillStyle = "rgba(8, 10, 8, 0.72)";
  ctx.fill();
  if (speaking) {
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(101, 216, 139, 0.85)";
    ctx.stroke();
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = speaking ? "#dfffe7" : "#ffffff";
  ctx.font = "600 46px Arial, sans-serif";
  ctx.fillText(displayName, CANVAS_WIDTH / 2, hasPnl ? pillY + 46 : CANVAS_HEIGHT / 2);

  if (hasPnl) {
    ctx.font = "700 40px 'Courier New', monospace";
    ctx.fillStyle = pnlUsd >= 0 ? "#65d88b" : "#ff6b6b";
    ctx.fillText(formatPnl(pnlUsd), CANVAS_WIDTH / 2, pillY + 96);
  }
}

/**
 * A real in-world billboard (canvas-as-texture on a thin box, same technique
 * as WorldClockDisplay's CityLabel/the ticker/the sticky wall) rather than an
 * HTML element positioned via screen-space projection — it lives in the
 * scene, at the player's actual position, and always turns to face the
 * local camera (yaw only, so it never tips up/down). Redrawn only when its
 * visible content (name/PnL/speaking) actually changes, not every frame.
 */
export function PlayerLabelBillboard({ sessionId, recordsRef, speaking }: PlayerLabelBillboardProps) {
  const app = useApp();
  const entityRef = useRef<PcEntity | null>(null);
  const visualRef = useRef<PcEntity | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textureRef = useRef<Texture | null>(null);
  const [material, setMaterial] = useState<StandardMaterial | null>(null);
  const lastDrawnKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    canvasRef.current = canvas;

    const texture = new Texture(app.graphicsDevice, {
      name: `player-label-${sessionId}`,
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      mipmaps: false,
    });
    texture.setSource(canvas);
    textureRef.current = texture;

    const labelMaterial = new StandardMaterial();
    labelMaterial.diffuse.set(1, 1, 1);
    labelMaterial.diffuseMap = texture;
    labelMaterial.opacityMap = texture;
    labelMaterial.opacityMapChannel = "a";
    labelMaterial.blendType = BLEND_NORMAL;
    labelMaterial.alphaTest = 0.02;
    labelMaterial.depthWrite = false;
    labelMaterial.emissiveMap = texture;
    labelMaterial.emissive.set(1, 1, 1);
    labelMaterial.emissiveIntensity = 0.6;
    // Default single-sided culling (front face only) — the yaw fix above is
    // confirmed correct now, so the back face no longer needs to render as a
    // safety net; leaving it on made the mirrored back face visible through
    // the front one (the box has real, if tiny, thickness) as a "ghost"
    // second label sitting just behind the first.
    labelMaterial.update();
    setMaterial(labelMaterial);

    return () => {
      labelMaterial.destroy();
      texture.destroy();
      canvasRef.current = null;
      textureRef.current = null;
    };
  }, [app, sessionId]);

  useAppEvent("update", () => {
    const entity = entityRef.current;
    const canvas = canvasRef.current;
    const texture = textureRef.current;
    const record = recordsRef.current.get(sessionId);
    if (!entity || !canvas || !texture || !record) return;

    const cameraEntity = app.root.findByName(LOCAL_CAMERA_ENTITY_NAME) as PcEntity | null;
    const cameraPosition = cameraEntity?.getPosition();

    const visual = getVisualTransform(record.transform, Date.now(), UPDATE_INTERVAL_MS);
    const labelPosition = new Vec3(visual.x, visual.y + LABEL_HEIGHT_ABOVE_ORIGIN, visual.z);
    entity.setPosition(labelPosition);

    const isSpeakingInRange =
      speaking && (!cameraPosition || cameraPosition.distance(labelPosition) <= VOICE_MAX_DISTANCE_METERS);

    const key = `${record.displayName}|${record.pnlUsd}|${isSpeakingInRange}`;
    if (key !== lastDrawnKeyRef.current) {
      lastDrawnKeyRef.current = key;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        drawLabel(ctx, record.displayName, record.pnlUsd, isSpeakingInRange);
        texture.upload();
      }
    }

    if (cameraPosition) {
      if (visualRef.current) {
        visualRef.current.enabled = cameraPosition.distance(labelPosition) <= NAME_LABEL_MAX_DISTANCE_METERS;
      }
      const dx = cameraPosition.x - labelPosition.x;
      const dz = cameraPosition.z - labelPosition.z;
      const yawDegrees = (Math.atan2(dx, dz) * 180) / Math.PI + LABEL_YAW_OFFSET_DEGREES;
      entity.setEulerAngles(0, yawDegrees, 0);
    }
  });

  return (
    <Entity ref={entityRef}>
      <Entity ref={visualRef} scale={[LABEL_WIDTH, LABEL_HEIGHT, 0.01]}>
        {material && <Render type="box" material={material} />}
      </Entity>
    </Entity>
  );
}
