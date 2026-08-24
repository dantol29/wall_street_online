import { useEffect, useState } from "react";
import { Entity } from "@playcanvas/react";
import { Render } from "@playcanvas/react/components";
import { useApp, useMaterial } from "@playcanvas/react/hooks";
import { FILTER_LINEAR, StandardMaterial, Texture } from "playcanvas";
import { StaticBox, StaticCylinder, VisualBox, VisualCylinder } from "./primitives";

export const TOKEN_LAUNCH_INTERACTION_POSITION = { x: 0, z: -0.48 } as const;
export const TOKEN_LAUNCH_INTERACTION_DISTANCE_METERS = 1.65;

export interface TokenLaunchDisplayState {
  phase: "idle" | "editing" | "approved" | "countdown" | "live";
  name?: string;
  ticker?: string;
  countdown?: number;
  address?: string;
  imageUrl?: string;
}

type LaunchScreenVariant = "console" | "overhead" | "status";

function useLaunchScreenMaterial(state: TokenLaunchDisplayState, variant: LaunchScreenVariant): StandardMaterial | null {
  const app = useApp();
  const [material, setMaterial] = useState<StandardMaterial | null>(null);

  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 320;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#080a0b";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#282c2e";
    ctx.lineWidth = variant === "status" ? 4 : 8;
    ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ece9df";
    ctx.font = '700 38px "Courier New", monospace';

    if (variant === "status") {
      const status = state.phase === "idle" ? "OPEN FOR LISTING" : state.phase === "editing" ? "CREATING TOKEN" : state.phase === "approved" ? "LISTING APPROVED" : state.phase === "countdown" ? "LAUNCHING" : "LIVE";
      ctx.fillStyle = state.phase === "live" ? "#70cf89" : "#d8c99e";
      ctx.font = '700 42px "Courier New", monospace';
      ctx.fillText(status, 320, 160);
    } else if (state.phase === "idle") {
      ctx.fillText(variant === "console" ? "LAUNCH A TOKEN" : "OPEN FOR LISTING", 320, 112);
      ctx.fillStyle = "#a9aaa6";
      ctx.font = '700 25px "Courier New", monospace';
      ctx.fillText(variant === "console" ? "PRESS E TO START" : "LAUNCH A TOKEN", 320, 205);
    } else if (state.phase === "editing") {
      ctx.fillText(variant === "console" ? "CREATE TOKEN" : "NEXT LAUNCH", 320, 72);
      ctx.fillStyle = "#c7c0b2";
      ctx.font = '700 23px "Courier New", monospace';
      if (variant === "console") {
        ctx.textAlign = "left";
        ctx.fillText("TOKEN NAME", 90, 145);
        ctx.fillText("TICKER", 90, 195);
        ctx.fillText("IMAGE", 90, 245);
        ctx.textAlign = "center";
      } else {
        ctx.fillText("LISTING IN PREPARATION", 320, 188);
      }
    } else if (state.phase === "approved") {
      ctx.font = '700 34px "Courier New", monospace';
      ctx.fillText("LISTING APPROVED", 320, 110);
      ctx.fillStyle = "#d8c99e";
      ctx.font = '700 54px "Courier New", monospace';
      ctx.fillText(`$${state.ticker ?? "TOKEN"}`, 320, 205);
    } else if (state.phase === "countdown") {
      ctx.font = '700 30px "Courier New", monospace';
      ctx.fillText(variant === "console" ? "LAUNCHING" : (state.name || state.ticker || "NEW TOKEN"), 320, 66);
      ctx.fillStyle = "#d8c99e";
      ctx.font = '700 112px "Courier New", monospace';
      ctx.fillText(variant === "console" ? `$${state.ticker ?? "TOKEN"}` : `00:0${state.countdown ?? 3}`, 320, 200);
    } else if (variant === "overhead") {
      ctx.fillStyle = "#d8c99e";
      ctx.font = '700 27px "Courier New", monospace';
      ctx.fillText("NEW", 320, 38);
      ctx.beginPath();
      ctx.arc(146, 166, 82, 0, Math.PI * 2);
      ctx.fillStyle = "#282b28";
      ctx.fill();
      ctx.fillStyle = "#ece9df";
      ctx.font = '700 62px "Courier New", monospace';
      ctx.fillText((state.ticker ?? "?").slice(0, 2), 146, 170);
      ctx.textAlign = "left";
      ctx.font = '700 34px "Courier New", monospace';
      ctx.fillText((state.name || state.ticker || "NEW TOKEN").toUpperCase().slice(0, 15), 260, 142);
      ctx.fillStyle = "#d8c99e";
      ctx.font = '700 24px "Courier New", monospace';
      ctx.fillText(`$${state.ticker ?? "TOKEN"}`, 260, 184);
      ctx.fillStyle = "#8b8e89";
      ctx.font = '700 19px "Courier New", monospace';
      ctx.fillText(state.address ?? "NOW TRADING", 260, 226);
      ctx.textAlign = "center";
    } else {
      ctx.font = '700 36px "Courier New", monospace';
      ctx.fillText(state.name || state.ticker || "NEW TOKEN", 320, 85);
      ctx.fillStyle = "#70cf89";
      ctx.font = '700 86px "Courier New", monospace';
      ctx.fillText("LIVE", 320, 195);
      ctx.fillStyle = "#d8c99e";
      ctx.font = '700 22px "Courier New", monospace';
      ctx.fillText(state.ticker ? `$${state.ticker}` : "NOW TRADING", 320, 277);
    }

    const texture = new Texture(app.graphicsDevice, {
      name: "token-launch-display",
      width: canvas.width,
      height: canvas.height,
      mipmaps: false,
      minFilter: FILTER_LINEAR,
      magFilter: FILTER_LINEAR,
    });
    texture.setSource(canvas);
    texture.upload();
    let disposed = false;
    if (variant === "overhead" && state.phase === "live" && state.imageUrl) {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => {
        if (disposed) return;
        const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
        ctx.save();
        ctx.beginPath();
        ctx.arc(146, 166, 82, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(
          image,
          (image.naturalWidth - sourceSize) / 2,
          (image.naturalHeight - sourceSize) / 2,
          sourceSize,
          sourceSize,
          64,
          84,
          164,
          164,
        );
        ctx.restore();
        texture.upload();
      };
      image.src = state.imageUrl;
    }
    const screen = new StandardMaterial();
    screen.diffuse.set(0, 0, 0);
    screen.emissive.set(1, 1, 1);
    screen.emissiveMap = texture;
    screen.emissiveIntensity = 0.9;
    screen.update();
    setMaterial(screen);
    return () => {
      disposed = true;
      setMaterial(null);
      screen.destroy();
      texture.destroy();
    };
  }, [app, state.address, state.countdown, state.imageUrl, state.name, state.phase, state.ticker, variant]);

  return material;
}

export function TokenLaunchArea({ state }: { state: TokenLaunchDisplayState }) {
  const consoleScreenMaterial = useLaunchScreenMaterial(state, "console");
  const overheadScreenMaterial = useLaunchScreenMaterial(state, "overhead");
  const [buttonPress, setButtonPress] = useState(0);
  useEffect(() => {
    if (state.phase !== "approved") return;
    setButtonPress(0.035);
    const timer = window.setTimeout(() => setButtonPress(0), 180);
    return () => window.clearTimeout(timer);
  }, [state.phase]);

  const stone = useMaterial({ diffuse: "#202326", gloss: 0.1, metalness: 0.02 });
  const insetStone = useMaterial({ diffuse: "#292d30", gloss: 0.08, metalness: 0.02 });
  const metal = useMaterial({ diffuse: "#111416", gloss: 0.18, metalness: 0.38 });
  const frontMetal = useMaterial({ diffuse: "#2b2f31", gloss: 0.12, metalness: 0.22 });
  const trim = useMaterial({ diffuse: "#48433a", gloss: 0.22, metalness: 0.45 });
  const buttonPlate = useMaterial({ diffuse: "#242729", gloss: 0.22, metalness: 0.5 });
  const redButton = useMaterial({
    diffuse: state.phase === "editing" || state.phase === "approved" || state.phase === "countdown" ? "#b52c27" : "#681b19",
    emissive: state.phase === "countdown" ? "#6d1714" : "#170504",
    emissiveIntensity: state.phase === "countdown" ? 0.35 : 0.05,
    gloss: 0.34,
  });
  const edgeLight = useMaterial({
    diffuse: "#3d352d",
    emissive: state.phase === "countdown" ? "#ffd5a8" : "#b68b63",
    emissiveIntensity: state.phase === "countdown" ? 0.55 : 0.12,
    gloss: 0.15,
  });

  return (
    <>
      {/* Starting dimensions: 4.7m podium, 18cm high. Pass when its full edge
          reads from the entrance and several avatars can circulate around it. */}
      <StaticCylinder position={[0, 0.09, 0]} rotation={[0, 0, 0]} radius={2.35} height={0.18} material={metal} />
      <VisualCylinder position={[0, 0.19, 0]} rotation={[0, 0, 0]} radius={2.22} height={0.05} material={stone} />
      <VisualCylinder position={[0, 0.222, 0]} rotation={[0, 0, 0]} radius={1.78} height={0.022} material={insetStone} />
      {Array.from({ length: 12 }, (_, index) => {
        const angle = (index / 12) * Math.PI * 2;
        return (
          <VisualBox
            key={`launch-edge-light-${index}`}
            position={[Math.sin(angle) * 2.3, 0.055, Math.cos(angle) * 2.3]}
            rotation={[0, (index / 12) * 360, 0]}
            size={[0.72, 0.025, 0.035]}
            material={edgeLight}
          />
        );
      })}

      {/* Rear-set, permanent listing console; the south half remains a clear
          standing and approach area. */}
      <StaticBox position={[0, 0.68, -0.48]} size={[1.62, 0.94, 0.92]} material={metal} />
      <VisualBox position={[0, 0.68, 0.005]} size={[1.48, 0.72, 0.055]} material={frontMetal} />
      {consoleScreenMaterial && (
        <>
          <Entity position={[-0.13, 1.275, 0.17]} rotation={[66, 0, 0]} scale={[1.06, 1, 0.46]}>
            <Render type="plane" material={consoleScreenMaterial} />
          </Entity>
          <Entity position={[0.13, 1.275, -1.13]} rotation={[-66, 180, 0]} scale={[1.06, 1, 0.46]}>
            <Render type="plane" material={consoleScreenMaterial} />
          </Entity>
        </>
      )}
      <VisualCylinder position={[0.58, 1.25, 0.24]} rotation={[66, 0, 0]} radius={0.16} height={0.045} material={buttonPlate} />
      <VisualCylinder position={[0.58, 1.3 - buttonPress, 0.285]} rotation={[66, 0, 0]} radius={0.125} height={0.075} material={trim} />
      <VisualCylinder position={[0.58, 1.33 - buttonPress, 0.31]} rotation={[66, 0, 0]} radius={0.105} height={0.08} material={redButton} />
      <VisualCylinder position={[-0.58, 1.25, -1.2]} rotation={[-66, 0, 0]} radius={0.16} height={0.045} material={buttonPlate} />
      <VisualCylinder position={[-0.58, 1.3 - buttonPress, -1.245]} rotation={[-66, 0, 0]} radius={0.125} height={0.075} material={trim} />
      <VisualCylinder position={[-0.58, 1.33 - buttonPress, -1.27]} rotation={[-66, 0, 0]} radius={0.105} height={0.08} material={redButton} />
      <VisualCylinder position={[-0.66, 1.04, 0.02]} rotation={[90, 0, 0]} radius={0.026} height={0.018} material={edgeLight} />
      {/* Larger exchange display lowered into the platform's vertical sightline;
          full-height rods visibly terminate at the ceiling. */}
      {[[-1.0, -0.52], [1.0, -0.52], [-1.0, 0.52], [1.0, 0.52]].map(([x, z]) => (
        <VisualBox key={`launch-hanger-${x}-${z}`} position={[x, 7.78, z]} size={[0.045, 7.45, 0.045]} material={metal} />
      ))}
      <VisualBox position={[0, 3.75, 0]} size={[3.1, 1.4, 1.75]} material={metal} />
      <VisualBox position={[0, 3.04, 0]} size={[2.86, 0.055, 1.5]} material={trim} />
      <VisualBox position={[0, 3.005, 0]} size={[2.5, 0.022, 1.18]} material={edgeLight} />
      {overheadScreenMaterial && (
        <>
          <Entity position={[0, 3.75, 0.886]} rotation={[90, 0, 0]} scale={[2.78, 1, 1.12]}><Render type="plane" material={overheadScreenMaterial} /></Entity>
          <Entity position={[0, 3.75, -0.886]} rotation={[90, 180, 0]} scale={[2.78, 1, 1.12]}><Render type="plane" material={overheadScreenMaterial} /></Entity>
          <Entity position={[1.561, 3.75, 0]} rotation={[90, 90, 0]} scale={[1.46, 1, 1.12]}><Render type="plane" material={overheadScreenMaterial} /></Entity>
          <Entity position={[-1.561, 3.75, 0]} rotation={[90, -90, 0]} scale={[1.46, 1, 1.12]}><Render type="plane" material={overheadScreenMaterial} /></Entity>
        </>
      )}

      {/* Four low ceremony markers define the sides/rear while the south-facing
          entrance remains completely open. */}
      {[[-2.0, -0.55], [2.0, -0.55], [-1.45, -1.65], [1.45, -1.65]].map(([x, z]) => (
        <Entity key={`launch-floor-marker-${x}-${z}`}>
          <VisualCylinder position={[x, 0.035, z]} rotation={[0, 0, 0]} radius={0.13} height={0.07} material={metal} />
          <VisualCylinder position={[x, 0.075, z]} rotation={[0, 0, 0]} radius={0.075} height={0.025} material={trim} />
        </Entity>
      ))}
    </>
  );
}
