import { Entity } from "@playcanvas/react";
import { Render } from "@playcanvas/react/components";
import { useModel } from "@playcanvas/react/hooks";

interface PropProps {
  src: string;
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  /**
   * Local-space offset, in the model's own unscaled units, applied to the mesh
   * BEFORE the outer entity's position/rotation/scale. Some models (e.g. our
   * Desk.glb) aren't authored with their origin at their visual center/base —
   * without this, `position` ends up pointing at wherever that mesh's origin
   * happens to be (often a corner), not where the object actually appears.
   */
  pivotOffset?: [number, number, number];
}

/**
 * A single static decorative GLB prop, purely visual (no collision — desks etc.
 * keep their existing simple box colliders in Environment.tsx, decoupled from
 * whatever the actual model geometry looks like, same pattern as StaticBox).
 */
export function Prop({
  src,
  position,
  rotation = [0, 0, 0],
  scale = [1, 1, 1],
  pivotOffset = [0, 0, 0],
}: PropProps) {
  const { asset } = useModel(src);
  if (!asset) return null;

  return (
    <Entity position={position} rotation={rotation} scale={scale}>
      <Entity position={pivotOffset}>
        <Render type="asset" asset={asset} />
      </Entity>
    </Entity>
  );
}
