import { useEffect, useRef, useState } from "react";
import { Entity } from "@playcanvas/react";
import { Render } from "@playcanvas/react/components";
import { useApp } from "@playcanvas/react/hooks";
import { BLEND_NORMAL, StandardMaterial, Texture } from "playcanvas";

type PanelKind = "title" | "token";

function drawPanel(
  ctx: CanvasRenderingContext2D,
  kind: PanelKind,
  ticker: string,
  tokenImage: HTMLImageElement | null,
): void {
  const width = kind === "title" ? 960 : 768;
  const height = kind === "title" ? 220 : 960;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#0c1112";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#384b4f";
  ctx.lineWidth = 8;
  ctx.strokeRect(12, 12, width - 24, height - 24);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (kind === "title") {
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 74px 'Courier New', monospace";
    ctx.fillText("TOKEN PITCH", width / 2, height / 2 - 12);
    return;
  }

  if (tokenImage) {
    // Keep the source token image square, matching cashcat.jpeg's 640×640 aspect ratio.
    ctx.drawImage(tokenImage, width / 2 - 280, 92, 560, 560);
  }

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 32px 'Courier New', monospace";
  ctx.fillText("TOKEN PITCH", width / 2, 42);
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 78px 'Courier New', monospace";
  ctx.fillText(ticker, width / 2, 800);
}

export function TokenPitchWallDisplay({
  kind,
  position,
  rotationY = 90,
  scale,
  active = false,
  presenterName = "",
  ticker = "BULL",
}: {
  kind: PanelKind;
  position: [number, number, number];
  rotationY?: number;
  scale: [number, number, number];
  active?: boolean;
  presenterName?: string;
  ticker?: string;
}) {
  const app = useApp();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textureRef = useRef<Texture | null>(null);
  const tokenImageRef = useRef<HTMLImageElement | null>(null);
  const [material, setMaterial] = useState<StandardMaterial | null>(null);
  const width = kind === "title" ? 960 : 768;
  const height = kind === "title" ? 220 : 960;

  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvasRef.current = canvas;
    const texture = new Texture(app.graphicsDevice, { name: `token-pitch-${kind}`, width, height, mipmaps: false });
    texture.setSource(canvas);
    textureRef.current = texture;

    const panelMaterial = new StandardMaterial();
    panelMaterial.diffuse.set(1, 1, 1);
    panelMaterial.diffuseMap = texture;
    panelMaterial.opacityMap = texture;
    panelMaterial.opacityMapChannel = "a";
    panelMaterial.blendType = BLEND_NORMAL;
    panelMaterial.emissiveMap = texture;
    panelMaterial.emissive.set(1, 1, 1);
    panelMaterial.emissiveIntensity = 0.45;
    panelMaterial.update();
    setMaterial(panelMaterial);

    return () => {
      panelMaterial.destroy();
      texture.destroy();
      canvasRef.current = null;
      textureRef.current = null;
    };
  }, [app, height, kind, width]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const texture = textureRef.current;
    const context = canvas?.getContext("2d");
    if (!context || !texture) return;
    drawPanel(context, kind, ticker, tokenImageRef.current);
    texture.upload();
  }, [active, kind, presenterName, ticker]);

  useEffect(() => {
    if (kind !== "token") return;
    const image = new Image();
    image.onload = () => {
      tokenImageRef.current = image;
      const canvas = canvasRef.current;
      const texture = textureRef.current;
      const context = canvas?.getContext("2d");
      if (!context || !texture) return;
      drawPanel(context, kind, ticker, image);
      texture.upload();
    };
    image.src = "/assets/cashcat.jpeg";
    return () => {
      image.onload = null;
      tokenImageRef.current = null;
    };
  }, [kind, ticker]);

  if (!material) return null;
  return (
    <Entity position={position} rotation={[0, rotationY, 0]} scale={scale}>
      <Render type="box" material={material} />
    </Entity>
  );
}
