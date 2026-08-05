import { useEffect, useRef, useState } from "react";
import { useApp, useAppEvent } from "@playcanvas/react/hooks";
import { BLEND_NORMAL, StandardMaterial, Texture } from "playcanvas";
import { computeMarketCapUsd, type BellCycleSlot } from "@multiplayer/shared";
import { DeskMonitor } from "./Environment";

const CANVAS_WIDTH = 512;
const CANVAS_HEIGHT = 384;
/** A live token's number keeps ticking via the shared deterministic formula — this just paces how often the canvas actually redraws, not the underlying math. */
const REDRAW_INTERVAL_MS = 1000;

export type BellPitGaugeFlash = "gold" | "red" | null;

export interface BellPitGaugeDisplayProps {
  slot: BellCycleSlot;
  position: [number, number, number];
  rotationY: number;
  /** True for the few seconds right at cycle-end, once the winner is known — stops the live-updating number so every viewer sees the same final figure the ceremony is about. */
  frozen?: boolean;
  /** Set once the ceremony has revealed results — gold on the winning slot, red on every other launched slot. */
  flash?: BellPitGaugeFlash;
}

function formatMarketCapUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${Math.max(0, value).toFixed(0)}`;
}

function drawGauge(ctx: CanvasRenderingContext2D, slot: BellCycleSlot, frozen: boolean, flash: BellPitGaugeFlash): void {
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const backgroundColor = flash === "gold" ? "#3a2f05" : flash === "red" ? "#3a0808" : "#0a0f0c";
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const isOpen = !slot.tokenName || slot.seed === null || slot.launchedAtMs === null;
  if (isOpen) {
    ctx.fillStyle = "#4a5a52";
    ctx.font = "700 36px 'Courier New', monospace";
    ctx.fillText("OPEN SLOT", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 24);
    ctx.font = "600 20px 'Courier New', monospace";
    ctx.fillText("walk up + E to launch a token", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 26);
    return;
  }

  const marketCapUsd = computeMarketCapUsd(slot.seed as number, Date.now() - (slot.launchedAtMs as number));

  const tickerColor = flash === "gold" ? "#ffd76a" : flash === "red" ? "#ff8c7a" : "#65d88b";
  ctx.fillStyle = tickerColor;
  ctx.font = "700 32px 'Courier New', monospace";
  ctx.fillText(`$${slot.ticker}`, CANVAS_WIDTH / 2, 76);

  ctx.fillStyle = "#dfffe7";
  ctx.font = "600 22px 'Courier New', monospace";
  ctx.fillText(slot.tokenName as string, CANVAS_WIDTH / 2, 118);

  ctx.fillStyle = flash === "gold" ? "#fff2c9" : "#ffffff";
  ctx.font = "700 50px 'Courier New', monospace";
  ctx.fillText(formatMarketCapUsd(marketCapUsd), CANVAS_WIDTH / 2, 200);

  ctx.fillStyle = "#a8b8ae";
  ctx.font = "500 18px 'Courier New', monospace";
  ctx.fillText(`launched by ${slot.ownerDisplayName ?? "?"}`, CANVAS_WIDTH / 2, 256);

  if (flash === "gold") {
    ctx.fillStyle = "#ffd76a";
    ctx.font = "700 22px 'Courier New', monospace";
    ctx.fillText("★ RINGS THE BELL ★", CANVAS_WIDTH / 2, 320);
  } else if (frozen) {
    ctx.fillStyle = "#6a7a72";
    ctx.font = "600 18px 'Courier New', monospace";
    ctx.fillText("— FROZEN —", CANVAS_WIDTH / 2, 320);
  }
}

/**
 * One gauge screen at the trading pit, rendered on the same Poly Pizza
 * monitor model as the desk terminals (`DeskMonitor`) — just fed a
 * per-instance canvas-texture material (same technique as
 * PlayerLabelBillboard/WorldClockDisplay's CityLabel) instead of the shared
 * static screen material, redrawn on a timer while a token is live so the
 * market-cap number keeps ticking, or immediately when the slot's
 * occupancy/flash state changes.
 */
export function BellPitGaugeDisplay({ slot, position, rotationY, frozen = false, flash = null }: BellPitGaugeDisplayProps) {
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
      name: "bell-pit-gauge",
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      mipmaps: false,
    });
    texture.setSource(canvas);
    textureRef.current = texture;

    const gaugeMaterial = new StandardMaterial();
    gaugeMaterial.diffuse.set(1, 1, 1);
    gaugeMaterial.diffuseMap = texture;
    gaugeMaterial.opacityMap = texture;
    gaugeMaterial.opacityMapChannel = "a";
    gaugeMaterial.blendType = BLEND_NORMAL;
    gaugeMaterial.alphaTest = 0.02;
    gaugeMaterial.emissiveMap = texture;
    gaugeMaterial.emissive.set(1, 1, 1);
    gaugeMaterial.emissiveIntensity = 0.55;
    gaugeMaterial.update();
    setMaterial(gaugeMaterial);

    return () => {
      gaugeMaterial.destroy();
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
    drawGauge(ctx, slot, frozen, flash);
    texture.upload();
  };

  // Immediate redraw whenever the slot's identity/occupancy or the
  // ceremony's frozen/flash state changes, independent of the ticking timer.
  useEffect(() => {
    redraw();
    lastRedrawAtRef.current = Date.now();
  }, [slot.tokenName, slot.ticker, slot.ownerDisplayName, slot.seed, slot.launchedAtMs, frozen, flash]);

  useAppEvent("update", () => {
    if (frozen) return;
    const now = Date.now();
    if (now - lastRedrawAtRef.current < REDRAW_INTERVAL_MS) return;
    lastRedrawAtRef.current = now;
    redraw();
  });

  if (!material) return null;
  return <DeskMonitor position={position} rotationY={rotationY} screenMaterial={material} scaleMultiplier={0.65} />;
}
