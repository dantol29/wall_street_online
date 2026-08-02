import { forwardRef, useState } from "react";
import { Entity } from "@playcanvas/react";
import { Camera, Script } from "@playcanvas/react/components";
import { usePhysics } from "@playcanvas/react/hooks";
import type { Entity as PcEntity } from "playcanvas";
// @ts-expect-error - PlayCanvas ESM scripts don't have type declarations
import { FirstPersonController } from "playcanvas/scripts/esm/first-person-controller.mjs";

const EYE_HEIGHT_OFFSET = 0.8;

interface LocalPlayerProps {
  spawn: { x: number; y: number; z: number };
}

/**
 * The local player is rendered as camera-only per the brief — no visible body.
 * Movement/look is handled entirely by PlayCanvas's own ready-made
 * `first-person-controller.mjs` (shipped with the engine, same one used by its
 * official tutorial), not custom logic — it self-manages pointer lock, WASD,
 * mouse-look, jumping, and ground/air movement, and creates its own capsule
 * Collision + dynamic RigidBody (including a locked angularFactor so the
 * capsule can't tip over) since none is pre-declared here.
 */
export const LocalPlayer = forwardRef<PcEntity, LocalPlayerProps>(function LocalPlayer({ spawn }, ref) {
  const [cameraEntity, setCameraEntity] = useState<PcEntity | null>(null);
  const { isPhysicsLoaded } = usePhysics();

  return (
    <Entity name="local-player" position={[spawn.x, spawn.y, spawn.z]} ref={ref}>
      <Entity name="local-camera" position={[0, EYE_HEIGHT_OFFSET, 0]} ref={setCameraEntity}>
        <Camera fov={75} nearClip={0.05} farClip={100} />
      </Entity>

      {/*
        Only mounted once the camera entity ref AND physics are ready. The script
        creates its own capsule Collision + dynamic RigidBody imperatively inside
        initialize(), with no wait for the Ammo/Bullet library — unlike our own
        <Collision>/<RigidBody> JSX components, which gate on isPhysicsLoaded
        automatically. Mounting the script before physics finishes loading
        produced a rigidbody component that accepted linearVelocity writes but
        was never registered with a live dynamics world, so nothing ever moved.
      */}
      {cameraEntity && isPhysicsLoaded && <Script script={FirstPersonController} camera={cameraEntity} />}
    </Entity>
  );
});
