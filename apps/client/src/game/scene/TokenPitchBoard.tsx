import { useEffect, useRef, useState } from "react";
import { Entity } from "@playcanvas/react";
import { Render } from "@playcanvas/react/components";
import { useApp } from "@playcanvas/react/hooks";
import { BLEND_NORMAL, StandardMaterial, Texture } from "playcanvas";

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 680;

interface PitchCard {
  ticker: string;
  name: string;
  author: string;
  pitch: string;
  status: string;
  color: string;
  bullish: number;
  bearish: number;
}

const SAMPLE_PITCHES: PitchCard[] = [
  {
    ticker: "$BULL",
    name: "Charging Bull",
    author: "Trader-7884",
    pitch: "Wall Street energy, on-chain.",
    status: "PITCHING",
    color: "#d6a94a",
    bullish: 18,
    bearish: 4,
  },
  {
    ticker: "$HYPE",
    name: "Floor Hype",
    author: "MarketMaker",
    pitch: "The crowd decides what graduates.",
    status: "WATCHING",
    color: "#39c6d2",
    bullish: 12,
    bearish: 7,
  },
  {
    ticker: "$BELL",
    name: "Bell Protocol",
    author: "BullMarket87",
    pitch: "Make every graduation count.",
    status: "NEW IDEA",
    color: "#b9c4c8",
    bullish: 9,
    bearish: 2,
  },
];

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fill();
}

function drawTokenPitchBoard(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.fillStyle = "#10191d";
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  ctx.fillStyle = "#d7c17c";
  ctx.font = "700 42px 'Courier New', monospace";
  ctx.fillText("TOKEN PITCH BOARD", 52, 62);
  ctx.fillStyle = "#6d858a";
  ctx.font = "600 18px 'Courier New', monospace";
  ctx.fillText("PITCH AN IDEA  •  LEAVE YOUR MARK  •  FIND THE NEXT GRADUATE", 54, 96);

  ctx.strokeStyle = "rgba(215, 193, 124, 0.45)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(52, 120);
  ctx.lineTo(CANVAS_WIDTH - 52, 120);
  ctx.stroke();

  const cardWidth = 346;
  const cardHeight = 450;
  const gap = 18;
  SAMPLE_PITCHES.forEach((pitch, index) => {
    const x = 48 + index * (cardWidth + gap);
    const y = 148;
    ctx.fillStyle = "#1a272c";
    roundRect(ctx, x, y, cardWidth, cardHeight, 10);
    ctx.strokeStyle = `${pitch.color}88`;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = pitch.color;
    ctx.font = "700 34px 'Courier New', monospace";
    ctx.fillText(pitch.ticker, x + 22, y + 52);
    ctx.fillStyle = "#ecf4ef";
    ctx.font = "700 19px 'Courier New', monospace";
    ctx.fillText(pitch.name, x + 22, y + 84);
    ctx.fillStyle = "#738b8e";
    ctx.font = "500 16px 'Courier New', monospace";
    ctx.fillText(`by ${pitch.author}`, x + 22, y + 113);

    ctx.fillStyle = "#d3dedb";
    ctx.font = "600 19px Arial, sans-serif";
    const words = pitch.pitch.split(" ");
    let line = "";
    let lineY = y + 174;
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > cardWidth - 44) {
        ctx.fillText(line, x + 22, lineY);
        line = word;
        lineY += 28;
      } else {
        line = next;
      }
    }
    if (line) ctx.fillText(line, x + 22, lineY);

    ctx.fillStyle = "#385057";
    roundRect(ctx, x + 22, y + 222, cardWidth - 44, 2, 1);
    ctx.fillStyle = pitch.color;
    ctx.font = "700 15px 'Courier New', monospace";
    ctx.fillText(pitch.status, x + 22, y + 258);

    // Physical-looking voting stickers.
    ctx.fillStyle = "#183d2b";
    roundRect(ctx, x + 22, y + 300, 138, 58, 8);
    ctx.fillStyle = "#6de49a";
    ctx.font = "700 20px 'Courier New', monospace";
    ctx.fillText(`▲ ${pitch.bullish}`, x + 42, y + 336);
    ctx.fillStyle = "#3b2024";
    roundRect(ctx, x + 184, y + 300, 138, 58, 8);
    ctx.fillStyle = "#ff8b84";
    ctx.fillText(`▼ ${pitch.bearish}`, x + 204, y + 336);

    ctx.fillStyle = "#627a7d";
    ctx.font = "500 14px 'Courier New', monospace";
    ctx.fillText("COMMUNITY SIGNAL", x + 22, y + 398);
    ctx.fillStyle = pitch.color;
    roundRect(ctx, x + 22, y + 414, cardWidth - 44, 8, 4);
    ctx.fillStyle = "#203137";
    roundRect(ctx, x + 22 + (cardWidth - 44) * 0.62, y + 414, (cardWidth - 44) * 0.38, 8, 4);
  });
}

/** Static visual mockup for the future multiplayer token-pitch interaction. */
export function TokenPitchBoard({
  position,
  rotationY = 0,
  scale = [4.5, 2.55, 0.01],
}: {
  position: [number, number, number];
  rotationY?: number;
  scale?: [number, number, number];
}) {
  const app = useApp();
  const textureRef = useRef<Texture | null>(null);
  const [material, setMaterial] = useState<StandardMaterial | null>(null);

  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    const texture = new Texture(app.graphicsDevice, {
      name: "token-pitch-board",
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      mipmaps: false,
    });
    texture.setSource(canvas);
    textureRef.current = texture;

    const boardMaterial = new StandardMaterial();
    boardMaterial.diffuse.set(1, 1, 1);
    boardMaterial.diffuseMap = texture;
    boardMaterial.opacityMap = texture;
    boardMaterial.opacityMapChannel = "a";
    boardMaterial.blendType = BLEND_NORMAL;
    boardMaterial.emissiveMap = texture;
    boardMaterial.emissive.set(1, 1, 1);
    boardMaterial.emissiveIntensity = 0.35;
    boardMaterial.update();
    setMaterial(boardMaterial);

    const context = canvas.getContext("2d");
    if (context) {
      drawTokenPitchBoard(context);
      texture.upload();
    }

    return () => {
      boardMaterial.destroy();
      texture.destroy();
      textureRef.current = null;
    };
  }, [app]);

  if (!material) return null;
  return (
    <Entity position={position} rotation={[0, rotationY, 0]} scale={scale}>
      <Render type="box" material={material} />
    </Entity>
  );
}
