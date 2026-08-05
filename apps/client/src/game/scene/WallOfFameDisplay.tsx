import { useEffect, useRef, useState } from "react";
import { Entity } from "@playcanvas/react";
import { Render } from "@playcanvas/react/components";
import { useApp } from "@playcanvas/react/hooks";
import { BLEND_NORMAL, StandardMaterial, Texture } from "playcanvas";
import type { BellCycleHistoryEntry } from "@multiplayer/shared";

const CANVAS_WIDTH = 512;
const CANVAS_HEIGHT = 768;
/** More history rows exist server-side (see WALL_OF_FAME_MAX_ENTRIES) than fit legibly on one plaque. */
const MAX_VISIBLE_ROWS = 8;

export interface WallOfFameDisplayProps {
  position: [number, number, number];
  rotationY?: number;
  scale?: [number, number, number];
  entries: BellCycleHistoryEntry[];
}

function formatMarketCapUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${Math.max(0, value).toFixed(0)}`;
}

function formatCycleDate(cycleEndsAtMs: number): string {
  return new Date(cycleEndsAtMs).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function drawWallOfFame(ctx: CanvasRenderingContext2D, entries: BellCycleHistoryEntry[]): void {
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.fillStyle = "#1c1a16";
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  ctx.textAlign = "center";
  ctx.fillStyle = "#d8c99e";
  ctx.font = "700 34px 'Courier New', monospace";
  ctx.fillText("WALL OF FAME", CANVAS_WIDTH / 2, 56);
  ctx.strokeStyle = "rgba(216, 201, 158, 0.4)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(48, 80);
  ctx.lineTo(CANVAS_WIDTH - 48, 80);
  ctx.stroke();

  const visible = entries.slice(0, MAX_VISIBLE_ROWS);
  if (visible.length === 0) {
    ctx.fillStyle = "#7c7461";
    ctx.font = "600 20px 'Courier New', monospace";
    ctx.fillText("No bell has rung yet.", CANVAS_WIDTH / 2, 140);
    return;
  }

  const rowHeight = (CANVAS_HEIGHT - 110) / MAX_VISIBLE_ROWS;
  visible.forEach((entry, index) => {
    const rowY = 110 + index * rowHeight + rowHeight / 2;
    ctx.textAlign = "left";

    if (!entry.winnerDisplayName) {
      ctx.fillStyle = "#5a5346";
      ctx.font = "italic 16px 'Courier New', monospace";
      ctx.fillText(`${formatCycleDate(entry.cycleEndsAtMs)} — no bell rung`, 48, rowY);
      return;
    }

    ctx.fillStyle = "#f1e7c7";
    ctx.font = "700 20px 'Courier New', monospace";
    ctx.fillText(entry.winnerDisplayName, 48, rowY - 10);

    ctx.fillStyle = "#a89049";
    ctx.font = "600 15px 'Courier New', monospace";
    ctx.fillText(`$${entry.ticker} — ${entry.tokenName}`, 48, rowY + 12);

    ctx.textAlign = "right";
    ctx.fillStyle = "#65d88b";
    ctx.font = "700 16px 'Courier New', monospace";
    ctx.fillText(entry.marketCapUsd !== null ? formatMarketCapUsd(entry.marketCapUsd) : "", CANVAS_WIDTH - 48, rowY - 10);

    ctx.fillStyle = "#7c7461";
    ctx.font = "500 13px 'Courier New', monospace";
    ctx.fillText(formatCycleDate(entry.cycleEndsAtMs), CANVAS_WIDTH - 48, rowY + 12);
  });
}

/**
 * A plaque wall behind the Bell Podium listing past cycle winners — cheap
 * to build (same canvas-texture technique as everything else in this
 * scene), and gives the world a visible sense of history over time. Static
 * content: redrawn only when the `entries` prop actually changes, not on a
 * timer (matches the office thesis wall's approach, not the pit gauges').
 */
export function WallOfFameDisplay({ position, rotationY = 0, scale = [1.6, 2.4, 0.01], entries }: WallOfFameDisplayProps) {
  const app = useApp();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textureRef = useRef<Texture | null>(null);
  const [material, setMaterial] = useState<StandardMaterial | null>(null);

  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    canvasRef.current = canvas;

    const texture = new Texture(app.graphicsDevice, {
      name: "wall-of-fame",
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      mipmaps: false,
    });
    texture.setSource(canvas);
    textureRef.current = texture;

    const wallMaterial = new StandardMaterial();
    wallMaterial.diffuse.set(1, 1, 1);
    wallMaterial.diffuseMap = texture;
    wallMaterial.opacityMap = texture;
    wallMaterial.opacityMapChannel = "a";
    wallMaterial.blendType = BLEND_NORMAL;
    wallMaterial.alphaTest = 0.02;
    wallMaterial.emissiveMap = texture;
    wallMaterial.emissive.set(1, 1, 1);
    wallMaterial.emissiveIntensity = 0.4;
    wallMaterial.update();
    setMaterial(wallMaterial);

    return () => {
      wallMaterial.destroy();
      texture.destroy();
      canvasRef.current = null;
      textureRef.current = null;
    };
  }, [app]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const texture = textureRef.current;
    if (!canvas || !texture) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawWallOfFame(ctx, entries);
    texture.upload();
  }, [entries]);

  return (
    <Entity position={position} rotation={[0, rotationY, 0]} scale={scale}>
      {material && <Render type="box" material={material} />}
    </Entity>
  );
}
