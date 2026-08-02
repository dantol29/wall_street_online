import { Fragment } from "react";
import { Entity } from "@playcanvas/react";
import { Light } from "@playcanvas/react/components";
import { useMaterial } from "@playcanvas/react/hooks";
import { LIGHTFALLOFF_LINEAR } from "playcanvas";
import { OFFICE_SLOTS, WORLD_BOUNDS } from "@multiplayer/shared";
import { Prop } from "./Props";
import { StaticBox } from "./primitives";
import { OfficeContentDisplay, type OfficeSlotContent } from "./OfficeContentDisplay";
import { ROOM_HEIGHT, WALL_THICKNESS } from "./roomConstants";

/**
 * Half-width of the wing's own footprint (corridor + both alcove rows) —
 * must match the gap cut into the main room's south wall in Environment.tsx,
 * so the two pieces tile together with no unconnected wall stub or overlap.
 */
export const OFFICE_WING_HALF_WIDTH = 7;

const CORRIDOR_HALF_WIDTH = 2;
const ALCOVE_DEPTH = 5;
/** Matches the main room's existing south wall position exactly — the wing picks up right where that wall's doorway gap is cut. */
const WING_MIN_Z = 12.5;
const WING_MAX_Z = WORLD_BOUNDS.maxZ;
const WING_LENGTH = WING_MAX_Z - WING_MIN_Z;
const WING_CENTER_Z = (WING_MIN_Z + WING_MAX_Z) / 2;
/** z-boundaries between adjacent alcoves within a row (including the two ends) — one divider wall per boundary. */
const ROW_DIVIDER_Z = [WING_MIN_Z, 15.5, 18.5, 21.5, WING_MAX_Z];

const CONTENT_PANEL_SIZE: [number, number, number] = [0.04, 2.2, 2.6];
const DESK_SCALE: [number, number, number] = [0.75, 0.75, 0.75];
const CHAIR_SCALE: [number, number, number] = [0.75, 0.75, 0.75];

interface OfficeWingProps {
  floorMaterial: ReturnType<typeof useMaterial>;
  ceilingMaterial: ReturnType<typeof useMaterial>;
  wallMaterial: ReturnType<typeof useMaterial>;
  deskMaterial: ReturnType<typeof useMaterial>;
  /** Content for each occupied/showcased slot, keyed by `OfficeSlot.id` — slots with no entry render as vacant. Populated by App.tsx once a player is near enough to have fetched it (see office.ts messages). */
  slotContentById?: Record<string, OfficeSlotContent>;
}

/**
 * The office wing: a corridor extending south from the main trading floor's
 * (now doorway-cut) south wall, flanked by 8 small office alcoves (4 per
 * side). Alcoves are open on the corridor-facing side — a real collidable
 * glass wall would need its own opening cut for entry anyway, and this
 * codebase already avoids rendering true transparent glass elsewhere (the
 * north windows) to sidestep alpha-sorting issues, so "peeking in through
 * glass" is represented by the open front plus the content wall being
 * visible from the corridor, not a literal glass pane.
 *
 * Physical slot occupancy is dynamic and session-scoped (see the
 * game-server's officeSlotAssignment.ts) — this component only renders
 * whatever `slotContentById` it's given; it has no opinion on which player
 * currently owns which slot.
 */
export function OfficeWing({ floorMaterial, ceilingMaterial, wallMaterial, deskMaterial, slotContentById = {} }: OfficeWingProps) {
  return (
    <>
      <StaticBox
        position={[0, -0.25, WING_CENTER_Z]}
        size={[OFFICE_WING_HALF_WIDTH * 2, 0.5, WING_LENGTH]}
        material={floorMaterial}
      />
      <StaticBox
        position={[0, ROOM_HEIGHT + 0.25, WING_CENTER_Z]}
        size={[OFFICE_WING_HALF_WIDTH * 2, 0.5, WING_LENGTH]}
        material={ceilingMaterial}
      />

      {/* Back wall, closing off the far end of the corridor. */}
      <StaticBox
        position={[0, ROOM_HEIGHT / 2, WING_MAX_Z]}
        size={[OFFICE_WING_HALF_WIDTH * 2, ROOM_HEIGHT, WALL_THICKNESS]}
        material={wallMaterial}
      />
      <StaticBox
        position={[0, ROOM_HEIGHT / 2, WING_MAX_Z - WALL_THICKNESS]}
        size={[OFFICE_WING_HALF_WIDTH * 2, ROOM_HEIGHT, 0.1]}
        material={wallMaterial}
        renderVisible={false}
      />

      {/* Outer walls of each alcove row (the far side from the corridor). */}
      <StaticBox
        position={[-OFFICE_WING_HALF_WIDTH, ROOM_HEIGHT / 2, WING_CENTER_Z]}
        size={[WALL_THICKNESS, ROOM_HEIGHT, WING_LENGTH]}
        material={wallMaterial}
      />
      <StaticBox
        position={[OFFICE_WING_HALF_WIDTH, ROOM_HEIGHT / 2, WING_CENTER_Z]}
        size={[WALL_THICKNESS, ROOM_HEIGHT, WING_LENGTH]}
        material={wallMaterial}
      />

      {/* Party walls between adjacent alcoves (and end caps), one row on each side of the corridor — the corridor-facing side is deliberately left open. */}
      {ROW_DIVIDER_Z.map((z, index) => (
        <Fragment key={`office-divider-${index}`}>
          <StaticBox
            position={[-(CORRIDOR_HALF_WIDTH + ALCOVE_DEPTH / 2), ROOM_HEIGHT / 2, z]}
            size={[ALCOVE_DEPTH, ROOM_HEIGHT, WALL_THICKNESS]}
            material={wallMaterial}
          />
          <StaticBox
            position={[CORRIDOR_HALF_WIDTH + ALCOVE_DEPTH / 2, ROOM_HEIGHT / 2, z]}
            size={[ALCOVE_DEPTH, ROOM_HEIGHT, WALL_THICKNESS]}
            material={wallMaterial}
          />
        </Fragment>
      ))}

      {/* Two warm ceiling lights along the corridor — the main room's fixtures (see Lighting.tsx) don't reach this far south. */}
      {[WING_MIN_Z + WING_LENGTH / 4, WING_MIN_Z + (WING_LENGTH * 3) / 4].map((z, index) => (
        <Entity key={`office-light-${index}`} position={[0, ROOM_HEIGHT - 0.3, z]}>
          <Light type="omni" color="#ffe0ad" intensity={1.6} range={12} falloffMode={LIGHTFALLOFF_LINEAR} castShadows={false} />
        </Entity>
      ))}

      {OFFICE_SLOTS.map((slot) => {
        const facesPositiveX = slot.deskX > 0;
        const facingRotationY = facesPositiveX ? -90 : 90;
        const contentSign = facesPositiveX ? 1 : -1;

        return (
          <Fragment key={slot.id}>
            {/* Prop provides visuals only (no collision of its own) — this invisible box gives the desk a matching physical footprint, same idiom as DeskBank's desks. */}
            <StaticBox
              position={[slot.deskX, 0.35, slot.deskZ]}
              size={[1.4, 0.69, 0.65]}
              material={deskMaterial}
              renderVisible={false}
            />
            <Prop
              src="/assets/office/trading-desk.glb"
              position={[slot.deskX, 0, slot.deskZ]}
              rotation={[0, facingRotationY, 0]}
              scale={DESK_SCALE}
            />
            <Prop
              src="/assets/office/office-chair.glb"
              position={[slot.deskX - contentSign * 1.1, 0, slot.deskZ]}
              rotation={[0, facesPositiveX ? 90 : -90, 0]}
              scale={CHAIR_SCALE}
            />
            <OfficeContentDisplay
              position={[slot.deskX + contentSign * 0.85, ROOM_HEIGHT / 2, slot.deskZ]}
              size={CONTENT_PANEL_SIZE}
              content={slotContentById[slot.id] ?? null}
            />
          </Fragment>
        );
      })}
    </>
  );
}
