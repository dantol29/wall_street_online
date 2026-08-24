import { forwardRef } from "react";
import { Entity } from "@playcanvas/react";
import { useMaterial } from "@playcanvas/react/hooks";
import type { Entity as PcEntity } from "playcanvas";
import { VisualBox, VisualCylinder } from "../scene/primitives";

/** Cheap physical prop shown while a player is filling in a token listing. */
export const HeldNotepad = forwardRef<PcEntity>(function HeldNotepad(_, ref) {
  const cover = useMaterial({ diffuse: "#25231f", gloss: 0.08, metalness: 0.02 });
  const paper = useMaterial({ diffuse: "#ded3ba", emissive: "#15130f", emissiveIntensity: 0.025, gloss: 0.02 });
  const binding = useMaterial({ diffuse: "#20201e", gloss: 0.2, metalness: 0.35 });

  return (
    <Entity ref={ref}>
      {/* Convert the primitive's +Y paper face to the entity's -Z look axis,
          allowing the parent to lookAt the character's head. */}
      <Entity rotation={[-90, 0, 180]}>
        <VisualBox position={[0, -0.012, 0]} size={[0.24, 0.028, 0.34]} material={cover} />
        <VisualBox position={[0, 0.009, -0.004]} size={[0.218, 0.013, 0.315]} material={paper} />
        {[-0.08, -0.04, 0, 0.04, 0.08].map((x) => (
          <VisualCylinder key={x} position={[x, 0.027, -0.167]} rotation={[0, 0, 90]} radius={0.009} height={0.03} material={binding} />
        ))}
      </Entity>
    </Entity>
  );
});
