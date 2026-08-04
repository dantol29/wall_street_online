import { useEffect, useRef, useState } from "react";
import { Entity } from "@playcanvas/react";
import { Render } from "@playcanvas/react/components";
import { useApp, useAppEvent } from "@playcanvas/react/hooks";
import {
  BLEND_NORMAL,
  CULLFACE_BACK,
  FILTER_LINEAR,
  StandardMaterial,
  Texture,
  type Entity as PcEntity,
} from "playcanvas";
import type { ChatMessage } from "@multiplayer/shared";

const CANVAS_WIDTH = 1024;
const CANVAS_HEIGHT = 640;
const MAX_VISIBLE_MESSAGES = 8;
const USERNAME_COLORS = ["#75c7e8", "#e8a36f", "#72cf95", "#dfc879", "#c19ada", "#df8798"];

interface InGameChatHudProps {
  messages: ChatMessage[];
  focused: boolean;
  draft: string;
  disabled: boolean;
}

function colorForSender(senderId: string): string {
  let hash = 0;
  for (let index = 0; index < senderId.length; index += 1) {
    hash = (hash * 31 + senderId.charCodeAt(index)) | 0;
  }
  return USERNAME_COLORS[Math.abs(hash) % USERNAME_COLORS.length];
}

function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;

  let end = text.length;
  while (end > 0 && ctx.measureText(`${text.slice(0, end)}…`).width > maxWidth) {
    end -= 1;
  }
  return `${text.slice(0, end)}…`;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (ctx.measureText(word).width > maxWidth) {
      if (line) {
        lines.push(line);
        line = "";
      }
      let chunk = "";
      for (const character of word) {
        const candidate = `${chunk}${character}`;
        if (chunk && ctx.measureText(candidate).width > maxWidth) {
          lines.push(chunk);
          chunk = character;
        } else {
          chunk = candidate;
        }
      }
      line = chunk;
      continue;
    }
    const candidate = line ? `${line} ${word}` : word;
    if (!line || ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
      continue;
    }
    lines.push(line);
    line = word;
  }
  if (line) lines.push(line);
  return lines;
}

function drawChatHud(
  ctx: CanvasRenderingContext2D,
  messages: ChatMessage[],
  focused: boolean,
  draft: string,
): void {
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const visibleMessages = messages.slice(-MAX_VISIBLE_MESSAGES);
  if (visibleMessages.length === 0 && !focused) return;

  const composerHeight = focused ? 72 : 0;
  const messageAreaBottom = CANVAS_HEIGHT - 24 - composerHeight;
  const messageBlocks = visibleMessages.map((message) => {
    ctx.font = "400 27px Arial, sans-serif";
    return {
      message,
      lines: wrapText(ctx, message.text, CANVAS_WIDTH - 410).slice(0, 2),
    };
  });
  const blockHeights = messageBlocks.map(({ lines }) => 38 + lines.length * 38 + 14);
  const availableMessageHeight = messageAreaBottom - 34;
  while (
    messageBlocks.length > 1 &&
    blockHeights.reduce((total, height) => total + height, 0) > availableMessageHeight
  ) {
    messageBlocks.shift();
    blockHeights.shift();
  }
  const totalMessageHeight = blockHeights.reduce((total, height) => total + height, 0);
  let rowY = Math.max(34, messageAreaBottom - totalMessageHeight);

  ctx.textBaseline = "middle";
  messageBlocks.forEach(({ message, lines }, index) => {
    const nameY = rowY + 18;

    ctx.font = "700 22px 'Courier New', monospace";
    ctx.fillStyle = colorForSender(message.senderId);
    ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
    ctx.shadowBlur = 7;
    ctx.fillText(truncateText(ctx, message.displayName.toUpperCase(), 360), 340, nameY);

    ctx.font = "400 26px Arial, sans-serif";
    ctx.fillStyle = "#eeede6";
    lines.forEach((line, lineIndex) => {
      ctx.fillText(line, 340, rowY + 53 + lineIndex * 38);
    });
    rowY += blockHeights[index];
  });

  if (focused) {
    const composerTop = CANVAS_HEIGHT - composerHeight - 10;
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(8, 10, 8, 0.9)";
    ctx.fillRect(320, composerTop, CANVAS_WIDTH - 336, composerHeight);
    ctx.fillStyle = "#c9b779";
    ctx.fillRect(CANVAS_WIDTH - 20, composerTop, 4, composerHeight);

    ctx.font = "700 28px 'Courier New', monospace";
    ctx.fillStyle = "#c9b779";
    ctx.fillText(">", 344, composerTop + composerHeight / 2);

    if (draft) {
      ctx.font = "400 28px Arial, sans-serif";
      ctx.fillStyle = "#f0eee7";
      ctx.fillText(truncateText(ctx, draft, CANVAS_WIDTH - 410), 378, composerTop + composerHeight / 2);
    }
  }

  ctx.shadowBlur = 0;
}

/**
 * Camera-attached PlayCanvas geometry. The browser canvas is only a texture
 * source; chat pixels are composited by WebGL with the rest of the game.
 */
export function InGameChatHud({ messages, focused, draft, disabled }: InGameChatHudProps) {
  const app = useApp();
  const entityRef = useRef<PcEntity | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textureRef = useRef<Texture | null>(null);
  const [material, setMaterial] = useState<StandardMaterial | null>(null);

  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    canvasRef.current = canvas;

    const texture = new Texture(app.graphicsDevice, {
      name: "in-game-chat-hud",
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      mipmaps: false,
      minFilter: FILTER_LINEAR,
      magFilter: FILTER_LINEAR,
    });
    texture.setSource(canvas);
    textureRef.current = texture;

    const hudMaterial = new StandardMaterial();
    hudMaterial.diffuse.set(1, 1, 1);
    hudMaterial.diffuseMap = texture;
    hudMaterial.opacityMap = texture;
    hudMaterial.opacityMapChannel = "a";
    hudMaterial.emissive.set(1, 1, 1);
    hudMaterial.emissiveMap = texture;
    hudMaterial.emissiveIntensity = 1;
    hudMaterial.blendType = BLEND_NORMAL;
    hudMaterial.alphaTest = 0.01;
    // Only the face pointed at the camera may render. Drawing both box faces
    // superimposes a normal and mirrored copy of every glyph.
    hudMaterial.cull = CULLFACE_BACK;
    hudMaterial.depthTest = false;
    hudMaterial.depthWrite = false;
    hudMaterial.update();
    setMaterial(hudMaterial);

    return () => {
      hudMaterial.destroy();
      texture.destroy();
      canvasRef.current = null;
      textureRef.current = null;
    };
  }, [app]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const texture = textureRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !texture || !ctx) return;

    drawChatHud(ctx, messages, focused, draft);
    texture.upload();
  }, [draft, focused, messages]);

  useAppEvent("update", () => {
    const entity = entityRef.current;
    if (!entity) return;

    const device = app.graphicsDevice;
    const aspect = Math.max(0.4, device.width / Math.max(1, device.height));
    const camera = (entity.parent as PcEntity | null)?.camera;
    const fieldOfView = camera?.fov ?? 75;
    const fovExtent = Math.tan((fieldOfView * Math.PI) / 360);
    const halfWidth = camera?.horizontalFov ? fovExtent : fovExtent * aspect;
    const halfHeight = camera?.horizontalFov ? fovExtent / aspect : fovExtent;
    // Size as a fraction of the current camera frustum. This remains stable
    // when sitting/terminal interactions animate the camera FOV.
    const width = halfWidth * (aspect < 1 ? 1.45 : 0.62);
    const height = width * (CANVAS_HEIGHT / CANVAS_WIDTH);
    const centerX = aspect < 1 ? 0 : halfWidth - width / 2 - 0.004;
    const centerY = -halfHeight + height / 2 + 0.045;

    entity.setLocalPosition(centerX, centerY, -1);
    entity.setLocalScale(width, height, 0.002);
    entity.enabled = !disabled && (focused || messages.length > 0);
  });

  return (
    <Entity ref={entityRef} rotation={[0, 180, 0]}>
      {material && <Render type="box" material={material} />}
    </Entity>
  );
}
