import { useEffect, useRef, useState } from "react";
import { Entity } from "@playcanvas/react";
import { Render } from "@playcanvas/react/components";
import { useApp } from "@playcanvas/react/hooks";
import { StandardMaterial, Texture } from "playcanvas";

const CANVAS_WIDTH = 512;
const CANVAS_HEIGHT = 640;

const BACKGROUND_COLOR = "#f1ede2";
const TITLE_COLOR = "#1c1c1c";
const BODY_COLOR = "#3a3a3a";
const MUTED_COLOR = "#8a8a8a";
const TITLE_FONT = `bold 30px "Courier New", monospace`;
const HEADING_FONT = `bold 20px "Courier New", monospace`;
const BODY_FONT = `20px "Courier New", monospace`;

const MARGIN_X = 28;
const LINE_HEIGHT = 26;
const MAX_THESIS_LINES = 8;
const MAX_WATCHLIST_ROWS = 10;

export interface OfficeSlotContent {
  ownerDisplayName: string | null;
  thesisBody: string | null;
  watchlist: { symbol: string; note: string }[];
}

interface OfficeContentDisplayProps {
  position: [number, number, number];
  /** Thin along one axis (matching this codebase's `VisualBox`-as-flat-sheet idiom, e.g. TradingPlanEditor's paper overlay) — no separate rotation prop needed since the thin axis alone determines which wall face is visible. */
  size: [number, number, number];
  content: OfficeSlotContent | null;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && ctx.measureText(candidate).width > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);

  return lines;
}

/**
 * A per-alcove "thesis wall" / watchlist board — same canvas-as-texture
 * technique as the ticker/whiteboard, but redrawn only when `content`
 * changes (a human publishing/editing), not on a per-frame timer. Lit
 * normally (diffuseMap, not emissive) — this is a noticeboard, not a glowing
 * sign like the ticker.
 */
export function OfficeContentDisplay({ position, size, content }: OfficeContentDisplayProps) {
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
      name: "office-content-canvas",
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      mipmaps: false,
    });
    texture.setSource(canvas);
    textureRef.current = texture;

    const panelMaterial = new StandardMaterial();
    panelMaterial.diffuseMap = texture;
    panelMaterial.gloss = 0.15;
    panelMaterial.metalness = 0;
    panelMaterial.update();
    setMaterial(panelMaterial);

    return () => {
      panelMaterial.destroy();
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

    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textBaseline = "alphabetic";

    let y = 48;
    ctx.font = TITLE_FONT;
    ctx.fillStyle = TITLE_COLOR;
    ctx.fillText(content?.ownerDisplayName ? content.ownerDisplayName.toUpperCase() : "VACANT OFFICE", MARGIN_X, y);
    y += 20;
    ctx.strokeStyle = TITLE_COLOR;
    ctx.beginPath();
    ctx.moveTo(MARGIN_X, y);
    ctx.lineTo(canvas.width - MARGIN_X, y);
    ctx.stroke();
    y += 44;

    ctx.font = HEADING_FONT;
    ctx.fillStyle = TITLE_COLOR;
    ctx.fillText("THESIS", MARGIN_X, y);
    y += 32;

    ctx.font = BODY_FONT;
    ctx.fillStyle = content?.thesisBody ? BODY_COLOR : MUTED_COLOR;
    const thesisLines = wrapText(ctx, content?.thesisBody || "No thesis published yet.", canvas.width - MARGIN_X * 2);
    for (const line of thesisLines.slice(0, MAX_THESIS_LINES)) {
      ctx.fillText(line, MARGIN_X, y);
      y += LINE_HEIGHT;
    }
    y += 24;

    ctx.font = HEADING_FONT;
    ctx.fillStyle = TITLE_COLOR;
    ctx.fillText("WATCHLIST", MARGIN_X, y);
    y += 32;

    ctx.font = BODY_FONT;
    if (!content?.watchlist.length) {
      ctx.fillStyle = MUTED_COLOR;
      ctx.fillText("No watchlist set.", MARGIN_X, y);
    } else {
      for (const item of content.watchlist.slice(0, MAX_WATCHLIST_ROWS)) {
        ctx.fillStyle = BODY_COLOR;
        ctx.fillText(item.note ? `${item.symbol} — ${item.note}` : item.symbol, MARGIN_X, y);
        y += LINE_HEIGHT;
      }
    }

    texture.upload();
  }, [content]);

  return <Entity position={position} scale={size}>{material && <Render type="box" material={material} />}</Entity>;
}
