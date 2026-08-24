import { useRef, type ReactNode } from "react";
import { Entity } from "@playcanvas/react";
import { Render } from "@playcanvas/react/components";
import { useApp, useAppEvent, useMaterial } from "@playcanvas/react/hooks";
import type { Entity as PcEntity, StandardMaterial } from "playcanvas";
import { VisualBox, VisualCylinder } from "./primitives";

export const TERMINAL_SCREEN_CENTER_Y = 1.52;
export const TERMINAL_SCREEN_SIZE: [number, number, number] = [1.65, 1.02, 0.1];
export const TERMINAL_SCREEN_SURFACE_SIZE: [number, number] = [1.52, 0.86];
export const TERMINAL_LOGO_SIZE = 0.68;

interface TradingTerminalShellProps {
  position: [number, number, number];
  rotation?: [number, number, number];
  screenMaterial: StandardMaterial | null;
  logoMaterial: StandardMaterial | null;
  logoBorderActive?: boolean;
  children?: ReactNode;
}

function BillboardTokenLogo({ logoMaterial, borderMaterial, borderRadius }: {
  logoMaterial: StandardMaterial | null;
  borderMaterial: StandardMaterial;
  borderRadius: number;
}) {
  const app = useApp();
  const signRef = useRef<PcEntity | null>(null);
  const cameraRef = useRef<PcEntity | null>(null);

  useAppEvent("update", () => {
    const sign = signRef.current;
    cameraRef.current ??= app.root.findByName("local-camera") as PcEntity | null;
    const camera = cameraRef.current;
    if (!sign || !camera) return;
    const signPosition = sign.getPosition();
    const cameraPosition = camera.getPosition();
    const yaw = (Math.atan2(cameraPosition.x - signPosition.x, cameraPosition.z - signPosition.z) * 180) / Math.PI;
    sign.setEulerAngles(0, yaw, 0);
  });

  return (
    <Entity ref={signRef} position={[0, 0.93, 0]}>
      <VisualCylinder position={[0, 0, 0]} rotation={[90, 0, 0]} radius={borderRadius} height={0.06} material={borderMaterial} />
      {logoMaterial && (
        <Entity position={[0, 0, 0.036]} rotation={[90, 0, 0]} scale={[TERMINAL_LOGO_SIZE, 1, TERMINAL_LOGO_SIZE]}>
          <Render type="plane" material={logoMaterial} />
        </Entity>
      )}
    </Entity>
  );
}

/**
 * Shared low-poly trading-floor terminal. Its origin is the screen center so
 * interactive and decorative terminals can reuse the same body unchanged.
 */
export function TradingTerminalShell({
  position,
  rotation = [0, 0, 0],
  screenMaterial,
  logoMaterial,
  logoBorderActive = false,
  children,
}: TradingTerminalShellProps) {
  const bodyMaterial = useMaterial({ diffuse: "#141619", metalness: 0.42, gloss: 0.24 });
  const secondaryMaterial = useMaterial({ diffuse: "#24272b", metalness: 0.5, gloss: 0.32 });
  const insetMaterial = useMaterial({ diffuse: "#08090a", metalness: 0.2, gloss: 0.18 });
  const statusMaterial = useMaterial({
    diffuse: "#243027",
    emissive: "#5baa70",
    emissiveIntensity: 0.35,
    gloss: 0.25,
  });
  const soundButtonMaterial = useMaterial({ diffuse: "#343434", metalness: 0.38, gloss: 0.3 });
  const soundButtonRimMaterial = useMaterial({ diffuse: "#8a7654", metalness: 0.5, gloss: 0.26 });
  const activeLogoBorderMaterial = useMaterial({
    diffuse: "#f2f2ef",
    emissive: "#ffffff",
    emissiveIntensity: 0.5,
    metalness: 0.08,
    gloss: 0.22,
  });

  return (
    <Entity position={position} rotation={rotation}>
      {/* Heavy, stepped base: the smaller upper plate reads as a cheap bevel. */}
      <VisualBox position={[0, -1.485, 0]} size={[0.5, 0.07, 0.36]} material={bodyMaterial} />
      <VisualBox position={[0, -1.438, 0]} size={[0.44, 0.025, 0.31]} material={secondaryMaterial} />

      {/* A broad rectangular pedestal with a subtly wider lower sleeve. */}
      <VisualBox position={[0, -0.86, 0]} size={[0.14, 1.13, 0.14]} material={bodyMaterial} />
      <VisualBox position={[0, -1.25, 0]} size={[0.19, 0.34, 0.18]} material={secondaryMaterial} />
      <VisualBox position={[0, -0.36, -0.055]} size={[0.24, 0.18, 0.12]} material={secondaryMaterial} />

      {/* Simple card-reader-like interaction panel on the front. */}
      <VisualBox position={[0, -0.83, 0.083]} size={[0.105, 0.17, 0.025]} material={insetMaterial} />
      <VisualBox position={[0, -0.79, 0.097]} size={[0.07, 0.012, 0.008]} material={secondaryMaterial} />

      {/* One shared physical token-sound button on every stand prefab. */}
      <VisualCylinder position={[0, -1.02, 0.105]} rotation={[90, 0, 0]} radius={0.062} height={0.018} material={soundButtonRimMaterial} />
      <VisualCylinder position={[0, -1.02, 0.118]} rotation={[90, 0, 0]} radius={0.047} height={0.022} material={soundButtonMaterial} />

      {/* Matte enclosure with a shallow rear step and a thicker lower bezel. */}
      <VisualBox position={[0, 0, -0.025]} size={[1.59, 0.96, 0.14]} material={secondaryMaterial} />
      <VisualBox position={[0, 0, 0]} size={TERMINAL_SCREEN_SIZE} material={bodyMaterial} />
      <VisualBox position={[0, 0.025, 0.056]} size={[1.58, 0.91, 0.018]} material={insetMaterial} />
      {screenMaterial && (
        <Entity
          position={[0, 0.025, 0.067]}
          rotation={[90, 0, 0]}
          scale={[TERMINAL_SCREEN_SURFACE_SIZE[0], 1, TERMINAL_SCREEN_SURFACE_SIZE[1]]}
        >
          <Render type="plane" material={screenMaterial} />
        </Entity>
      )}

      {/* Three inexpensive ventilation slots on the back. */}
      {[-0.12, 0, 0.12].map((x) => (
        <VisualBox
          key={`vent-${x}`}
          position={[x, 0.08, -0.102]}
          size={[0.075, 0.012, 0.008]}
          material={insetMaterial}
        />
      ))}

      {/* Low-key status light below the display. */}
      {/* Starting value: a narrow 3.5cm white active rim keeps the feedback legible without overpowering the logo.
          Pass when observers identify the sounding stand without reading the border as a second sign. */}
      <VisualCylinder
        position={[-0.72, -0.465, 0.062]}
        rotation={[90, 0, 0]}
        radius={0.012}
        height={0.012}
        material={statusMaterial}
      />

      {/* Short sign bracket and a genuinely thick token medallion. */}
      <VisualBox position={[0, 0.58, -0.025]} size={[0.08, 0.16, 0.08]} material={secondaryMaterial} />
      <BillboardTokenLogo
        logoMaterial={logoMaterial}
        borderMaterial={logoBorderActive ? activeLogoBorderMaterial : bodyMaterial}
        borderRadius={TERMINAL_LOGO_SIZE / 2 + (logoBorderActive ? 0.035 : 0.025)}
      />

      {children}
    </Entity>
  );
}
