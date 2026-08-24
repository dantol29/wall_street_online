import { useEffect, useRef, useState } from "react";
import { Entity } from "@playcanvas/react";
import { Render } from "@playcanvas/react/components";
import { useApp, useAppEvent, useMaterial } from "@playcanvas/react/hooks";
import { BLEND_NORMAL, FILTER_LINEAR, FILTER_NEAREST, StandardMaterial, Texture, type Entity as PcEntity } from "playcanvas";
import { TradingTerminalShell, TERMINAL_SCREEN_CENTER_Y } from "./TradingTerminalShell";
import { VisualBox, VisualCylinder } from "./primitives";
import { FIRST_TOKEN_STAND, NEXT_TOKEN_STAND, TOKEN_STAND_LAYOUT, type TokenStandAddress } from "./tokenRingLayout";
import {
  PhysicalTradeButton,
  TIMEFRAMES,
  TIMEFRAME_INTERVAL_MINUTES,
  drawChart,
  drawHeader,
  type Candle,
} from "./TokenMonitor";

export interface LaunchedMarketToken { name: string; ticker: string; imageUrl?: string; description?: string; soundUrl?: string }

const MALFUNCTIONING_STAND_ADDRESS = "R1-009";

// A sparse authored population makes the exchange read as an accumulated
// market rather than a showroom of identical placeholders. These all reuse the
// same terminal prefab and existing lightweight token-logo assets.
const FAKE_MARKET_TOKENS = new Map<string, LaunchedMarketToken>([
  ["R1-002", { name: "Pepe Reserve", ticker: "PEPE", imageUrl: "/assets/token-logos/pepe.svg", description: "THE FROG NEVER CLOCKS OUT." }],
  ["R1-007", { name: "Fartcoin Capital", ticker: "FART", imageUrl: "/assets/token-logos/fart.svg", description: "A SERIOUS MARKET FOR AN UNSERIOUS ASSET." }],
  ["R1-011", { name: "Sliver", ticker: "SLVR", imageUrl: "/assets/token-logos/sliver.svg", description: "A THIN PIECE OF THE INTERNET ECONOMY." }],
  ["R2-003", { name: "Internet Gold", ticker: "GOLD", imageUrl: "/assets/token-logos/gold.svg", description: "DIGITAL BULLION FOR THE NIGHT SHIFT." }],
  ["R2-008", { name: "Terminal Lit", ticker: "LIT", imageUrl: "/assets/token-logos/lit.svg", description: "THE SCREEN IS STILL ON." }],
  ["R2-014", { name: "Mu Protocol", ticker: "MU", imageUrl: "/assets/token-logos/mu.svg", description: "UNKNOWN PURPOSE. ACTIVE MARKET." }],
  ["R2-017", { name: "Near Midnight", ticker: "NEAR", imageUrl: "/assets/token-logos/near.svg", description: "ALWAYS CLOSER THAN IT APPEARS." }],
  ["R3-004", { name: "Nvidia Inu", ticker: "NVDOG", imageUrl: "/assets/token-logos/nvda.svg", description: "COMPUTE-POWERED SPECULATION." }],
  ["R3-011", { name: "Sol After Dark", ticker: "SOLAD", imageUrl: "/assets/token-logos/sol.svg", description: "THE LATE SESSION NEVER ENDS." }],
  ["R3-018", { name: "Space Exchange", ticker: "SPCX", imageUrl: "/assets/token-logos/spcx.svg", description: "PRICE DISCOVERY ABOVE THE CLOUDS." }],
  ["R4-006", { name: "Meme 500", ticker: "M500", imageUrl: "/assets/token-logos/sp500.svg", description: "FIVE HUNDRED MEMES. ONE INDEX." }],
  ["R4-016", { name: "Tesla Pigeon", ticker: "TSPG", imageUrl: "/assets/token-logos/tsla.svg", description: "AUTONOMOUS FINANCIAL BIRD." }],
]);

let placeholderLogoMaterial: StandardMaterial | null = null;

function usePlaceholderLogoMaterial(): StandardMaterial | null {
  const app = useApp();
  const [material, setMaterial] = useState<StandardMaterial | null>(placeholderLogoMaterial);
  useEffect(() => {
    if (!placeholderLogoMaterial) {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#1d201f";
      ctx.beginPath();
      ctx.arc(128, 128, 126, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#686b68";
      ctx.font = '700 152px "Courier New", monospace';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("?", 128, 137);
      const texture = new Texture(app.graphicsDevice, { name: "empty-token-question", width: 256, height: 256, mipmaps: true, minFilter: FILTER_LINEAR, magFilter: FILTER_LINEAR });
      texture.setSource(canvas);
      texture.upload();
      placeholderLogoMaterial = new StandardMaterial();
      placeholderLogoMaterial.diffuse.set(0, 0, 0);
      placeholderLogoMaterial.emissive.set(0.2, 0.21, 0.2);
      placeholderLogoMaterial.emissiveMap = texture;
      placeholderLogoMaterial.opacityMap = texture;
      placeholderLogoMaterial.opacityMapChannel = "a";
      placeholderLogoMaterial.blendType = BLEND_NORMAL;
      placeholderLogoMaterial.depthWrite = false;
      placeholderLogoMaterial.emissiveIntensity = 0.12;
      placeholderLogoMaterial.update();
    }
    setMaterial(placeholderLogoMaterial);
  }, [app]);
  return material;
}

function drawImageCover(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, size: number): void {
  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
  const sourceX = (image.naturalWidth - sourceSize) / 2;
  const sourceY = (image.naturalHeight - sourceSize) / 2;
  ctx.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, x, y, size, size);
}

function useStandScreen(token: LaunchedMarketToken | null, address: string, enabled = true, announcing = false): StandardMaterial | null {
  const app = useApp();
  const [material, setMaterial] = useState<StandardMaterial | null>(null);
  useEffect(() => {
    if (!enabled) {
      setMaterial(null);
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = 300;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#050606";
    ctx.fillRect(0, 0, 480, 300);
    if (token && announcing) {
      ctx.fillStyle = "#d8c99e";
      ctx.font = '700 25px "Courier New", monospace';
      ctx.fillText("NEW LISTING", 24, 42);
      ctx.save();
      ctx.beginPath();
      ctx.arc(112, 157, 76, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = "#242724";
      ctx.fillRect(36, 81, 152, 152);
      ctx.restore();
      ctx.fillStyle = "#8b8e89";
      ctx.font = '700 18px "Courier New", monospace';
      const description = (token.description ?? "A NEW MARKET HAS JUST OPENED FOR TRADING.").toUpperCase();
      const words = description.split(/\s+/);
      const lines: string[] = [];
      let line = "";
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (ctx.measureText(candidate).width > 235 && line) {
          lines.push(line);
          line = word;
        } else {
          line = candidate;
        }
      }
      if (line) lines.push(line);
      lines.slice(0, 4).forEach((text, index) => ctx.fillText(text, 214, 122 + index * 26));
    } else if (token) {
      const now = Date.now();
      const candles: Candle[] = Array.from({ length: 12 }, (_, index) => {
        const baseline = 0.36 + index * 0.005 + Math.sin(index * 0.8 + token.ticker.length) * 0.025;
        const close = baseline + Math.sin(index * 1.7) * 0.018;
        return {
          time: now - (11 - index) * 60 * 60_000,
          open: baseline,
          close,
          high: Math.max(baseline, close) + 0.016,
          low: Math.min(baseline, close) - 0.014,
        };
      });
      drawHeader(ctx, { symbol: token.ticker, price: "$0.4200", changePercent: 18.4 });
      drawChart(ctx, candles, TIMEFRAMES[1], TIMEFRAME_INTERVAL_MINUTES[1]);
    } else {
      ctx.fillStyle = "#5a5d5a";
      ctx.font = '700 30px "Courier New", monospace';
      ctx.fillText("EMPTY STAND", 24, 62);
      ctx.fillStyle = "#292c2a";
      ctx.font = '700 19px "Courier New", monospace';
      ctx.fillText("AWAITING TOKEN LAUNCH", 24, 103);
      ctx.strokeStyle = "#292c2b";
      ctx.lineWidth = 2;
      ctx.strokeRect(24, 140, 432, 76);
      ctx.font = '700 38px "Courier New", monospace';
      ctx.fillText("+", 222, 194);
    }
    if (!token || announcing) {
      ctx.fillStyle = "#8b8e89";
      ctx.font = '700 18px "Courier New", monospace';
      ctx.fillText(address, 24, 274);
    }
    const texture = new Texture(app.graphicsDevice, { name: `ring-screen-${address}`, width: 480, height: 300, mipmaps: false, minFilter: FILTER_LINEAR, magFilter: FILTER_LINEAR });
    texture.setSource(canvas);
    texture.upload();
    let disposed = false;
    if (token && announcing && token.imageUrl) {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => {
        if (disposed) return;
        ctx.save();
        ctx.beginPath();
        ctx.arc(112, 157, 76, 0, Math.PI * 2);
        ctx.clip();
        drawImageCover(ctx, image, 36, 81, 152);
        ctx.restore();
        texture.upload();
      };
      image.src = token.imageUrl;
    } else if (token && announcing) {
      ctx.fillStyle = "#d8c99e";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = '700 62px "Courier New", monospace';
      ctx.fillText(token.ticker.slice(0, 2), 112, 160);
      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
      texture.upload();
    }
    const screen = new StandardMaterial();
    screen.diffuse.set(0, 0, 0);
    screen.emissive.set(1, 1, 1);
    screen.emissiveMap = texture;
    screen.emissiveIntensity = token ? 0.72 : 0.13;
    screen.update();
    setMaterial(screen);
    return () => { disposed = true; setMaterial(null); screen.destroy(); texture.destroy(); };
  }, [address, announcing, app, enabled, token]);
  return material;
}

function useLaunchedTokenLogo(token: LaunchedMarketToken | undefined): StandardMaterial | null {
  const app = useApp();
  const [material, setMaterial] = useState<StandardMaterial | null>(null);
  useEffect(() => {
    if (!token) {
      setMaterial(null);
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const drawFallback = () => {
      ctx.clearRect(0, 0, 256, 256);
      ctx.fillStyle = "#40382d";
      ctx.beginPath();
      ctx.arc(128, 128, 126, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#e4d8b8";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = '700 88px "Courier New", monospace';
      ctx.fillText(token.ticker.slice(0, 2), 128, 135);
    };
    drawFallback();
    const texture = new Texture(app.graphicsDevice, { name: `launched-logo-${token.ticker}`, width: 256, height: 256, mipmaps: true, minFilter: FILTER_LINEAR, magFilter: FILTER_LINEAR });
    texture.setSource(canvas);
    texture.upload();
    const logo = new StandardMaterial();
    logo.diffuse.set(0, 0, 0);
    logo.emissive.set(0.82, 0.82, 0.78);
    logo.emissiveMap = texture;
    logo.opacityMap = texture;
    logo.opacityMapChannel = "a";
    logo.blendType = BLEND_NORMAL;
    logo.depthWrite = false;
    logo.emissiveIntensity = 0.32;
    logo.update();
    setMaterial(logo);
    let disposed = false;
    if (token.imageUrl) {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => {
        if (disposed) return;
        ctx.clearRect(0, 0, 256, 256);
        ctx.save();
        ctx.beginPath();
        ctx.arc(128, 128, 126, 0, Math.PI * 2);
        ctx.clip();
        drawImageCover(ctx, image, 2, 2, 252);
        ctx.restore();
        texture.upload();
      };
      image.onerror = drawFallback;
      image.src = token.imageUrl;
    }
    return () => { disposed = true; setMaterial(null); logo.destroy(); texture.destroy(); };
  }, [app, token]);
  return material;
}

function useMalfunctioningScreen(address: string, enabled: boolean): StandardMaterial | null {
  const app = useApp();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textureRef = useRef<Texture | null>(null);
  const elapsedRef = useRef(0);
  const [material, setMaterial] = useState<StandardMaterial | null>(null);

  useEffect(() => {
    if (!enabled) {
      setMaterial(null);
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 100;
    canvasRef.current = canvas;
    const texture = new Texture(app.graphicsDevice, {
      name: `malfunction-static-${address}`,
      width: canvas.width,
      height: canvas.height,
      mipmaps: false,
      minFilter: FILTER_NEAREST,
      magFilter: FILTER_NEAREST,
    });
    texture.setSource(canvas);
    textureRef.current = texture;
    const screen = new StandardMaterial();
    screen.diffuse.set(0, 0, 0);
    screen.emissive.set(0.55, 0.57, 0.54);
    screen.emissiveMap = texture;
    screen.emissiveIntensity = 0.2;
    screen.update();
    setMaterial(screen);
    return () => {
      setMaterial(null);
      canvasRef.current = null;
      textureRef.current = null;
      screen.destroy();
      texture.destroy();
    };
  }, [address, app, enabled]);

  useAppEvent("update", (dt) => {
    if (!enabled) return;
    elapsedRef.current += dt;
    if (elapsedRef.current < 0.1) return;
    elapsedRef.current = 0;
    const canvas = canvasRef.current;
    const texture = textureRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !texture || !ctx) return;
    const image = ctx.createImageData(canvas.width, canvas.height);
    for (let offset = 0; offset < image.data.length; offset += 4) {
      const value = Math.random() < 0.08 ? 175 : Math.floor(Math.random() * 72);
      image.data[offset] = value;
      image.data[offset + 1] = value;
      image.data[offset + 2] = value;
      image.data[offset + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    ctx.fillStyle = "rgba(225, 225, 215, 0.16)";
    ctx.fillRect(0, Math.floor(Math.random() * canvas.height), canvas.width, 2);
    texture.upload();
  });

  return material;
}

function useMalfunctioningLogo(enabled: boolean): StandardMaterial | null {
  const app = useApp();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textureRef = useRef<Texture | null>(null);
  const elapsedRef = useRef(0);
  const [material, setMaterial] = useState<StandardMaterial | null>(null);

  useEffect(() => {
    if (!enabled) {
      setMaterial(null);
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 96;
    canvasRef.current = canvas;
    const texture = new Texture(app.graphicsDevice, {
      name: "malfunction-logo-static",
      width: canvas.width,
      height: canvas.height,
      mipmaps: false,
      minFilter: FILTER_NEAREST,
      magFilter: FILTER_NEAREST,
    });
    texture.setSource(canvas);
    textureRef.current = texture;
    const logo = new StandardMaterial();
    logo.diffuse.set(0, 0, 0);
    logo.emissive.set(0.52, 0.54, 0.51);
    logo.emissiveMap = texture;
    logo.opacityMap = texture;
    logo.opacityMapChannel = "a";
    logo.blendType = BLEND_NORMAL;
    logo.depthWrite = false;
    logo.emissiveIntensity = 0.18;
    logo.update();
    setMaterial(logo);
    return () => {
      setMaterial(null);
      canvasRef.current = null;
      textureRef.current = null;
      logo.destroy();
      texture.destroy();
    };
  }, [app, enabled]);

  useAppEvent("update", (dt) => {
    if (!enabled) return;
    elapsedRef.current += dt;
    if (elapsedRef.current < 0.1) return;
    elapsedRef.current = 0;
    const canvas = canvasRef.current;
    const texture = textureRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !texture || !ctx) return;
    const image = ctx.createImageData(canvas.width, canvas.height);
    const center = canvas.width / 2;
    const radiusSquared = (center - 2) ** 2;
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const offset = (y * canvas.width + x) * 4;
        const inside = (x - center) ** 2 + (y - center) ** 2 <= radiusSquared;
        const value = Math.random() < 0.08 ? 180 : Math.floor(Math.random() * 76);
        image.data[offset] = value;
        image.data[offset + 1] = value;
        image.data[offset + 2] = value;
        image.data[offset + 3] = inside ? 255 : 0;
      }
    }
    ctx.putImageData(image, 0, 0);
    texture.upload();
  });

  return material;
}

function FullTokenStand({ slot, launched, announcing = false, soundPlaying = false }: { slot: TokenStandAddress; launched?: LaunchedMarketToken; announcing?: boolean; soundPlaying?: boolean }) {
  const canMalfunction = !launched && slot.address === MALFUNCTIONING_STAND_ADDRESS;
  const normalScreen = useStandScreen(launched ?? null, slot.address, !canMalfunction, announcing);
  const malfunctioningScreen = useMalfunctioningScreen(slot.address, canMalfunction);
  const malfunctioningLogo = useMalfunctioningLogo(canMalfunction);
  const launchedLogo = useLaunchedTokenLogo(launched);
  const placeholderLogo = usePlaceholderLogoMaterial();
  const controlMaterial = useMaterial({ diffuse: "#1c1c1c", metalness: 0.3, gloss: 0.4 });
  return (
    <TradingTerminalShell
      position={[slot.x, TERMINAL_SCREEN_CENTER_Y, slot.z]}
      rotation={[0, slot.rotationY, 0]}
      screenMaterial={canMalfunction ? malfunctioningScreen : normalScreen}
      logoMaterial={launched ? launchedLogo : canMalfunction ? malfunctioningLogo : placeholderLogo}
      logoBorderActive={soundPlaying}
    >
      {launched && !announcing && (
        <>
          {[-0.745, -0.68, -0.615, -0.55].map((x) => (
            <VisualCylinder key={x} position={[x, -0.46, 0.058]} rotation={[90, 0, 0]} radius={0.024} height={0.016} material={controlMaterial} />
          ))}
          <PhysicalTradeButton label="BUY" x={0.585} pressId={0} />
          <PhysicalTradeButton label="SELL" x={0.745} pressId={0} />
        </>
      )}
    </TradingTerminalShell>
  );
}

function SimplifiedTokenStand({ slot, far }: { slot: TokenStandAddress; far: boolean }) {
  const body = useMaterial({ diffuse: "#171a1c", gloss: 0.12, metalness: 0.28 });
  const screen = useMaterial({ diffuse: "#030404", emissive: "#0b0d0c", emissiveIntensity: 0.045, gloss: 0.05 });
  const logo = useMaterial({ diffuse: "#373a39", emissive: "#000000", emissiveIntensity: 0, gloss: 0.1 });
  const placeholderLogo = usePlaceholderLogoMaterial();
  const logoY = far ? 1.82 : 2.25;
  const logoSize = far ? 0.53 : 0.65;
  return (
    <Entity position={[slot.x, 0, slot.z]} rotation={[0, slot.rotationY, 0]}>
      <VisualBox position={[0, far ? 0.72 : 0.55, 0]} size={[far ? 0.12 : 0.18, far ? 1.35 : 1.05, 0.13]} material={body} />
      {!far && <VisualBox position={[0, 1.48, 0]} size={[1.42, 0.86, 0.11]} material={body} />}
      {!far && <VisualBox position={[0, 1.5, 0.065]} size={[1.3, 0.72, 0.018]} material={screen} />}
      <VisualCylinder position={[0, logoY, 0]} rotation={[90, 0, 0]} radius={far ? 0.28 : 0.34} height={0.07} material={logo} />
      {placeholderLogo && (
        <Entity position={[0, logoY, 0.04]} rotation={[90, 0, 0]} scale={[logoSize, 1, logoSize]}>
          <Render type="plane" material={placeholderLogo} />
        </Entity>
      )}
    </Entity>
  );
}

export function TokenRingMarket({ launchedToken, launchAnnouncementActive = false, soundPlayingStandAddresses }: { launchedToken?: LaunchedMarketToken | null; launchAnnouncementActive?: boolean; soundPlayingStandAddresses?: ReadonlySet<string> }) {
  const app = useApp();
  const [playerPosition, setPlayerPosition] = useState({ x: 0, z: 2.8 });
  const elapsedRef = useRef(0);
  const playerRef = useRef<PcEntity | null>(null);
  useAppEvent("update", (dt) => {
    elapsedRef.current += dt;
    if (elapsedRef.current < 0.3) return;
    elapsedRef.current = 0;
    playerRef.current ??= app.root.findByName("local-player") as PcEntity | null;
    const player = playerRef.current;
    if (!player) return;
    const position = player.getPosition();
    setPlayerPosition((current) => Math.hypot(position.x - current.x, position.z - current.z) > 0.8 ? { x: position.x, z: position.z } : current);
  });

  return (
    <>
      {TOKEN_STAND_LAYOUT.map((slot) => {
        if (slot.address === FIRST_TOKEN_STAND.address) return null;
        if (launchedToken && slot.address === NEXT_TOKEN_STAND.address) return null;
        const fakeToken = FAKE_MARKET_TOKENS.get(slot.address);
        if (fakeToken) {
          return (
            <FullTokenStand
              key={slot.address}
              slot={slot}
              launched={fakeToken}
              soundPlaying={soundPlayingStandAddresses?.has(slot.address)}
            />
          );
        }
        const distance = Math.hypot(slot.x - playerPosition.x, slot.z - playerPosition.z);
        return distance <= 25
          ? <FullTokenStand key={slot.address} slot={slot} />
          : <SimplifiedTokenStand key={slot.address} slot={slot} far={distance > 23} />;
      })}
      {launchedToken && (
        <FullTokenStand
          slot={NEXT_TOKEN_STAND}
          launched={launchedToken}
          announcing={launchAnnouncementActive}
          soundPlaying={soundPlayingStandAddresses?.has(NEXT_TOKEN_STAND.address)}
        />
      )}
    </>
  );
}
