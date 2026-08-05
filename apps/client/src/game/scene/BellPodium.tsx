import { useEffect, useRef } from "react";
import { Entity } from "@playcanvas/react";
import { useAppEvent, useMaterial } from "@playcanvas/react/hooks";
import type { Entity as PcEntity } from "playcanvas";
import type { BellCycleHistoryEntry } from "@multiplayer/shared";
import { VisualBox, VisualCylinder, VisualSphere } from "./primitives";
import { WallOfFameDisplay } from "./WallOfFameDisplay";

const PODIUM_X = 9;
const PODIUM_TOP_Y = 2.2;
const PODIUM_DEPTH_Z = 6;

export interface BellPodiumProps {
  /** Drives the bell's swing animation — see App.tsx's bellCeremony effect. */
  ringing: boolean;
  wallOfFameEntries: BellCycleHistoryEntry[];
}

/**
 * A raised balcony along the (otherwise-undecorated) east wall, visible
 * from anywhere on the floor per the pitch — purely a decorative set-piece,
 * not walkable: the ceremony is server-scheduled and automatic (see
 * SocialRoom's resolveBellCycle), so nobody ever needs to physically climb
 * up and pull anything. The bell swings via a scripted decaying-sine
 * rotation while `ringing` is true, not a modeled animation — same "canvas/
 * procedural over asset" approach as the rest of this scene's non-prop
 * fixtures.
 */
export function BellPodium({ ringing, wallOfFameEntries }: BellPodiumProps) {
  const bellPivotRef = useRef<PcEntity | null>(null);
  const ringingStartedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (ringing) ringingStartedAtRef.current = Date.now();
  }, [ringing]);

  useAppEvent("update", () => {
    const entity = bellPivotRef.current;
    if (!entity) return;
    const startedAt = ringingStartedAtRef.current;
    if (!ringing || startedAt === null) {
      entity.setEulerAngles(0, 0, 0);
      return;
    }
    const elapsedSeconds = (Date.now() - startedAt) / 1000;
    const decay = Math.exp(-elapsedSeconds * 1.1);
    const swingDegrees = Math.sin(elapsedSeconds * 9) * 22 * decay;
    entity.setEulerAngles(0, 0, swingDegrees);
  });

  const platformMaterial = useMaterial({ diffuse: "#4a3a2a", gloss: 0.2, metalness: 0 });
  const railingMaterial = useMaterial({ diffuse: "#3a3630", metalness: 0.4, gloss: 0.5 });
  const bellMaterial = useMaterial({ diffuse: "#c98a2e", metalness: 0.75, gloss: 0.7 });
  const standMaterial = useMaterial({ diffuse: "#2e2a24", metalness: 0.3, gloss: 0.3 });
  const plaqueBackingMaterial = useMaterial({ diffuse: "#1c1a16", gloss: 0.1 });

  return (
    <>
      {/* Balcony floor */}
      <VisualBox position={[PODIUM_X, PODIUM_TOP_Y, 0]} size={[1.6, 0.12, PODIUM_DEPTH_Z]} material={platformMaterial} />
      {/* Front railing, facing the open floor */}
      <VisualBox position={[PODIUM_X - 0.75, PODIUM_TOP_Y + 0.5, 0]} size={[0.06, 0.9, PODIUM_DEPTH_Z]} material={railingMaterial} />
      {[-2.5, 0, 2.5].map((z) => (
        <VisualBox key={`rail-post-${z}`} position={[PODIUM_X - 0.75, PODIUM_TOP_Y + 0.45, z]} size={[0.06, 0.9, 0.06]} material={railingMaterial} />
      ))}

      {/* Bell stand: a simple post + crossbeam */}
      <VisualCylinder position={[PODIUM_X, PODIUM_TOP_Y + 0.75, 0]} radius={0.05} height={1.5} material={standMaterial} />
      <VisualBox position={[PODIUM_X, PODIUM_TOP_Y + 1.5, 0]} size={[0.9, 0.08, 0.4]} material={standMaterial} />

      {/* The bell itself, swinging from the crossbeam */}
      <Entity ref={bellPivotRef} position={[PODIUM_X, PODIUM_TOP_Y + 1.42, 0]}>
        <VisualCylinder position={[0, -0.16, 0]} radius={0.22} height={0.32} material={bellMaterial} />
        <VisualCylinder position={[0, -0.36, 0]} radius={0.15} height={0.14} material={bellMaterial} />
        <VisualSphere position={[0, -0.5, 0]} radius={0.045} material={bellMaterial} />
      </Entity>

      {/* Wall of Fame plaque wall, mounted on the balcony's back (east) side */}
      <VisualBox position={[PODIUM_X + 0.78, PODIUM_TOP_Y + 1.3, 0]} size={[0.06, 2.5, 3.4]} material={plaqueBackingMaterial} />
      <WallOfFameDisplay
        position={[PODIUM_X + 0.74, PODIUM_TOP_Y + 1.3, 0]}
        rotationY={-90}
        scale={[2.3, 3.2, 0.01]}
        entries={wallOfFameEntries}
      />
    </>
  );
}
