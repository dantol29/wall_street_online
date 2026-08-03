import {
  Quat,
  Vec3,
  type Asset,
  type AnimComponent,
  type AnimTrack,
  type Entity as PcEntity,
  type GraphNode,
} from "playcanvas";
import type { AnimationState } from "@multiplayer/shared";

/** Quaternius's "Business Man" (poly.pizza, CC0 — see README): the one rigged, animated humanoid used for every player, remote or local. */
export const CHARACTER_MODEL_ASSET_PATH = "/assets/BusinessMan.glb";

/**
 * Unlike CesiumMan, this model already has a 100x scale correction baked into
 * its mesh nodes by the FBX->glTF export (raw mesh data is ~0.0186 units tall,
 * matching Quaternius/FBX2glTF's usual cm-authoring convention) — so it renders
 * at its natural ~1.86m out of the box. No extra entity-level scale needed.
 */
export const CHARACTER_MODEL_SCALE = 1;

/**
 * The player capsule (server-authoritative position for remote players; the
 * ready-made first-person-controller script's own capsule for the local one)
 * is centered on its entity origin with half-height 1.0, so its reported Y
 * sits ~1m above the floor at rest. Like most humanoid rigs, this model's feet
 * are at its local origin, so shifting it down by that same 1m lines its feet
 * up with the floor.
 */
export const CHARACTER_MODEL_Y_OFFSET = -1;
/** Lowers the rig's hips onto the office-chair cushion while its legs are posed for sitting. */
export const CHARACTER_SEATED_MODEL_Y_OFFSET = CHARACTER_MODEL_Y_OFFSET - 0.55;

/**
 * This FBX-exported rig faces the opposite way from our rotationY convention
 * (a common mismatch — Mixamo/FBX2glTF characters are frequently authored
 * facing -Z relative to the target engine's +Z forward), confirmed visually:
 * the avatar showed its back to the direction it should have been facing.
 */
export const CHARACTER_MODEL_YAW_OFFSET_DEGREES = 180;

/** Crossfade duration between animation states, matching PlayCanvas's own anim-blending tutorial. */
export const CHARACTER_ANIM_TRANSITION_BLEND_SECONDS = 0.2;

/**
 * The mesh node covering the head (see the glTF's node list: Suit_Head, a
 * sibling of Suit_Body/Suit_Legs/Suit_Feet, each its own skinned mesh) — the
 * local player disables this one specifically, since it would otherwise sit
 * right in front of the eye-height camera and clip into view when looking
 * down or around. Remote players keep it (see RemotePlayer.tsx).
 */
export const CHARACTER_HEAD_NODE_NAME = "Suit_Head";

export interface CharacterSeatedPoseRig {
  upperLegLeft: GraphNode;
  lowerLegLeft: GraphNode;
  footLeft: GraphNode;
  upperLegRight: GraphNode;
  lowerLegRight: GraphNode;
  footRight: GraphNode;
}

/** Resolves the six leg bones once so the seated pose does not search the hierarchy every frame. */
export function resolveCharacterSeatedPoseRig(model: PcEntity): CharacterSeatedPoseRig | null {
  const upperLegLeft = model.findByName("UpperLeg.L");
  const lowerLegLeft = model.findByName("LowerLeg.L");
  const footLeft = model.findByName("Foot.L");
  const upperLegRight = model.findByName("UpperLeg.R");
  const lowerLegRight = model.findByName("LowerLeg.R");
  const footRight = model.findByName("Foot.R");
  if (!upperLegLeft || !lowerLegLeft || !footLeft || !upperLegRight || !lowerLegRight || !footRight) {
    return null;
  }
  return { upperLegLeft, lowerLegLeft, footLeft, upperLegRight, lowerLegRight, footRight };
}

const boneDirection = new Vec3();
const seatedForward = new Vec3();
const seatedThighDirection = new Vec3();
const boneRotationDelta = new Quat();
const posedBoneRotation = new Quat();

/** Points a bone's +Y length axis in a world direction while preserving its current twist. */
function pointBoneAlong(bone: GraphNode, direction: Vec3): void {
  const currentRotation = bone.getRotation();
  currentRotation.transformVector(Vec3.UP, boneDirection).normalize();
  boneRotationDelta.setFromDirections(boneDirection, direction);
  posedBoneRotation.mul2(boneRotationDelta, currentRotation);
  bone.setRotation(posedBoneRotation);
}

/**
 * BusinessMan.glb has no sitting clip. This procedural layer bends its thighs
 * toward its visual front, drops the shins, and points the shoes forward.
 * Apply it during prerender, after the neutral idle animation is evaluated.
 */
export function applyCharacterSeatedPose(model: PcEntity, rig: CharacterSeatedPoseRig): void {
  // The FBX mesh faces opposite PlayCanvas's GraphNode.forward convention.
  seatedForward.copy(model.forward).mulScalar(-1);
  seatedForward.y = 0;
  if (seatedForward.lengthSq() < 0.0001) seatedForward.set(0, 0, 1);
  seatedForward.normalize();

  // A slight slope puts the knees naturally below the hips.
  seatedThighDirection.copy(seatedForward);
  seatedThighDirection.y = -0.12;
  seatedThighDirection.normalize();

  pointBoneAlong(rig.upperLegLeft, seatedThighDirection);
  pointBoneAlong(rig.upperLegRight, seatedThighDirection);
  pointBoneAlong(rig.lowerLegLeft, Vec3.DOWN);
  pointBoneAlong(rig.lowerLegRight, Vec3.DOWN);
  pointBoneAlong(rig.footLeft, seatedForward);
  pointBoneAlong(rig.footRight, seatedForward);
}

/**
 * Real GLB clip names, mapped to our animation states, each with its own
 * playback speed. Registered as anim-component states under our own (short)
 * state names below, since @playcanvas/react's <Anim> only supports a single
 * clip declaratively — see registerCharacterAnimationStates.
 */
export const CHARACTER_CLIP_CONFIG_BY_STATE: Record<AnimationState, { clip: string; speed: number; loop?: boolean }> = {
  // "CharacterArmature|Idle" (the more obviously-named clip) only animates 21 of
  // the 34 bones Walk/Run drive — critically, it never touches Foot.L/Foot.R, so
  // switching from Walk to it left the legs frozen mid-stride (PlayCanvas's anim
  // layer only overwrites the bones a clip actually has curves for; anything
  // else just keeps its last value from whatever played before). "Idle_Neutral"
  // covers both feet and only misses minor wrist/finger/neck bones instead.
  idle: { clip: "CharacterArmature|Idle_Neutral", speed: 1 },
  walk: { clip: "CharacterArmature|Walk", speed: 1 },
  run: { clip: "CharacterArmature|Run", speed: 1 },
  // The model ships dedicated Run_Left/Run_Right strafe clips but no
  // Walk_Left/Walk_Right — reusing the running strafe clips at a slower
  // playback speed for the walking-pace states reads far better than falling
  // back to the forward walk pose while visibly sliding sideways.
  walk_left: { clip: "CharacterArmature|Run_Left", speed: 0.65 },
  walk_right: { clip: "CharacterArmature|Run_Right", speed: 0.65 },
  run_left: { clip: "CharacterArmature|Run_Left", speed: 1 },
  run_right: { clip: "CharacterArmature|Run_Right", speed: 1 },
  walk_back: { clip: "CharacterArmature|Run_Back", speed: 0.65 },
  run_back: { clip: "CharacterArmature|Run_Back", speed: 1 },
  wave: { clip: "CharacterArmature|Wave", speed: 1, loop: false },
};

/**
 * Registers every clip in CHARACTER_CLIP_CONFIG_BY_STATE as a state on the
 * model's (lazily added) anim component. Idempotent to call repeatedly —
 * callers gate that themselves on their own "registered" ref, same as before
 * this was extracted (the asset's animation list may not be populated yet on
 * the first few calls). Returns true once at least one state registered.
 */
export function registerCharacterAnimationStates(model: PcEntity, asset: Asset): boolean {
  const anim = (model.anim ?? model.addComponent("anim")) as AnimComponent;
  // `resource.animations` isn't part of ContainerResource's public type but
  // is populated at runtime: one Asset per glTF animation clip. Each Asset's
  // own `.name` is an index-based string PlayCanvas generates itself (e.g.
  // "BusinessMan/animation/3"), NOT the glTF clip name — that original name
  // ("CharacterArmature|Idle") only survives on the wrapped AnimTrack's own
  // `.resource.name`.
  const animationAssets = (asset.resource as { animations?: Asset[] }).animations ?? [];
  let registeredAny = false;
  for (const [state, { clip: clipName, speed, loop = true }] of Object.entries(CHARACTER_CLIP_CONFIG_BY_STATE)) {
    const clipAsset = animationAssets.find((a) => (a.resource as AnimTrack | undefined)?.name === clipName);
    if (clipAsset?.resource) {
      anim.assignAnimation(state, clipAsset.resource as AnimTrack, undefined, speed, loop);
      registeredAny = true;
    }
  }
  return registeredAny;
}
