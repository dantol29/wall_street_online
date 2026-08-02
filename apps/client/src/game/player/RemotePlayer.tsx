import { useRef } from "react";
import { Entity } from "@playcanvas/react";
import { Render } from "@playcanvas/react/components";
import { useAppEvent, useModel } from "@playcanvas/react/hooks";
import type { Asset, AnimComponent, AnimTrack, Entity as PcEntity } from "playcanvas";
import type { AnimationState } from "@multiplayer/shared";
import { getVisualTransform } from "../multiplayer/interpolation";
import type { RemotePlayerRecord } from "./remotePlayerRecord";

const UPDATE_INTERVAL_MS = 1000 / 12;
const MODEL_ASSET_PATH = "/assets/BusinessMan.glb";

/** Crossfade duration between animation states, matching PlayCanvas's own anim-blending tutorial. */
const TRANSITION_BLEND_SECONDS = 0.2;

/**
 * Unlike CesiumMan, this model already has a 100x scale correction baked into
 * its mesh nodes by the FBX->glTF export (raw mesh data is ~0.0186 units tall,
 * matching Quaternius/FBX2glTF's usual cm-authoring convention) — so it renders
 * at its natural ~1.86m out of the box. No extra entity-level scale needed.
 */
const MODEL_SCALE = 1;

/**
 * The local player's capsule (created by the ready-made first-person-controller
 * script) is centered on its entity origin with half-height 1.0, so the server-
 * reported Y (which mirrors that origin) sits ~1m above the floor at rest. Like
 * most humanoid rigs, this model's feet are at its local origin, so shifting it
 * down by that same 1m lines its feet up with the floor.
 */
const MODEL_Y_OFFSET = -1;

/**
 * This FBX-exported rig faces the opposite way from our rotationY convention
 * (a common mismatch — Mixamo/FBX2glTF characters are frequently authored
 * facing -Z relative to the target engine's +Z forward), confirmed visually:
 * the avatar showed its back to the direction it should have been facing.
 */
const MODEL_YAW_OFFSET_DEGREES = 180;

/**
 * Real GLB clip names (from Quaternius's "Business Man" — poly.pizza, CC0),
 * mapped to our three animation states. Registered as anim-component states
 * under our own (short) state names below, since @playcanvas/react's <Anim>
 * only supports a single clip declaratively — see the imperative wiring below.
 */
const CLIP_NAME_BY_STATE: Record<AnimationState, string> = {
  // "CharacterArmature|Idle" (the more obviously-named clip) only animates 21 of
  // the 34 bones Walk/Run drive — critically, it never touches Foot.L/Foot.R, so
  // switching from Walk to it left the legs frozen mid-stride (PlayCanvas's anim
  // layer only overwrites the bones a clip actually has curves for; anything
  // else just keeps its last value from whatever played before). "Idle_Neutral"
  // covers both feet and only misses minor wrist/finger/neck bones instead.
  idle: "CharacterArmature|Idle_Neutral",
  walk: "CharacterArmature|Walk",
  run: "CharacterArmature|Run",
};

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
  const { asset } = useModel(MODEL_ASSET_PATH);

  useAppEvent("update", () => {
    const record = recordsRef.current.get(sessionId);
    const root = rootRef.current;
    if (!record || !root) return;

    const visual = getVisualTransform(record.transform, Date.now(), UPDATE_INTERVAL_MS);
    root.setPosition(visual.x, visual.y, visual.z);
    root.setEulerAngles(0, (visual.rotationY * 180) / Math.PI + MODEL_YAW_OFFSET_DEGREES, 0);

    const model = modelRef.current;
    if (!model || !asset?.resource) return;

    if (!statesRegisteredRef.current) {
      const anim = (model.anim ?? model.addComponent("anim")) as AnimComponent;
      // `resource.animations` isn't part of ContainerResource's public type but
      // is populated at runtime: one Asset per glTF animation clip. Each Asset's
      // own `.name` is an index-based string PlayCanvas generates itself (e.g.
      // "BusinessMan/animation/3"), NOT the glTF clip name — that original name
      // ("CharacterArmature|Idle") only survives on the wrapped AnimTrack's own
      // `.resource.name`.
      const animationAssets = (asset.resource as { animations?: Asset[] }).animations ?? [];
      let registeredAny = false;
      for (const [state, clipName] of Object.entries(CLIP_NAME_BY_STATE)) {
        const clipAsset = animationAssets.find((a) => (a.resource as AnimTrack | undefined)?.name === clipName);
        if (clipAsset?.resource) {
          anim.assignAnimation(state, clipAsset.resource as AnimTrack, undefined, 1, true);
          registeredAny = true;
        }
      }
      if (registeredAny) statesRegisteredRef.current = true;
    }

    // Gated on our own "last requested" ref rather than `activeState`: a
    // transition() blend takes TRANSITION_BLEND_SECONDS to complete, and
    // re-issuing it every frame while `activeState` still reflects the
    // outgoing state would keep restarting the blend and it would never
    // finish. `lastRequestedAnimationRef` starts at null, so the very first
    // request still fires once state registration above completes, even if
    // that lands a frame or two after mount.
    const anim = model.anim;
    if (anim?.baseLayer && statesRegisteredRef.current && lastRequestedAnimationRef.current !== record.animation) {
      anim.baseLayer.transition(record.animation, TRANSITION_BLEND_SECONDS);
      lastRequestedAnimationRef.current = record.animation;
    }
  });

  return (
    <Entity ref={rootRef} name={`remote-${sessionId}`}>
      {asset && (
        <Entity ref={modelRef} position={[0, MODEL_Y_OFFSET, 0]} scale={[MODEL_SCALE, MODEL_SCALE, MODEL_SCALE]}>
          <Render type="asset" asset={asset} />
        </Entity>
      )}
    </Entity>
  );
}
