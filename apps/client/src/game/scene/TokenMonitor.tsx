import { useEffect, useState } from "react";
import { Entity } from "@playcanvas/react";
import { Render } from "@playcanvas/react/components";
import { useApp, useMaterial } from "@playcanvas/react/hooks";
import { BLEND_NORMAL, FILTER_LINEAR, StandardMaterial, Texture } from "playcanvas";
import {
  TERMINAL_SCREEN_CENTER_Y,
  TERMINAL_SCREEN_SIZE,
  TradingTerminalShell,
} from "./TradingTerminalShell";

/**
 * Single-monitor prototype of the token info screen: header (symbol + live
 * price/change) and a price-history candlestick chart, fed entirely by
 * HyperLiquid's public live market data — no mock/fake data. Same
 * canvas-texture technique as TickerDisplay.tsx (draw to an offscreen 2D
 * canvas, upload as a live PlayCanvas Texture), but with linear filtering
 * for legible text instead of a deliberately blocky LED look.
 */

/** HYPE's slot in the north row of freestanding token displays. */
export const MONITOR_POSITION: [number, number, number] = [-11.5, TERMINAL_SCREEN_CENTER_Y, -10];
export const MONITOR_INTERACTION_DISTANCE_METERS = 2.2;
const MONITOR_SIZE = TERMINAL_SCREEN_SIZE;

const CANVAS_WIDTH = 480;
const CANVAS_HEIGHT = 300;

const BACKGROUND_COLOR = "#000000";
const TEXT_COLOR = "#ffffff";
const DIM_TEXT_COLOR = "#888888";
const POSITIVE_COLOR = "#33ff33";
const NEGATIVE_COLOR = "#ff2020";

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface HeaderToken {
  symbol: string;
  price: string;
  changePercent: number;
}

/** HyperLiquid's public market-data endpoint — no auth required, CORS-open (`access-control-allow-origin: *`), confirmed live. */
const HYPERLIQUID_INFO_URL = "https://api.hyperliquid.xyz/info";
const LIVE_COIN = "HYPE";
/** HyperLiquid's actual candle intervals, matching TIMEFRAMES by index (their valid set has no "6h", so that bucket uses the closest one, "4h"). */
const HYPERLIQUID_INTERVAL_BY_TIMEFRAME = ["5m", "1h", "4h", "1d"];
const LIVE_CANDLE_COUNT = 12;

interface LiveTokenSummary {
  price: string;
  changePercent: number;
}

async function fetchLiveCandles(
  interval: string,
  intervalMinutes: number,
  signal: AbortSignal,
): Promise<Candle[]> {
  const endTime = Date.now();
  const startTime = endTime - LIVE_CANDLE_COUNT * intervalMinutes * 60_000;
  const response = await fetch(HYPERLIQUID_INFO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "candleSnapshot", req: { coin: LIVE_COIN, interval, startTime, endTime } }),
    signal,
  });
  if (!response.ok) throw new Error(`HyperLiquid API returned ${response.status}`);

  const raw: Array<{ t: number; o: string; h: string; l: string; c: string }> = await response.json();
  return raw.map((candle) => ({
    time: candle.t,
    open: Number(candle.o),
    high: Number(candle.h),
    low: Number(candle.l),
    close: Number(candle.c),
  }));
}

export const TIMEFRAMES = ["5M", "1H", "6H", "1D"];
/** Minutes represented by one candle at each timeframe, matching TIMEFRAMES by index. */
const TIMEFRAME_INTERVAL_MINUTES = [5, 60, 360, 1440];

/** Small physical controls mounted into the terminal's lower bezel. */
const BUTTON_RADIUS = 0.024;
const BUTTON_DEPTH = 0.016;
const BUTTON_SPACING = 0.065;
const BUTTON_ROW_START_X = -(MONITOR_SIZE[0] / 2) + 0.08;
const BUTTON_PRESS_TRAVEL = 0.006;
const BUTTON_ROW_Y = -(MONITOR_SIZE[1] / 2) + 0.05;

function changeColor(value: number): string {
  return value >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR;
}

function drawHeader(ctx: CanvasRenderingContext2D, token: HeaderToken) {
  ctx.fillStyle = TEXT_COLOR;
  ctx.font = `bold 26px "Courier New", monospace`;
  ctx.textBaseline = "top";
  ctx.fillText(token.symbol, 14, 12);

  ctx.textAlign = "right";
  ctx.font = `bold 26px "Courier New", monospace`;
  ctx.fillStyle = TEXT_COLOR;
  ctx.fillText(token.price, CANVAS_WIDTH - 14, 12);
  ctx.font = `bold 16px "Courier New", monospace`;
  ctx.fillStyle = changeColor(token.changePercent);
  const arrow = token.changePercent >= 0 ? "▲" : "▼";
  ctx.fillText(`${arrow} ${token.changePercent >= 0 ? "+" : ""}${token.changePercent}%`, CANVAS_WIDTH - 14, 42);
  ctx.textAlign = "left";
}

/** Large HYPE mark for identifying the active market from across the room. */
function drawTokenSign(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#062821";
  ctx.beginPath();
  ctx.arc(128, 128, 112, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(16, 16);
  ctx.scale(2.24, 2.24);
  ctx.fillStyle = "#97fce4";
  ctx.fill(
    new Path2D(
      "M86 49.1667C86 72.8049 71.433 80.3899 63.7578 73.6361C57.4402 68.1291 55.5605 56.492 46.058 55.2971C33.9971 53.7904 32.9528 69.7398 25.0167 69.7398C15.7752 69.7398 14 56.388 14 49.5303C14 42.5167 15.984 32.9575 23.868 32.9575C33.0573 32.9575 33.5794 46.621 45.066 45.8936C56.5003 45.1144 56.7092 30.8794 64.1235 24.801C70.5975 19.5537 86 25.2166 86 49.1667Z",
    ),
  );
  ctx.restore();
}

/** Clock time for a candle's real timestamp — "14:05" for intraday timeframes, a date for the 1D view where a time-of-day would be ambiguous across many days. */
function formatAxisTime(epochMs: number, intervalMinutes: number): string {
  const date = new Date(epochMs);
  if (intervalMinutes >= 1440) {
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/** Candlestick chart — wick (high/low) plus a filled body (open/close) per candle, like a launchpad's price chart, not a smooth line. */
function drawChart(ctx: CanvasRenderingContext2D, candles: Candle[], timeframeLabel: string, intervalMinutes: number) {
  const chartTop = 66;
  const chartHeight = 200;
  const chartLeft = 46;
  const chartWidth = CANVAS_WIDTH - chartLeft - 14;

  ctx.strokeStyle = DIM_TEXT_COLOR;
  ctx.lineWidth = 1;
  ctx.strokeRect(chartLeft, chartTop, chartWidth, chartHeight);

  ctx.font = `bold 12px "Courier New", monospace`;
  ctx.fillStyle = TEXT_COLOR;
  ctx.fillText(timeframeLabel, chartLeft + 6, chartTop + 6);

  if (candles.length === 0) {
    ctx.font = `12px "Courier New", monospace`;
    ctx.fillStyle = DIM_TEXT_COLOR;
    ctx.textAlign = "center";
    ctx.fillText("loading live data…", chartLeft + chartWidth / 2, chartTop + chartHeight / 2);
    ctx.textAlign = "left";
    return;
  }

  const values = candles.flatMap((candle) => [candle.high, candle.low]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const toY = (value: number) => chartTop + chartHeight - ((value - min) / range) * chartHeight;

  // Y axis — price at the top, middle, and bottom of the visible range.
  ctx.font = `10px "Courier New", monospace`;
  ctx.fillStyle = DIM_TEXT_COLOR;
  ctx.textAlign = "right";
  [max, (max + min) / 2, min].forEach((price, i) => {
    const y = chartTop + (i * chartHeight) / 2;
    ctx.fillText(`$${price.toFixed(2)}`, chartLeft - 6, y + (i === 0 ? 8 : i === 2 ? -2 : 4));
  });
  ctx.textAlign = "left";

  const gap = 4;
  const slotWidth = (chartWidth - gap * (candles.length - 1)) / candles.length;
  const bodyWidth = slotWidth * 0.6;
  const candleCenterX = (i: number) => chartLeft + i * (slotWidth + gap) + slotWidth / 2;

  candles.forEach((candle, i) => {
    const centerX = candleCenterX(i);
    const color = changeColor(candle.close - candle.open);

    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(centerX, toY(candle.high));
    ctx.lineTo(centerX, toY(candle.low));
    ctx.stroke();

    const bodyTop = toY(Math.max(candle.open, candle.close));
    const bodyBottom = toY(Math.min(candle.open, candle.close));
    ctx.fillStyle = color;
    ctx.fillRect(centerX - bodyWidth / 2, bodyTop, bodyWidth, Math.max(bodyBottom - bodyTop, 2));
  });

  // X axis — actual clock times for a handful of candles across the visible range.
  ctx.font = `10px "Courier New", monospace`;
  ctx.fillStyle = DIM_TEXT_COLOR;
  ctx.textAlign = "center";
  const lastIndex = candles.length - 1;
  const tickIndices = [0, Math.round(lastIndex / 3), Math.round((lastIndex * 2) / 3), lastIndex];
  new Set(tickIndices).forEach((i) => {
    ctx.fillText(formatAxisTime(candles[i].time, intervalMinutes), candleCenterX(i), chartTop + chartHeight + 14);
  });
  ctx.textAlign = "left";
}

/**
 * Renders the canvas backing store at this multiple of its logical
 * width/height (drawing code stays in logical coordinates via ctx.scale),
 * so text stays crisp instead of getting chunkier as the physical screen
 * grows. Paired with linear filtering below — unlike TickerDisplay's
 * deliberately blocky LED sign, this screen's job is to be read, not to
 * look retro.
 */
const RESOLUTION_SCALE = 2;

/**
 * Builds an offscreen-canvas → PlayCanvas-texture emissive material, per
 * TickerDisplay.tsx's technique (but rendered at RESOLUTION_SCALE with
 * linear filtering, for legible text rather than a blocky LED look).
 * `draw` itself isn't a rerun dependency (it's typically a fresh closure
 * every render) — instead, pass whatever values `draw` actually reads
 * (e.g. `[activeTimeframeIndex]`) via `deps`, so the canvas redraws exactly
 * when that data changes.
 */
function useCanvasScreenMaterial(
  app: ReturnType<typeof useApp>,
  name: string,
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
  deps: unknown[] = [],
  transparent = false,
): StandardMaterial | null {
  const [material, setMaterial] = useState<StandardMaterial | null>(null);

  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = width * RESOLUTION_SCALE;
    canvas.height = height * RESOLUTION_SCALE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(RESOLUTION_SCALE, RESOLUTION_SCALE);
    draw(ctx);

    const texture = new Texture(app.graphicsDevice, {
      name,
      width: canvas.width,
      height: canvas.height,
      mipmaps: false,
      minFilter: FILTER_LINEAR,
      magFilter: FILTER_LINEAR,
    });
    texture.setSource(canvas);
    texture.upload();

    const screenMaterial = new StandardMaterial();
    screenMaterial.diffuse.set(0, 0, 0);
    screenMaterial.emissiveMap = texture;
    screenMaterial.emissive.set(1, 1, 1);
    screenMaterial.emissiveIntensity = 1.1;
    if (transparent) {
      screenMaterial.opacityMap = texture;
      screenMaterial.opacityMapChannel = "a";
      screenMaterial.blendType = BLEND_NORMAL;
      screenMaterial.depthWrite = false;
    }
    screenMaterial.update();
    setMaterial(screenMaterial);

    return () => {
      screenMaterial.destroy();
      texture.destroy();
    };
  }, [app, name, width, height, transparent, ...deps]);

  return material;
}

interface TokenMonitorProps {
  activeTimeframeIndex: number;
  tradePress: { side: "buy" | "sell"; id: number } | null;
}

const TRADE_BUTTON_Y = -(MONITOR_SIZE[1] / 2) + 0.055;
const TRADE_BUTTON_Z = MONITOR_SIZE[2] / 2 + 0.022;
const TRADE_BUTTON_DIAMETER = 0.13;
const TRADE_BUTTON_DEPTH = 0.035;
const TRADE_BUTTON_SPACING = 0.16;
const TRADE_BUTTON_ROW_END_X = MONITOR_SIZE[0] / 2 - 0.08;
const TRADE_BUTTON_COLOR = "#1c1c1c";
const TRADE_BUTTON_TEXT_COLOR = "#ffffff";

function PhysicalTradeButton({ label, x, pressId }: { label: string; x: number; pressId: number }) {
  const app = useApp();
  const [pressDepth, setPressDepth] = useState(0);
  const buttonMaterial = useMaterial({ diffuse: TRADE_BUTTON_COLOR, gloss: 0.4, metalness: 0.3 });

  useEffect(() => {
    if (pressId === 0) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / 180, 1);
      setPressDepth(t < 0.35 ? t / 0.35 : 1 - (t - 0.35) / 0.65);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [pressId]);
  const labelMaterial = useCanvasScreenMaterial(
    app,
    `token-monitor-${label.toLowerCase()}-label`,
    160,
    160,
    (ctx) => {
      ctx.fillStyle = TRADE_BUTTON_TEXT_COLOR;
      ctx.font = `bold 30px "Courier New", monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, 80, 82);
    },
    [label],
    true,
  );

  return (
    <Entity position={[x, TRADE_BUTTON_Y, TRADE_BUTTON_Z - pressDepth * 0.018]}>
      <Entity
        rotation={[90, 0, 0]}
        scale={[TRADE_BUTTON_DIAMETER, TRADE_BUTTON_DEPTH, TRADE_BUTTON_DIAMETER]}
      >
        <Render type="cylinder" material={buttonMaterial} />
      </Entity>
      {labelMaterial && (
        <Entity
          position={[0, 0, TRADE_BUTTON_DEPTH / 2 + 0.001]}
          rotation={[90, 0, 0]}
          scale={[TRADE_BUTTON_DIAMETER * 0.82, 1, TRADE_BUTTON_DIAMETER * 0.82]}
        >
          <Render type="plane" material={labelMaterial} />
        </Entity>
      )}
    </Entity>
  );
}

export function TokenMonitor({ activeTimeframeIndex, tradePress }: TokenMonitorProps) {
  const app = useApp();
  const buttonMaterial = useMaterial({ diffuse: "#1c1c1c", gloss: 0.4, metalness: 0.3 });
  const activeButtonMaterial = useMaterial({
    diffuse: "#1c1c1c",
    emissive: "#4fdc6a",
    emissiveIntensity: 0.55,
  });
  const tokenSignMaterial = useCanvasScreenMaterial(
    app,
    "token-monitor-hype-sign",
    256,
    256,
    drawTokenSign,
    [],
    true,
  );

  const [pressedIndex, setPressedIndex] = useState<number | null>(null);
  const [pressDepth, setPressDepth] = useState(0);

  useEffect(() => {
    setPressedIndex(activeTimeframeIndex);
    let animationFrame = 0;
    const start = performance.now();
    const durationMs = 220;

    const tick = (now: number) => {
      const t = Math.min((now - start) / durationMs, 1);
      const depth = t < 0.4 ? t / 0.4 : 1 - (t - 0.4) / 0.6;
      setPressDepth(Math.max(0, depth));
      if (t < 1) animationFrame = requestAnimationFrame(tick);
      else setPressedIndex(null);
    };

    animationFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrame);
  }, [activeTimeframeIndex]);

  // Live HYPE candles for whichever timeframe is selected. No mock fallback —
  // on network/API failure the chart just keeps showing whatever it last
  // had ("loading live data…" only on the very first fetch). Deliberately
  // NOT reset to null on timeframe change — swapping straight to the new
  // chart once it's ready reads far better than blanking the screen for
  // every fetch's round-trip.
  const [liveCandles, setLiveCandles] = useState<Candle[] | null>(null);
  const [liveSummary, setLiveSummary] = useState<LiveTokenSummary | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchLiveCandles(
      HYPERLIQUID_INTERVAL_BY_TIMEFRAME[activeTimeframeIndex],
      TIMEFRAME_INTERVAL_MINUTES[activeTimeframeIndex],
      controller.signal,
    )
      .then((candles) => {
        if (candles.length === 0) return;
        setLiveCandles(candles);
        const first = candles[0].open;
        const last = candles[candles.length - 1].close;
        setLiveSummary({
          price: `$${last.toFixed(2)}`,
          changePercent: Math.round(((last - first) / first) * 1000) / 10,
        });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.warn("[TokenMonitor] live HyperLiquid fetch failed", error);
      });
    return () => controller.abort();
  }, [activeTimeframeIndex]);

  const candles = liveCandles ?? [];
  const headerToken: HeaderToken = {
    symbol: LIVE_COIN,
    price: liveSummary?.price ?? "…",
    changePercent: liveSummary?.changePercent ?? 0,
  };

  const screenMaterial = useCanvasScreenMaterial(
    app,
    "token-monitor-canvas",
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
    (ctx) => {
      ctx.fillStyle = BACKGROUND_COLOR;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      drawHeader(ctx, headerToken);
      drawChart(ctx, candles, TIMEFRAMES[activeTimeframeIndex], TIMEFRAME_INTERVAL_MINUTES[activeTimeframeIndex]);
    },
    [activeTimeframeIndex, candles, headerToken.price, headerToken.changePercent],
  );

  return (
    <TradingTerminalShell
      position={MONITOR_POSITION}
      screenMaterial={screenMaterial}
      logoMaterial={tokenSignMaterial}
    >
      {TIMEFRAMES.map((label, index) => {
        const travel = index === pressedIndex ? pressDepth * BUTTON_PRESS_TRAVEL : 0;
        return (
          <Entity
            key={label}
            position={[
              BUTTON_ROW_START_X + index * BUTTON_SPACING,
              BUTTON_ROW_Y,
              MONITOR_SIZE[2] / 2 + BUTTON_DEPTH / 2 - travel,
            ]}
            rotation={[90, 0, 0]}
            scale={[BUTTON_RADIUS * 2, BUTTON_DEPTH, BUTTON_RADIUS * 2]}
          >
            <Render
              type="cylinder"
              material={index === activeTimeframeIndex ? activeButtonMaterial : buttonMaterial}
            />
          </Entity>
        );
      })}
      <PhysicalTradeButton
        label="BUY"
        x={TRADE_BUTTON_ROW_END_X - TRADE_BUTTON_SPACING}
        pressId={tradePress?.side === "buy" ? tradePress.id : 0}
      />
      <PhysicalTradeButton
        label="SELL"
        x={TRADE_BUTTON_ROW_END_X}
        pressId={tradePress?.side === "sell" ? tradePress.id : 0}
      />
    </TradingTerminalShell>
  );
}
