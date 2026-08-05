import { useEffect, useRef, useState } from "react";
import { Entity } from "@playcanvas/react";
import { Render } from "@playcanvas/react/components";
import { useApp, useAppEvent } from "@playcanvas/react/hooks";
import { BLEND_NORMAL, StandardMaterial, Texture } from "playcanvas";

const CANVAS_WIDTH = 512;
const CANVAS_HEIGHT = 160;
const REDRAW_INTERVAL_MS = 1000;

export interface BellCycleCountdownDisplayProps {
  position: [number, number, number];
  rotationY?: number;
  scale?: [number, number, number];
  cycleEndsAtMs: number;
}

function formatCountdown(remainingMs: number): string {
  const clamped = Math.max(0, remainingMs);
  const totalSeconds = Math.floor(clamped / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function drawCountdown(ctx: CanvasRenderingContext2D, cycleEndsAtMs: number): void {
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.fillStyle = "#0a0f0c";
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#a8b8ae";
  ctx.font = "600 26px 'Courier New', monospace";
  ctx.fillText("NEXT BELL RINGS IN", CANVAS_WIDTH / 2, 46);

  const remainingMs = cycleEndsAtMs - Date.now();
  ctx.fillStyle = remainingMs <= 60_000 ? "#ffd76a" : "#dfffe7";
  ctx.font = "700 56px 'Courier New', monospace";
  ctx.fillText(formatCountdown(remainingMs), CANVAS_WIDTH / 2, 106);
}

/**
 * A small canvas-texture plaque above the trading pit showing time-until-
 * next-cycle — the "appointment viewing" cue from the Bell Podium pitch.
 * Same technique as WorldClockDisplay's CityLabel/the pit gauges, just
 * redrawn once a second on a timer rather than only on content change,
 * since the whole point is the number visibly ticking down.
 */
export function BellCycleCountdownDisplay({
  position,
  rotationY = 0,
  scale = [1.4, 0.44, 0.01],
  cycleEndsAtMs,
}: BellCycleCountdownDisplayProps) {
  const app = useApp();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textureRef = useRef<Texture | null>(null);
  const [material, setMaterial] = useState<StandardMaterial | null>(null);
  const lastRedrawAtRef = useRef(0);

  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    canvasRef.current = canvas;

    const texture = new Texture(app.graphicsDevice, {
      name: "bell-cycle-countdown",
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      mipmaps: false,
    });
    texture.setSource(canvas);
    textureRef.current = texture;

    const countdownMaterial = new StandardMaterial();
    countdownMaterial.diffuse.set(1, 1, 1);
    countdownMaterial.diffuseMap = texture;
    countdownMaterial.opacityMap = texture;
    countdownMaterial.opacityMapChannel = "a";
    countdownMaterial.blendType = BLEND_NORMAL;
    countdownMaterial.alphaTest = 0.02;
    countdownMaterial.emissiveMap = texture;
    countdownMaterial.emissive.set(1, 1, 1);
    countdownMaterial.emissiveIntensity = 0.55;
    countdownMaterial.update();
    setMaterial(countdownMaterial);

    return () => {
      countdownMaterial.destroy();
      texture.destroy();
      canvasRef.current = null;
      textureRef.current = null;
    };
  }, [app]);

  const redraw = (): void => {
    const canvas = canvasRef.current;
    const texture = textureRef.current;
    if (!canvas || !texture) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawCountdown(ctx, cycleEndsAtMs);
    texture.upload();
  };

  useEffect(() => {
    redraw();
    lastRedrawAtRef.current = Date.now();
  }, [cycleEndsAtMs]);

  useAppEvent("update", () => {
    const now = Date.now();
    if (now - lastRedrawAtRef.current < REDRAW_INTERVAL_MS) return;
    lastRedrawAtRef.current = now;
    redraw();
  });

  return (
    <Entity position={position} rotation={[0, rotationY, 0]} scale={scale}>
      {material && <Render type="box" material={material} />}
    </Entity>
  );
}
