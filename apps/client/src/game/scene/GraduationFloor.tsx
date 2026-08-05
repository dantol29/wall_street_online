import { Fragment, memo } from "react";
import { useMaterial } from "@playcanvas/react/hooks";
import type { BellCycleHistoryEntry, BellCycleSlot } from "@multiplayer/shared";
import { Prop } from "./Props";
import { BellPitGaugeDisplay, type BellPitGaugeFlash } from "./BellPitGaugeDisplay";
import { BellCycleCountdownDisplay } from "./BellCycleCountdownDisplay";
import { BellPodium } from "./BellPodium";
import { StaticBox, StaticCylinder, VisualBox, VisualCylinder } from "./primitives";

const GAUGE_ANGLES_DEG = [0, 60, 120, 180, 240, 300] as const;
const GAUGE_RADIUS = 2.05;
const BULL_SCALE: [number, number, number] = [0.0035, 0.0035, 0.0035];
const BULL_PIVOT_OFFSET: [number, number, number] = [0, -36.4, 0];

interface GraduationFloorProps {
  bellCycleSlots: BellCycleSlot[];
  bellCycleEndsAtMs: number;
  bellCycleFrozen?: boolean;
  bellCycleFlashBySlotIndex?: Record<number, BellPitGaugeFlash>;
  bellRinging?: boolean;
  bellCycleHistory?: BellCycleHistoryEntry[];
}

function emptySlot(slotIndex: number): BellCycleSlot {
  return {
    slotIndex,
    ownerPlayerId: null,
    ownerDisplayName: null,
    tokenName: null,
    ticker: null,
    seed: null,
    launchedAtMs: null,
  };
}

/** A clean, purpose-built token graduation room: stage, bull, live gauges and ceremony bell. */
export const GraduationFloor = memo(function GraduationFloor({
  bellCycleSlots,
  bellCycleEndsAtMs,
  bellCycleFrozen = false,
  bellCycleFlashBySlotIndex,
  bellRinging = false,
  bellCycleHistory = [],
}: GraduationFloorProps) {
  const floorMaterial = useMaterial({ diffuse: "#252b2d", gloss: 0.35, metalness: 0.15 });
  const wallMaterial = useMaterial({ diffuse: "#151b20", gloss: 0.2, metalness: 0.1 });
  const trimMaterial = useMaterial({ diffuse: "#8b6a32", gloss: 0.5, metalness: 0.65 });
  const stageMaterial = useMaterial({ diffuse: "#3c3024", gloss: 0.3, metalness: 0.15 });
  const darkMaterial = useMaterial({ diffuse: "#090d10", gloss: 0.15, metalness: 0.35 });
  const cyanMaterial = useMaterial({
    diffuse: "#173f48",
    emissive: "#1bc3d3",
    emissiveIntensity: 0.4,
    gloss: 0.4,
    metalness: 0.2,
  });

  return (
    <>
      <StaticBox position={[0, -0.25, 0]} size={[20, 0.5, 25]} material={floorMaterial} />
      <StaticBox position={[0, 6.25, 0]} size={[20, 0.5, 25]} material={wallMaterial} />
      <StaticBox position={[-10.25, 3, 0]} size={[0.5, 6.5, 25]} material={wallMaterial} />
      <StaticBox position={[10.25, 3, 0]} size={[0.5, 6.5, 25]} material={wallMaterial} />
      <StaticBox position={[0, 3, -12.25]} size={[20, 6.5, 0.5]} material={wallMaterial} />
      <StaticBox position={[0, 3, 12.25]} size={[20, 6.5, 0.5]} material={wallMaterial} />


      {/* Ceremony branding and architectural rhythm. */}
      <VisualBox position={[0, 4.8, -11.96]} size={[12, 1.15, 0.05]} material={darkMaterial} />
      <VisualBox position={[0, 4.8, -11.9]} size={[8, 0.06, 0.06]} material={trimMaterial} />
      {[-8, -4, 0, 4, 8].map((x) => (
        <Fragment key={`back-light-${x}`}>
          <VisualBox position={[x, 5.75, -11.94]} size={[1.8, 0.06, 0.05]} material={cyanMaterial} />
          <VisualBox position={[x, 1.8, -11.96]} size={[0.08, 3.3, 0.06]} material={trimMaterial} />
        </Fragment>
      ))}
      {[-7.5, -2.5, 2.5, 7.5].map((x) => (
        <VisualCylinder key={`ceiling-light-${x}`} position={[x, 5.95, 0]} radius={0.36} height={0.04} material={cyanMaterial} />
      ))}


      {/* Raised IPO stage. */}
      <StaticCylinder position={[0, 0.075, 0]} rotation={[0, 0, 0]} radius={4.5} height={0.15} material={stageMaterial} />
      <StaticCylinder position={[0, 0.24, 0]} rotation={[0, 0, 0]} radius={3.65} height={0.18} material={trimMaterial} />
      <StaticCylinder position={[0, 0.43, 0]} rotation={[0, 0, 0]} radius={2.85} height={0.2} material={stageMaterial} />
      <VisualCylinder position={[0, 0.56, 0]} radius={2.5} height={0.05} material={cyanMaterial} />

      {/* The bull is the visual centerpiece of each graduation. */}
      <StaticBox position={[0, 0.9, -0.15]} size={[2.7, 1.8, 3.8]} material={stageMaterial} renderVisible={false} />
      <Prop
        src="/assets/charging-bull.glb"
        position={[0, 0.55, -0.15]}
        rotation={[0, 180, 0]}
        scale={BULL_SCALE}
        pivotOffset={BULL_PIVOT_OFFSET}
      />

      {/* Six token slots form a public ring around the stage. */}
      {GAUGE_ANGLES_DEG.map((angleDeg, index) => {
        const radians = (angleDeg * Math.PI) / 180;
        const x = GAUGE_RADIUS * Math.sin(radians);
        const z = GAUGE_RADIUS * Math.cos(radians);
        const slot = bellCycleSlots[index] ?? emptySlot(index);
        return (
          <Fragment key={`graduation-slot-${index}`}>
            <StaticBox position={[x, 0.78, z]} size={[0.8, 0.55, 0.8]} material={darkMaterial} />
            <BellPitGaugeDisplay
              slot={slot}
              position={[x, 1.08, z]}
              rotationY={180 - angleDeg}
              frozen={bellCycleFrozen}
              flash={bellCycleFlashBySlotIndex?.[index] ?? null}
            />
          </Fragment>
        );
      })}
      <BellCycleCountdownDisplay position={[0, 2.25, 0]} scale={[1.9, 0.58, 0.01]} cycleEndsAtMs={bellCycleEndsAtMs} />

      {/* Spectator rails keep the center readable while leaving room for avatars to gather. */}
      {[-7.2, 7.2].map((x) => (
        <Fragment key={`spectator-rail-${x}`}>
          <VisualBox position={[x, 0.8, 0]} size={[0.12, 1.6, 14]} material={trimMaterial} />
          <VisualBox position={[x, 1.55, 0]} size={[0.22, 0.12, 14]} material={trimMaterial} />
        </Fragment>
      ))}

      <BellPodium ringing={bellRinging} wallOfFameEntries={bellCycleHistory} />
    </>
  );
});
