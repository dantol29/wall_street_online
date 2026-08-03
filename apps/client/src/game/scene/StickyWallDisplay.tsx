import { useEffect, useRef, useState } from "react";
import { Entity } from "@playcanvas/react";
import { Render } from "@playcanvas/react/components";
import { useApp } from "@playcanvas/react/hooks";
import { StandardMaterial, Texture } from "playcanvas";
import {
  STICKY_NOTE_CANVAS_HEIGHT,
  STICKY_NOTE_CANVAS_WIDTH,
  STICKY_NOTE_HEIGHT_PX,
  STICKY_NOTE_WIDTH_PX,
  STICKY_WALL_POSITION,
  STICKY_WALL_WORLD_HEIGHT,
  STICKY_WALL_WORLD_WIDTH,
  type StickyNote,
} from "@multiplayer/shared";
import { getStickyNoteRotation } from "./stickyNoteLayout";

const CANVAS_WIDTH = STICKY_NOTE_CANVAS_WIDTH;
const CANVAS_HEIGHT = STICKY_NOTE_CANVAS_HEIGHT;
const NOTE_WIDTH = STICKY_NOTE_WIDTH_PX;
const NOTE_HEIGHT = STICKY_NOTE_HEIGHT_PX;

/** How long the "just placed" pop plays for, once a note is confirmed by the server. */
const PLACED_POP_DURATION_MS = 350;

const BOARD_COLOR = "#5b4632";
const NOTE_FILL_COLOR = "#fef08a";
const NOTE_TEXT_COLOR = "#3a3212";

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && ctx.measureText(candidate).width > maxWidth) {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines) break;
    } else {
      current = candidate;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);

  return lines;
}

interface StickyWallDisplayProps {
  notes: StickyNote[];
  /** The author whose note was just confirmed by the server — plays a brief settle-in pop at its spot, then clears itself. */
  justPlacedAuthorSessionId?: string | null;
}

function drawBoard(ctx: CanvasRenderingContext2D, notes: StickyNote[], poppingSessionId: string | null, poppingScale: number): void {
  ctx.fillStyle = BOARD_COLOR;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.textBaseline = "alphabetic";

  for (const note of notes) {
    const centerX = note.xFraction * CANVAS_WIDTH;
    const centerY = note.yFraction * CANVAS_HEIGHT;
    const rotationDeg = getStickyNoteRotation(note.authorSessionId);
    const scale = note.authorSessionId === poppingSessionId ? poppingScale : 1;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate((rotationDeg * Math.PI) / 180);
    ctx.scale(scale, scale);

    ctx.fillStyle = NOTE_FILL_COLOR;
    ctx.fillRect(-NOTE_WIDTH / 2, -NOTE_HEIGHT / 2, NOTE_WIDTH, NOTE_HEIGHT);

    ctx.font = `bold 28px "Courier New", monospace`;
    ctx.fillStyle = NOTE_TEXT_COLOR;
    const name =
      note.authorDisplayName.length > 14 ? `${note.authorDisplayName.slice(0, 13)}…` : note.authorDisplayName;
    ctx.fillText(name, -NOTE_WIDTH / 2 + 16, -NOTE_HEIGHT / 2 + 40);

    ctx.font = `bold 26px "Courier New", monospace`;
    const lines = wrapText(ctx, note.text, NOTE_WIDTH - 32, 4);
    let textY = -NOTE_HEIGHT / 2 + 80;
    for (const line of lines) {
      ctx.fillText(line, -NOTE_WIDTH / 2 + 16, textY);
      textY += 32;
    }

    ctx.restore();
  }
}

/**
 * The sticky-note wall: each note sits at the board position its author
 * clicked to place it (see stickyWallBoardProjection.ts / App.tsx), with a
 * deterministic per-session tilt (stickyNoteLayout.ts). Redrawn on every
 * data change (same canvas-as-texture technique as the ticker/whiteboard/
 * office panels), plus a short animated redraw loop while a note is
 * settling into place, and lit normally — a corkboard, not a sign.
 */
export function StickyWallDisplay({ notes, justPlacedAuthorSessionId = null }: StickyWallDisplayProps) {
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
      name: "sticky-wall-canvas",
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      mipmaps: false,
    });
    texture.setSource(canvas);
    textureRef.current = texture;

    // Diffuse-only made the notes' small text unreadable whenever the board
    // wasn't brightly lit — same fix as the whiteboard's screen: a mild
    // self-glow (emissiveMap) keeps text legible regardless of ambient
    // light, without the board looking like a lit sign.
    const boardMaterial = new StandardMaterial();
    boardMaterial.diffuse.set(1, 1, 1);
    boardMaterial.emissive.set(1, 1, 1);
    boardMaterial.emissiveIntensity = 0.35;
    boardMaterial.diffuseMap = texture;
    boardMaterial.emissiveMap = texture;
    boardMaterial.gloss = 0.1;
    boardMaterial.metalness = 0;
    boardMaterial.update();
    setMaterial(boardMaterial);

    return () => {
      boardMaterial.destroy();
      texture.destroy();
      canvasRef.current = null;
      textureRef.current = null;
    };
  }, [app]);

  const notesRef = useRef(notes);
  notesRef.current = notes;

  useEffect(() => {
    const canvas = canvasRef.current;
    const texture = textureRef.current;
    if (!canvas || !texture) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    drawBoard(ctx, notes, null, 1);
    texture.upload();
  }, [notes]);

  useEffect(() => {
    if (!justPlacedAuthorSessionId) return;
    const canvas = canvasRef.current;
    const texture = textureRef.current;
    if (!canvas || !texture) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const authorSessionId = justPlacedAuthorSessionId;
    const startedAt = performance.now();
    let frame = 0;

    const tick = (): void => {
      const elapsed = performance.now() - startedAt;
      const progress = Math.min(1, elapsed / PLACED_POP_DURATION_MS);
      // Overshoot-then-settle: pops slightly past full size before landing, like a real sticker being pressed on.
      const eased = 1 - Math.pow(1 - progress, 3);
      const scale = 0.4 + eased * 0.7;
      drawBoard(ctx, notesRef.current, authorSessionId, scale);
      texture.upload();
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        drawBoard(ctx, notesRef.current, null, 1);
        texture.upload();
      }
    };
    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [justPlacedAuthorSessionId]);

  return (
    <Entity position={[STICKY_WALL_POSITION.x, STICKY_WALL_POSITION.y, STICKY_WALL_POSITION.z]}>
      {material && (
        <Entity scale={[0.04, STICKY_WALL_WORLD_HEIGHT, STICKY_WALL_WORLD_WIDTH]}>
          <Render type="box" material={material} />
        </Entity>
      )}
    </Entity>
  );
}
