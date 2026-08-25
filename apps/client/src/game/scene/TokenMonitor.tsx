import { useEffect, useRef, useState } from "react";
import { Entity } from "@playcanvas/react";
import { Render } from "@playcanvas/react/components";
import { useApp, useMaterial } from "@playcanvas/react/hooks";
import { BLEND_NORMAL, FILTER_LINEAR, StandardMaterial, Texture, Vec3, type Entity as PcEntity } from "playcanvas";
import {
  TERMINAL_SCREEN_CENTER_Y,
  TERMINAL_SCREEN_SIZE,
  TradingTerminalShell,
} from "./TradingTerminalShell";
import { FIRST_TOKEN_STAND } from "./tokenRingLayout";

/**
 * Single-monitor prototype of the token info screen: header (symbol + live
 * price/change) and a price-history candlestick chart, fed entirely by
 * HyperLiquid's public live market data — no mock/fake data. Same
 * canvas-texture technique as TickerDisplay.tsx (draw to an offscreen 2D
 * canvas, upload as a live PlayCanvas Texture), but with linear filtering
 * for legible text instead of a deliberately blocky LED look.
 */

/** HYPE's slot in the north row of freestanding token displays. */
export const MONITOR_POSITION: [number, number, number] = [FIRST_TOKEN_STAND.x, TERMINAL_SCREEN_CENTER_Y, FIRST_TOKEN_STAND.z];
export const MONITOR_INTERACTION_DISTANCE_METERS = 2.2;
const MONITOR_SIZE = TERMINAL_SCREEN_SIZE;

const CANVAS_WIDTH = 480;
const CANVAS_HEIGHT = 300;

const BACKGROUND_COLOR = "#000000";
const TEXT_COLOR = "#ffffff";
const DIM_TEXT_COLOR = "#888888";
const POSITIVE_COLOR = "#33ff33";
const NEGATIVE_COLOR = "#ff2020";

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface HeaderToken {
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
export const TIMEFRAME_INTERVAL_MINUTES = [5, 60, 360, 1440];

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

export function drawHeader(ctx: CanvasRenderingContext2D, token: HeaderToken) {
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
export function drawChart(ctx: CanvasRenderingContext2D, candles: Candle[], timeframeLabel: string, intervalMinutes: number) {
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
  tradePress: { side: "buy" | "sell"; id: number; sourceSessionId: string } | null;
  soundPlaying?: boolean;
}

export function useCoinLogoMaterial(path: string, name: string): StandardMaterial | null {
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
      canvas.width = 256;
      canvas.height = 256;
      canvas.getContext("2d")?.drawImage(image, 0, 0, 256, 256);
      texture = new Texture(app.graphicsDevice, { name, width: 256, height: 256, mipmaps: true, minFilter: FILTER_LINEAR, magFilter: FILTER_LINEAR });
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
      logoMaterial.emissiveIntensity = 0.85;
      logoMaterial.update();
      setMaterial(logoMaterial);
    };
    image.src = path;
    return () => {
      disposed = true;
      image.onload = null;
      setMaterial(null);
      logoMaterial?.destroy();
      texture?.destroy();
    };
  }, [app, name, path]);
  return material;
}

const TRADE_BUTTON_Y = -(MONITOR_SIZE[1] / 2) + 0.015;
const TRADE_BUTTON_Z = MONITOR_SIZE[2] / 2 + 0.035;
const TRADE_CHUTE_WIDTH = 0.14;
const TRADE_CHUTE_HEIGHT = 0.075;
const TRADE_CHUTE_DEPTH = 0.025;
const TRADE_BUTTON_SPACING = 0.16;
const TRADE_BUTTON_ROW_END_X = MONITOR_SIZE[0] / 2 - 0.08;
const COIN_THROW_DURATION_MS = 520;

export function PhysicalTradeButton({ label, x, pressId, sourceSessionId, sellLogoUrl = "/assets/token-logos/hype.svg" }: { label: string; x: number; pressId: number; sourceSessionId?: string; sellLogoUrl?: string }) {
  const app = useApp();
  const holeRef = useRef<PcEntity | null>(null);
  const rimRef = useRef<PcEntity | null>(null);
  const coinRef = useRef<PcEntity | null>(null);
  const rimMaterial = useMaterial({ diffuse: "#343536", gloss: 0.18, metalness: 0.42 });
  const holeMaterial = useMaterial({ diffuse: "#030404", gloss: 0.03, metalness: 0.08 });
  const buying = label === "BUY";
  const coinMaterial = useMaterial({
    diffuse: buying ? "#2775ca" : "#062821",
    emissive: buying ? "#0b2850" : "#0b3b30",
    emissiveIntensity: 0.14,
    gloss: 0.36,
    metalness: 0.45,
  });
  const usdcCoinFaceMaterial = useCoinLogoMaterial("/assets/ui/usdc.svg", "trade-coin-usdc-face");
  const tokenCoinFaceMaterial = useCoinLogoMaterial(sellLogoUrl, `trade-coin-${sellLogoUrl}-face`);
  const coinFaceMaterial = buying ? usdcCoinFaceMaterial : tokenCoinFaceMaterial;

  useEffect(() => {
    if (pressId === 0) return;
    const hole = holeRef.current;
    const rim = rimRef.current;
    const coin = coinRef.current;
    const localPlayer = app.root.findByName("local-player") as PcEntity | null;
    const player = !sourceSessionId || sourceSessionId === "local"
      ? localPlayer
      : app.root.findByName(`remote-${sourceSessionId}`) as PcEntity | null
        ?? (sourceSessionId === localPlayer?.name ? localPlayer : null);
    if (!hole || !coin || !player) return;
    const worldStart = player.getPosition().clone();
    worldStart.y += 0.72;
    const localStart = new Vec3();
    hole.getWorldTransform().clone().invert().transformPoint(worldStart, localStart);
    coin.enabled = true;
    coin.setLocalScale(0.72, 0.72, 0.72);
    let frame = 0;
    let impactResetTimer = 0;
    let impacted = false;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / COIN_THROW_DURATION_MS, 1);
      const eased = t * t * (3 - 2 * t);
      coin.setLocalPosition(
        localStart.x * (1 - eased),
        localStart.y * (1 - eased) - 0.025 * eased + Math.sin(t * Math.PI) * 0.18,
        localStart.z * (1 - eased) + 0.075 * eased,
      );
      // Starting value after the 540-degree version read as excessive: a
      // one-third turn keeps the logo moving but identifiable throughout.
      // Pass when observers can identify the coin before it reaches the hole.
      coin.setLocalEulerAngles(0, t * 120, 0);
      const appearScale = Math.min(1, 0.72 + t * 2.8);
      const sinkScale = t > 0.82 ? Math.max(0.12, 1 - ((t - 0.82) / 0.18) * 0.88) : 1;
      coin.setLocalScale(appearScale * sinkScale, appearScale * sinkScale, appearScale * sinkScale);
      if (t >= 0.9 && !impacted) {
        impacted = true;
        // Keep the physical scale response neutral: receiving a coin should
        // not change the Buy/Sell hole's material or color.
        rim?.setLocalScale(TRADE_CHUTE_WIDTH * 1.08, TRADE_CHUTE_HEIGHT * 1.08, TRADE_CHUTE_DEPTH);
        const impactAudio = new Audio("/assets/audio/terminal/transaction-click.wav");
        impactAudio.volume = 0.16;
        void impactAudio.play().catch(() => undefined);
        impactResetTimer = window.setTimeout(() => {
          rim?.setLocalScale(TRADE_CHUTE_WIDTH, TRADE_CHUTE_HEIGHT, TRADE_CHUTE_DEPTH);
        }, 160);
      }
      if (t < 1) frame = requestAnimationFrame(tick);
      else {
        coin.enabled = false;
        coin.setLocalScale(1, 1, 1);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(impactResetTimer);
      coin.enabled = false;
      coin.setLocalScale(1, 1, 1);
      rim?.setLocalScale(TRADE_CHUTE_WIDTH, TRADE_CHUTE_HEIGHT, TRADE_CHUTE_DEPTH);
    };
  }, [app, pressId, rimMaterial, sourceSessionId]);
  return (
    <Entity ref={holeRef} position={[x, TRADE_BUTTON_Y, TRADE_BUTTON_Z]}>
      {/* Angled counting-machine chute. Starting value: 520ms throw duration.
          Pass when an observer can identify source and destination in one view;
          shorten it if input feels delayed, lengthen it if the coin is unreadable. */}
      <Entity ref={rimRef} scale={[TRADE_CHUTE_WIDTH, TRADE_CHUTE_HEIGHT, TRADE_CHUTE_DEPTH]}>
        <Render type="box" material={rimMaterial} />
      </Entity>
      {/* Compact receiver housing: the angled tray feeds into this box, which
          reads as the mechanism that counts/processes the deposited coin. */}
      <Entity position={[0, -0.085, -0.018]} scale={[0.155, 0.12, 0.1]}>
        <Render type="box" material={rimMaterial} />
      </Entity>
      <Entity position={[0, -0.084, 0.034]} scale={[0.09, 0.025, 0.008]}>
        <Render type="box" material={holeMaterial} />
      </Entity>
      <Entity position={[0, -0.003, 0.014]} scale={[0.105, 0.043, 0.012]}>
        <Render type="box" material={holeMaterial} />
      </Entity>
      <Entity position={[0, -0.049, 0.055]} rotation={[-18, 0, 0]} scale={[0.14, 0.022, 0.095]}>
        <Render type="box" material={rimMaterial} />
      </Entity>
      <Entity position={[0, -0.038, 0.059]} rotation={[-18, 0, 0]} scale={[0.105, 0.008, 0.068]}>
        <Render type="box" material={holeMaterial} />
      </Entity>
      <Entity position={[-0.064, -0.033, 0.052]} rotation={[-18, 0, 0]} scale={[0.012, 0.055, 0.09]}>
        <Render type="box" material={rimMaterial} />
      </Entity>
      <Entity position={[0.064, -0.033, 0.052]} rotation={[-18, 0, 0]} scale={[0.012, 0.055, 0.09]}>
        <Render type="box" material={rimMaterial} />
      </Entity>
      <Entity ref={coinRef} enabled={false}>
        <Entity rotation={[90, 0, 0]} scale={[0.085, 0.014, 0.085]}>
          <Render type="cylinder" material={coinMaterial} />
        </Entity>
        {coinFaceMaterial && (
          <Entity position={[0, 0, 0.009]} rotation={[90, 0, 0]} scale={[0.075, 1, 0.075]}>
            <Render type="plane" material={coinFaceMaterial} />
          </Entity>
        )}
      </Entity>
    </Entity>
  );
}

export function TokenMonitor({ activeTimeframeIndex, tradePress, soundPlaying = false }: TokenMonitorProps) {
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
      rotation={[0, FIRST_TOKEN_STAND.rotationY, 0]}
      screenMaterial={screenMaterial}
      logoMaterial={tokenSignMaterial}
      logoBorderActive={soundPlaying}
      terminalLightActive
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
        sourceSessionId={tradePress?.side === "buy" ? tradePress.sourceSessionId : undefined}
      />
      <PhysicalTradeButton
        label="SELL"
        x={TRADE_BUTTON_ROW_END_X}
        pressId={tradePress?.side === "sell" ? tradePress.id : 0}
        sourceSessionId={tradePress?.side === "sell" ? tradePress.sourceSessionId : undefined}
      />
    </TradingTerminalShell>
  );
}
