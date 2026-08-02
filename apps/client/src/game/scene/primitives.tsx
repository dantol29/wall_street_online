import { Entity } from "@playcanvas/react";
import { Collision, Render, RigidBody } from "@playcanvas/react/components";
import { useMaterial } from "@playcanvas/react/hooks";

/**
 * A static box with a matching collision shape.
 *
 * IMPORTANT: PlayCanvas's box/cylinder/capsule collision shapes are built from
 * their own explicit `halfExtents`/`radius`/`height` properties — they are NEVER
 * derived from the entity's `scale` transform (only "mesh"-type colliders read
 * scale). So the physics entity here carries no `scale` at all; `Collision` gets
 * explicit world-space `halfExtents`, and the visual `Render` lives on a separate
 * child entity that carries the scale purely for rendering.
 */
export function StaticBox({
  position,
  size,
  material,
  renderVisible = true,
}: {
  position: [number, number, number];
  size: [number, number, number];
  material: ReturnType<typeof useMaterial>;
  renderVisible?: boolean;
}) {
  const halfExtents: [number, number, number] = [size[0] / 2, size[1] / 2, size[2] / 2];

  return (
    <Entity position={position}>
      <Collision type="box" halfExtents={halfExtents} />
      <RigidBody type="static" />
      {renderVisible && (
        <Entity scale={size}>
          <Render type="box" material={material} />
        </Entity>
      )}
    </Entity>
  );
}

/** A purely decorative box with no collision — for things mounted flush against an already-collidable wall, or small tabletop clutter that doesn't need its own. */
export function VisualBox({
  position,
  size,
  material,
  rotation = [0, 0, 0],
}: {
  position: [number, number, number];
  size: [number, number, number];
  material: ReturnType<typeof useMaterial>;
  rotation?: [number, number, number];
}) {
  return (
    <Entity position={position} rotation={rotation} scale={size}>
      <Render type="box" material={material} />
    </Entity>
  );
}

/** A static cylinder (used for pipes/platform steps), same scale-vs-collision-shape caveat as StaticBox. */
export function StaticCylinder({
  position,
  rotation,
  radius,
  height,
  material,
  renderVisible = true,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
  radius: number;
  height: number;
  material: ReturnType<typeof useMaterial>;
  renderVisible?: boolean;
}) {
  return (
    <Entity position={position} rotation={rotation}>
      <Collision type="cylinder" radius={radius} height={height} />
      <RigidBody type="static" />
      {renderVisible && (
        <Entity scale={[radius * 2, height, radius * 2]}>
          <Render type="cylinder" material={material} />
        </Entity>
      )}
    </Entity>
  );
}

/** A purely decorative cylinder — no collision, for small fittings and tabletop/floor clutter. */
export function VisualCylinder({
  position,
  rotation = [0, 0, 0],
  radius,
  height,
  material,
}: {
  position: [number, number, number];
  rotation?: [number, number, number];
  radius: number;
  height: number;
  material: ReturnType<typeof useMaterial>;
}) {
  return (
    <Entity position={position} rotation={rotation} scale={[radius * 2, height, radius * 2]}>
      <Render type="cylinder" material={material} />
    </Entity>
  );
}

/** A decorative sphere — used only for plant foliage. */
export function VisualSphere({
  position,
  radius,
  material,
}: {
  position: [number, number, number];
  radius: number;
  material: ReturnType<typeof useMaterial>;
}) {
  return (
    <Entity position={position} scale={[radius * 2, radius * 2, radius * 2]}>
      <Render type="sphere" material={material} />
    </Entity>
  );
}
