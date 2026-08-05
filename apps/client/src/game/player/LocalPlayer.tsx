import { forwardRef, memo, useEffect, useRef, useState, type MutableRefObject } from "react";
import { Entity } from "@playcanvas/react";
import { Camera, Render, Script } from "@playcanvas/react/components";
import { useAppEvent, useModel, usePhysics } from "@playcanvas/react/hooks";
import type { Entity as PcEntity } from "playcanvas";
// @ts-expect-error - PlayCanvas ESM scripts don't have type declarations
import { FirstPersonController } from "playcanvas/scripts/esm/first-person-controller.mjs";
import type { AnimationState, ChatMessage } from "@multiplayer/shared";
import { InGameChatHud } from "./InGameChatHud";
import {
  CHARACTER_ANIM_TRANSITION_BLEND_SECONDS,
  CHARACTER_HEAD_NODE_NAME,
  CHARACTER_MODEL_ASSET_PATH,
  CHARACTER_MODEL_SCALE,
  CHARACTER_MODEL_YAW_OFFSET_DEGREES,
  CHARACTER_MODEL_Y_OFFSET,
  CHARACTER_SEATED_MODEL_Y_OFFSET,
  applyCharacterSeatedPose,
  registerCharacterAnimationStates,
  resolveCharacterSeatedPoseRig,
  type CharacterSeatedPoseRig,
} from "./characterAnimation";

const EYE_HEIGHT_OFFSET = 0.8;
const THIRD_PERSON_DISTANCE = 4;
const THIRD_PERSON_HEIGHT = 2;
const DEG_TO_RAD = Math.PI / 180;

/** Just enough of first-person-controller.mjs's runtime shape to read its yaw accumulator — see the note below. */
interface FirstPersonControllerRuntime {
  _angles?: { x: number; y: number };
}

interface LocalPlayerProps {
  spawn: { x: number; y: number; z: number };
  seated: boolean;
  chatMessages: ChatMessage[];
  chatFocused: boolean;
  chatDraft: string;
  chatDisabled: boolean;
  /** Updated every movement tick in App.tsx (the same value sent to the server) — read here each frame since there's no server round trip for your own state the way RemotePlayer gets one. */
  animationRef: MutableRefObject<AnimationState>;
}

/**
 * The local player now has a visible body (the same Business Man model
 * RemotePlayer uses), not just a camera — previously it was camera-only,
 * which meant looking down showed nothing at all. The head mesh node is
 * disabled specifically for this instance (see CHARACTER_HEAD_NODE_NAME):
 * left alone, it would sit right in front of the eye-height camera and clip
 * into view whenever looking down or spinning around. Movement/look is
 * still handled entirely by PlayCanvas's own ready-made
 * `first-person-controller.mjs`, not custom logic — it self-manages pointer
 * lock, WASD, mouse-look, jumping, and ground/air movement, and creates its
 * own capsule Collision + dynamic RigidBody (including a locked
 * angularFactor so the capsule can't tip over) since none is pre-declared
 * here.
 */
const LocalPlayerComponent = forwardRef<PcEntity, LocalPlayerProps>(function LocalPlayer(
  { spawn, seated, chatMessages, chatFocused, chatDraft, chatDisabled, animationRef },
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
  const thirdPersonRef = useRef(false);
  const lastRequestedAnimationRef = useRef<AnimationState | null>(null);
  const seatedPoseRigRef = useRef<CharacterSeatedPoseRig | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "KeyV" && !chatFocused) {
        thirdPersonRef.current = !thirdPersonRef.current;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [chatFocused]);

  useAppEvent("update", () => {
    const model = modelRef.current;
    if (!model || !asset?.resource || !cameraEntity) return;
    model.setLocalPosition(0, seated ? CHARACTER_SEATED_MODEL_Y_OFFSET : CHARACTER_MODEL_Y_OFFSET, 0);

    const controller = (cameraEntity.parent as PcEntity | null)?.script?.get(
      FirstPersonController.scriptName,
    ) as FirstPersonControllerRuntime | undefined;
    const yaw = controller?._angles ? controller._angles.y : cameraEntity.getLocalEulerAngles().y;

    const tp = thirdPersonRef.current;
    if (tp) {
      const yawRad = yaw * DEG_TO_RAD;
      cameraEntity.setLocalPosition(
        Math.sin(yawRad) * THIRD_PERSON_DISTANCE,
        THIRD_PERSON_HEIGHT,
        Math.cos(yawRad) * THIRD_PERSON_DISTANCE,
      );
    } else {
      cameraEntity.setLocalPosition(0, EYE_HEIGHT_OFFSET, 0);
    }

    const head = model.findByName(CHARACTER_HEAD_NODE_NAME);
    if (head) head.enabled = tp;

    model.setLocalEulerAngles(0, yaw + CHARACTER_MODEL_YAW_OFFSET_DEGREES, 0);

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
        <Camera fov={75} nearClip={0.05} farClip={100} />
        <InGameChatHud
          messages={chatMessages}
          focused={chatFocused}
          draft={chatDraft}
          disabled={chatDisabled}
        />
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
