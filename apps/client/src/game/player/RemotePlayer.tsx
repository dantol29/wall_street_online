import { useRef } from "react";
import { Entity } from "@playcanvas/react";
import { Render } from "@playcanvas/react/components";
import { useAppEvent, useModel } from "@playcanvas/react/hooks";
import type { Entity as PcEntity } from "playcanvas";
import type { AnimationState } from "@multiplayer/shared";
import { getVisualTransform } from "../multiplayer/interpolation";
import type { RemotePlayerRecord } from "./remotePlayerRecord";
import {
  CHARACTER_ANIM_TRANSITION_BLEND_SECONDS,
  CHARACTER_MODEL_ASSET_PATH,
  CHARACTER_MODEL_SCALE,
  CHARACTER_MODEL_Y_OFFSET,
  CHARACTER_MODEL_YAW_OFFSET_DEGREES,
  CHARACTER_SEATED_MODEL_Y_OFFSET,
  applyCharacterSeatedPose,
  registerCharacterAnimationStates,
  resolveCharacterSeatedPoseRig,
  type CharacterSeatedPoseRig,
} from "./characterAnimation";

const UPDATE_INTERVAL_MS = 1000 / 12;

interface RemotePlayerProps {
  sessionId: string;
  recordsRef: React.RefObject<Map<string, RemotePlayerRecord>>;
}

/**
 * Renders the remote player as Quaternius's "Business Man" (poly.pizza, CC0 —
 * see README), a rigged, animated low-poly humanoid with real idle/walk/run
 * clips. @playcanvas/react's declarative `<Anim>` component only ever binds a
 * single clip (it hard-codes one state name and overwrites it per animation in
 * the asset), so the anim component is added and wired up here imperatively
 * instead, registering our three clips as distinct, switchable states.
 */
export function RemotePlayer({ sessionId, recordsRef }: RemotePlayerProps) {
  const rootRef = useRef<PcEntity | null>(null);
  const modelRef = useRef<PcEntity | null>(null);
  const statesRegisteredRef = useRef(false);
  const lastRequestedAnimationRef = useRef<AnimationState | null>(null);
  const seatedPoseRigRef = useRef<CharacterSeatedPoseRig | null>(null);
  const { asset } = useModel(CHARACTER_MODEL_ASSET_PATH);

  useAppEvent("update", () => {
    const record = recordsRef.current.get(sessionId);
    const root = rootRef.current;
    if (!record || !root) return;

    const visual = getVisualTransform(record.transform, Date.now(), UPDATE_INTERVAL_MS);
    root.setPosition(visual.x, visual.y, visual.z);
    root.setEulerAngles(0, (visual.rotationY * 180) / Math.PI + CHARACTER_MODEL_YAW_OFFSET_DEGREES, 0);

    const model = modelRef.current;
    if (!model || !asset?.resource) return;
    model.setLocalPosition(0, record.seatedDeskId ? CHARACTER_SEATED_MODEL_Y_OFFSET : CHARACTER_MODEL_Y_OFFSET, 0);

    if (!statesRegisteredRef.current) {
      if (registerCharacterAnimationStates(model, asset)) statesRegisteredRef.current = true;
    }

    // Gated on our own "last requested" ref rather than `activeState`: a
    // transition() blend takes CHARACTER_ANIM_TRANSITION_BLEND_SECONDS to
    // complete, and re-issuing it every frame while `activeState` still
    // reflects the outgoing state would keep restarting the blend and it
    // would never finish. `lastRequestedAnimationRef` starts at null, so the
    // very first request still fires once state registration above
    // completes, even if that lands a frame or two after mount.
    const anim = model.anim;
    if (anim?.baseLayer && statesRegisteredRef.current && lastRequestedAnimationRef.current !== record.animation) {
      anim.baseLayer.transition(record.animation, CHARACTER_ANIM_TRANSITION_BLEND_SECONDS);
      lastRequestedAnimationRef.current = record.animation;
    }
  });

  useAppEvent("prerender", () => {
    const record = recordsRef.current.get(sessionId);
    const model = modelRef.current;
    if (!record?.seatedDeskId || !model) return;
    const rig = seatedPoseRigRef.current ?? resolveCharacterSeatedPoseRig(model);
    if (!rig) return;
    seatedPoseRigRef.current = rig;
    applyCharacterSeatedPose(model, rig);
  });

  return (
    <Entity ref={rootRef} name={`remote-${sessionId}`}>
      {asset && (
        <Entity
          ref={modelRef}
          position={[
            0,
            recordsRef.current.get(sessionId)?.seatedDeskId
              ? CHARACTER_SEATED_MODEL_Y_OFFSET
              : CHARACTER_MODEL_Y_OFFSET,
            0,
          ]}
          scale={[CHARACTER_MODEL_SCALE, CHARACTER_MODEL_SCALE, CHARACTER_MODEL_SCALE]}
        >
          <Render type="asset" asset={asset} />
        </Entity>
      )}
    </Entity>
  );
}
