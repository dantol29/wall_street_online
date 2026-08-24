import { useEffect, useState } from "react";
import { Entity } from "@playcanvas/react";
import { Render } from "@playcanvas/react/components";
import { useApp, useMaterial } from "@playcanvas/react/hooks";
import { BLEND_NORMAL, FILTER_LINEAR, StandardMaterial, Texture } from "playcanvas";
import {
  TERMINAL_SCREEN_CENTER_Y,
  TradingTerminalShell,
} from "./TradingTerminalShell";

interface CoinScreenDefinition {
  symbol: string;
  logo: string;
}

const COIN_SCREENS: CoinScreenDefinition[] = [
  { symbol: "HYPE", logo: "/assets/token-logos/hype.svg" },
  { symbol: "SOL", logo: "/assets/token-logos/sol.svg" },
  { symbol: "PEPE", logo: "/assets/token-logos/pepe.svg" },
  { symbol: "FART", logo: "/assets/token-logos/fart.svg" },
  { symbol: "LIT", logo: "/assets/token-logos/lit.svg" },
  { symbol: "NEAR", logo: "/assets/token-logos/near.svg" },
  { symbol: "GOLD", logo: "/assets/token-logos/gold.svg" },
  { symbol: "MU", logo: "/assets/token-logos/mu.svg" },
  { symbol: "NVDA", logo: "/assets/token-logos/nvda.svg" },
  { symbol: "SILVER", logo: "/assets/token-logos/sliver.svg" },
  { symbol: "SPCX", logo: "/assets/token-logos/spcx.svg" },
  { symbol: "TSLA", logo: "/assets/token-logos/tsla.svg" },
];

const SCREEN_X = [-11.5, -4, 4, 11.5] as const;
const SCREEN_Z = [-10, 0, 10] as const;
// Occupied by the full interactive HYPE trading stand rendered by TokenMonitor.
const INTERACTIVE_TOKEN_STAND = { x: -11.5, z: -10 } as const;
const CHILL_ZONE_STAND = { x: -11.5, z: 0 } as const;

/**
 * Uses the exact SVG files shown by TokenDock's <img>, rasterized through a
 * browser image/canvas before upload. PlayCanvas's asset texture loader was
 * turning those SVGs into white surfaces, while browsers render them correctly.
 */
function useTokenPickerLogoMaterial(logo: string, symbol: string): StandardMaterial | null {
  const app = useApp();
  const [material, setMaterial] = useState<StandardMaterial | null>(null);

  useEffect(() => {
    let disposed = false;
    let texture: Texture | null = null;
    let logoMaterial: StandardMaterial | null = null;
    const image = new Image();
    image.onload = () => {
      if (disposed) return;
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(image, 16, 16, 480, 480);

      texture = new Texture(app.graphicsDevice, {
        name: `token-picker-logo-${symbol.toLowerCase()}`,
        width: canvas.width,
        height: canvas.height,
        mipmaps: true,
        minFilter: FILTER_LINEAR,
        magFilter: FILTER_LINEAR,
      });
      texture.setSource(canvas);
      texture.upload();

      logoMaterial = new StandardMaterial();
      logoMaterial.diffuse.set(0, 0, 0);
      logoMaterial.emissive.set(1, 1, 1);
      logoMaterial.emissiveMap = texture;
      logoMaterial.opacityMap = texture;
      logoMaterial.opacityMapChannel = "a";
      logoMaterial.blendType = BLEND_NORMAL;
      logoMaterial.depthWrite = false;
      logoMaterial.emissiveIntensity = 0.9;
      logoMaterial.update();
      setMaterial(logoMaterial);
    };
    image.src = logo;

    return () => {
      disposed = true;
      image.onload = null;
      setMaterial(null);
      logoMaterial?.destroy();
      texture?.destroy();
    };
  }, [app, logo, symbol]);

  return material;
}

function useStandScreenMaterial(symbol: string): StandardMaterial | null {
  const app = useApp();
  const [material, setMaterial] = useState<StandardMaterial | null>(null);

  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 960;
    canvas.height = 600;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(2, 2);

    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, 480, 300);
    ctx.fillStyle = "#ffffff";
    ctx.font = 'bold 27px "Courier New", monospace';
    ctx.fillText(symbol, 15, 34);
    // Stable per-symbol fake market data: every token gets a distinct chart,
    // but it does not jump around whenever React redraws the canvas.
    let seed = [...symbol].reduce((value, character) => value * 31 + character.charCodeAt(0), 17) >>> 0;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };
    const candles = Array.from({ length: 12 }, (_, index) => {
      const previousClose = index === 0 ? 20 + random() * 180 : 0;
      return { index, previousClose };
    });
    let runningPrice = candles[0].previousClose;
    const market = candles.map(() => {
      const open = runningPrice;
      const close = Math.max(0.01, open * (1 + (random() - 0.47) * 0.09));
      const high = Math.max(open, close) * (1 + random() * 0.035);
      const low = Math.min(open, close) * (1 - random() * 0.035);
      runningPrice = close;
      return { open, close, high, low };
    });
    const firstPrice = market[0].open;
    const lastPrice = market[market.length - 1].close;
    const change = ((lastPrice - firstPrice) / firstPrice) * 100;

    ctx.textAlign = "right";
    ctx.fillStyle = "#ffffff";
    ctx.font = 'bold 22px "Courier New", monospace';
    ctx.fillText(`$${lastPrice.toFixed(2)}`, 465, 28);
    ctx.fillStyle = change >= 0 ? "#33ff33" : "#ff2020";
    ctx.font = 'bold 13px "Courier New", monospace';
    ctx.fillText(`${change >= 0 ? "+" : ""}${change.toFixed(1)}%`, 465, 48);

    ctx.strokeStyle = "#343434";
    ctx.lineWidth = 1;
    for (let x = 46; x <= 466; x += 70) {
      ctx.beginPath(); ctx.moveTo(x, 72); ctx.lineTo(x, 230); ctx.stroke();
    }
    for (let y = 72; y <= 230; y += 40) {
      ctx.beginPath(); ctx.moveTo(46, y); ctx.lineTo(466, y); ctx.stroke();
    }
    const chartMin = Math.min(...market.map((candle) => candle.low));
    const chartMax = Math.max(...market.map((candle) => candle.high));
    const chartRange = chartMax - chartMin || 1;
    const chartY = (value: number) => 224 - ((value - chartMin) / chartRange) * 144;
    market.forEach((candle, index) => {
      const x = 62 + index * 33;
      const color = candle.close >= candle.open ? "#33ff33" : "#ff2020";
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, chartY(candle.high));
      ctx.lineTo(x, chartY(candle.low));
      ctx.stroke();
      const top = chartY(Math.max(candle.open, candle.close));
      const bottom = chartY(Math.min(candle.open, candle.close));
      ctx.fillStyle = color;
      ctx.fillRect(x - 7, top, 14, Math.max(2, bottom - top));
    });

    ctx.textAlign = "left";
    ctx.fillStyle = "#a0a0a0";
    ctx.font = 'bold 12px "Courier New", monospace';
    ctx.fillText("1 BUY", 314, 271);
    ctx.fillText("2 SELL", 398, 271);

    const texture = new Texture(app.graphicsDevice, {
      name: `token-stand-${symbol.toLowerCase()}-screen`,
      width: canvas.width,
      height: canvas.height,
      mipmaps: false,
      minFilter: FILTER_LINEAR,
      magFilter: FILTER_LINEAR,
    });
    texture.setSource(canvas);
    texture.upload();

    const screen = new StandardMaterial();
    screen.diffuse.set(0, 0, 0);
    screen.emissive.set(1, 1, 1);
    screen.emissiveMap = texture;
    screen.emissiveIntensity = 1.05;
    screen.update();
    setMaterial(screen);
    return () => {
      setMaterial(null);
      screen.destroy();
      texture.destroy();
    };
  }, [app, symbol]);

  return material;
}

function CoinScreen({ coin, x, z }: { coin: CoinScreenDefinition; x: number; z: number }) {
  const screenMaterial = useStandScreenMaterial(coin.symbol);
  const logoMaterial = useTokenPickerLogoMaterial(coin.logo, coin.symbol);
  const buttonMaterial = useMaterial({ diffuse: "#1c1c1c", metalness: 0.3, gloss: 0.4 });

  return (
    <TradingTerminalShell
      position={[x, TERMINAL_SCREEN_CENTER_Y, z]}
      screenMaterial={screenMaterial}
      logoMaterial={logoMaterial}
    >
      <Entity position={[0.3, -0.455, 0.076]} scale={[0.25, 0.085, 0.035]}>
        <Render type="box" material={buttonMaterial} />
      </Entity>
      <Entity position={[0.59, -0.455, 0.076]} scale={[0.25, 0.085, 0.035]}>
        <Render type="box" material={buttonMaterial} />
      </Entity>
    </TradingTerminalShell>
  );
}

/** Three spacious rows of launchpad-scale token displays with clear walking lanes between them. */
export function CoinScreenRows() {
  return (
    <>
      {SCREEN_Z.flatMap((z, row) =>
        SCREEN_X.map((x, column) => {
          const coin = COIN_SCREENS[row * SCREEN_X.length + column];
          if (x === INTERACTIVE_TOKEN_STAND.x && z === INTERACTIVE_TOKEN_STAND.z) return null;
          if (x === CHILL_ZONE_STAND.x && z === CHILL_ZONE_STAND.z) return null;
          return <CoinScreen key={coin.symbol} coin={coin} x={x} z={z} />;
        }),
      )}
    </>
  );
}
