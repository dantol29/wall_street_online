import { useEffect, useRef, useState } from "react";
import { Entity } from "@playcanvas/react";
import { Render } from "@playcanvas/react/components";
import { useApp } from "@playcanvas/react/hooks";
import { StandardMaterial, Texture } from "playcanvas";
import {
  STICKY_WALL_POSITION,
  STICKY_WALL_WORLD_HEIGHT,
  STICKY_WALL_WORLD_WIDTH,
  type StickyNote,
} from "@multiplayer/shared";
import { getStickyNoteLayout } from "./stickyNoteLayout";

const CANVAS_WIDTH = 768;
const CANVAS_HEIGHT = 576;
const NOTE_WIDTH = 130;
const NOTE_HEIGHT = 110;

const BOARD_COLOR = "#5b4632";
const TITLE_COLOR = "#f1ede2";
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
}

/**
 * The sticky-note wall: each note sits at a deterministic (per-session)
 * position/tilt on a corkboard — see stickyNoteLayout.ts. Redrawn only when
 * the note collection changes, not per frame (same canvas-as-texture
 * technique as the ticker/whiteboard/office panels), and lit normally — a
 * corkboard, not a sign.
 */
export function StickyWallDisplay({ notes }: StickyWallDisplayProps) {
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

    const boardMaterial = new StandardMaterial();
    boardMaterial.diffuseMap = texture;
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

  useEffect(() => {
    const canvas = canvasRef.current;
    const texture = textureRef.current;
    if (!canvas || !texture) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = BOARD_COLOR;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textBaseline = "alphabetic";
    ctx.font = `bold 26px "Courier New", monospace`;
    ctx.fillStyle = TITLE_COLOR;
    ctx.fillText("HOW ARE WE FEELING TODAY?", 20, 34);

    for (const note of notes) {
      const layout = getStickyNoteLayout(note.authorSessionId);
      const centerX = layout.xFraction * canvas.width;
      const centerY = layout.yFraction * canvas.height;

      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate((layout.rotationDeg * Math.PI) / 180);

      ctx.fillStyle = NOTE_FILL_COLOR;
      ctx.fillRect(-NOTE_WIDTH / 2, -NOTE_HEIGHT / 2, NOTE_WIDTH, NOTE_HEIGHT);

      ctx.font = `bold 14px "Courier New", monospace`;
      ctx.fillStyle = NOTE_TEXT_COLOR;
      const name =
        note.authorDisplayName.length > 14 ? `${note.authorDisplayName.slice(0, 13)}…` : note.authorDisplayName;
      ctx.fillText(name, -NOTE_WIDTH / 2 + 8, -NOTE_HEIGHT / 2 + 20);

      ctx.font = `13px "Courier New", monospace`;
      const lines = wrapText(ctx, note.text, NOTE_WIDTH - 16, 4);
      let textY = -NOTE_HEIGHT / 2 + 40;
      for (const line of lines) {
        ctx.fillText(line, -NOTE_WIDTH / 2 + 8, textY);
        textY += 16;
      }

      ctx.restore();
    }

    texture.upload();
  }, [notes]);

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
