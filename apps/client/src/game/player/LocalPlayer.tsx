import { forwardRef, memo, useRef, useState, type MutableRefObject } from "react";
import { Entity } from "@playcanvas/react";
import { Camera, Render, Script } from "@playcanvas/react/components";
import { useAppEvent, useModel, usePhysics } from "@playcanvas/react/hooks";
import type { Entity as PcEntity } from "playcanvas";
// @ts-expect-error - PlayCanvas ESM scripts don't have type declarations
import { FirstPersonController } from "playcanvas/scripts/esm/first-person-controller.mjs";
import type { AnimationState } from "@multiplayer/shared";
import {
  CHARACTER_ANIM_TRANSITION_BLEND_SECONDS,
  CHARACTER_BODY_NODE_NAME,
  CHARACTER_HEAD_NODE_NAME,
  CHARACTER_MODEL_ASSET_PATH,
  CHARACTER_MODEL_SCALE,
  CHARACTER_MODEL_YAW_OFFSET_DEGREES,
  CHARACTER_MODEL_Y_OFFSET,
  CHARACTER_SEATED_MODEL_Y_OFFSET,
  applyCharacterSeatedPose,
  applyCharacterMaterialFinish,
  registerCharacterAnimationStates,
  resolveCharacterSeatedPoseRig,
  type CharacterSeatedPoseRig,
} from "./characterAnimation";
// import { TradingFloorCameraFrame } from "../scene/Atmosphere";

const EYE_HEIGHT_OFFSET = 0.8;
const FIRST_PERSON_FORWARD_OFFSET = 0.42;

/** Just enough of first-person-controller.mjs's runtime shape to read its yaw accumulator — see the note below. */
interface FirstPersonControllerRuntime {
  _angles?: { x: number; y: number };
}

interface LocalPlayerProps {
  spawn: { x: number; y: number; z: number };
  seated: boolean;
  chatFocused: boolean;
  alternateCameraActive: boolean;
  /** Updated every movement tick in App.tsx (the same value sent to the server) — read here each frame since there's no server round trip for your own state the way RemotePlayer gets one. */
  animationRef: MutableRefObject<AnimationState>;
}

/**
 * The local player now has a visible body (the same Business Man model
 * RemotePlayer uses), not just a camera — previously it was camera-only,
 * which meant looking down showed nothing at all. Movement/look is still
 * handled entirely by PlayCanvas's own ready-made
 * `first-person-controller.mjs`, not custom logic — it self-manages pointer
 * lock, WASD, mouse-look, jumping, and ground/air movement, and creates its
 * own capsule Collision + dynamic RigidBody (including a locked
 * angularFactor so the capsule can't tip over) since none is pre-declared
 * here. The camera sits just ahead of the face so the complete head and torso
 * can remain visible without exposing their interior surfaces when looking down.
 */
const LocalPlayerComponent = forwardRef<PcEntity, LocalPlayerProps>(function LocalPlayer(
  { spawn, seated, alternateCameraActive, animationRef },
  ref,
) {
  const [cameraEntity, setCameraEntity] = useState<PcEntity | null>(null);
  const initialPositionRef = useRef<[number, number, number]>([
    spawn.x,
    spawn.y,
    spawn.z,
  ]);
  const cameraPositionRef = useRef<[number, number, number]>([
    0,
    EYE_HEIGHT_OFFSET,
    0,
  ]);
  const { isPhysicsLoaded } = usePhysics();
  const { asset } = useModel(CHARACTER_MODEL_ASSET_PATH);
  const modelRef = useRef<PcEntity | null>(null);
  const statesRegisteredRef = useRef(false);
  const materialFinishAppliedRef = useRef(false);
  const lastRequestedAnimationRef = useRef<AnimationState | null>(null);
  const seatedPoseRigRef = useRef<CharacterSeatedPoseRig | null>(null);

  useAppEvent("update", () => {
    const model = modelRef.current;
    if (!model || !asset?.resource || !cameraEntity) return;
    model.setLocalPosition(0, seated ? CHARACTER_SEATED_MODEL_Y_OFFSET : CHARACTER_MODEL_Y_OFFSET, 0);

    const controller = (cameraEntity.parent as PcEntity | null)?.script?.get(
      FirstPersonController.scriptName,
    ) as FirstPersonControllerRuntime | undefined;
    const yaw = controller?._angles ? controller._angles.y : cameraEntity.getLocalEulerAngles().y;

    const forward = cameraEntity.forward;
    const horizontalLength = Math.hypot(forward.x, forward.z) || 1;
    cameraEntity.setLocalPosition(
      (forward.x / horizontalLength) * FIRST_PERSON_FORWARD_OFFSET,
      EYE_HEIGHT_OFFSET,
      (forward.z / horizontalLength) * FIRST_PERSON_FORWARD_OFFSET,
    );

    const head = model.findByName(CHARACTER_HEAD_NODE_NAME);
    const body = model.findByName(CHARACTER_BODY_NODE_NAME);
    if (head) head.enabled = true;
    if (body) body.enabled = true;

    model.setLocalEulerAngles(0, yaw + CHARACTER_MODEL_YAW_OFFSET_DEGREES, 0);

    if (!materialFinishAppliedRef.current) {
      materialFinishAppliedRef.current = applyCharacterMaterialFinish(model);
    }

    if (!statesRegisteredRef.current) {
      if (registerCharacterAnimationStates(model, asset)) statesRegisteredRef.current = true;
    }

    const anim = model.anim;
    const targetState = animationRef.current;
    if (anim?.baseLayer && statesRegisteredRef.current && lastRequestedAnimationRef.current !== targetState) {
      anim.baseLayer.transition(targetState, CHARACTER_ANIM_TRANSITION_BLEND_SECONDS);
      lastRequestedAnimationRef.current = targetState;
    }
  });

  useAppEvent("prerender", () => {
    const model = modelRef.current;
    if (!seated || !model) return;
    const rig = seatedPoseRigRef.current ?? resolveCharacterSeatedPoseRig(model);
    if (!rig) return;
    seatedPoseRigRef.current = rig;
    applyCharacterSeatedPose(model, rig);
  });

  return (
    <Entity name="local-player" position={initialPositionRef.current} ref={ref}>
      <Entity name="local-camera" position={cameraPositionRef.current} ref={setCameraEntity}>
        <Camera enabled={!alternateCameraActive} fov={75} nearClip={0.05} farClip={220} />
        {/* CameraFrame post-processing intentionally disabled for performance testing.
        {cameraEntity?.camera && <TradingFloorCameraFrame camera={cameraEntity.camera} />}
        */}
      </Entity>

      {asset && (
        <Entity ref={modelRef} position={[0, CHARACTER_MODEL_Y_OFFSET, 0]} scale={[CHARACTER_MODEL_SCALE, CHARACTER_MODEL_SCALE, CHARACTER_MODEL_SCALE]}>
          <Render type="asset" asset={asset} />
        </Entity>
      )}

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

export const LocalPlayer = memo(LocalPlayerComponent);
