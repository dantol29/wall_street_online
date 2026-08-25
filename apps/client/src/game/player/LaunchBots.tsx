import { useRef } from "react";
import { Entity } from "@playcanvas/react";
import { Render } from "@playcanvas/react/components";
import { useAppEvent, useModel } from "@playcanvas/react/hooks";
import type { Entity as PcEntity } from "playcanvas";
import {
  CHARACTER_MODEL_ASSET_PATH,
  CHARACTER_MODEL_SCALE,
  CHARACTER_MODEL_Y_OFFSET,
  CHARACTER_MODEL_YAW_OFFSET_DEGREES,
  applyCharacterMaterialFinish,
  registerCharacterAnimationStates,
} from "./characterAnimation";
import type { AnimationState } from "@multiplayer/shared";

interface LaunchBotSpec {
  radiusX: number;
  radiusZ: number;
  centerX: number;
  centerZ: number;
  rotation: number;
  bend: number;
  phase: number;
  speed: number;
  direction: 1 | -1;
  motion: "idle" | "walk" | "run";
}

// Starting value: ten lightweight visual bots make the launch area feel busy
// without adding network traffic or collision bodies. Pass when the center
// feels populated with stable frame time; reduce to six if character skinning
// becomes visible in the frame budget, increase only after measuring it.
const LAUNCH_BOTS: readonly LaunchBotSpec[] = Array.from({ length: 10 }, (_, index) => ({
  radiusX: 3.0 + index * 0.22,
  radiusZ: 3.25 + ((index * 7) % 10) * 0.17,
  centerX: ((index % 3) - 1) * 0.42,
  centerZ: (((index + 1) % 4) - 1.5) * 0.28,
  rotation: (index % 5) * 0.27,
  bend: 0.08 + (index % 4) * 0.07,
  phase: (index / 10) * Math.PI * 2 + (index % 3) * 0.17,
  speed: index % 3 === 1 ? 0.2 + (index % 2) * 0.025 : 0.46 + (index % 4) * 0.04,
  direction: index % 2 === 0 ? -1 : 1,
  motion: "idle",
}));

function LaunchBot({ spec, index }: { spec: LaunchBotSpec; index: number }) {
  const rootRef = useRef<PcEntity | null>(null);
  const modelRef = useRef<PcEntity | null>(null);
  const registeredRef = useRef(false);
  const finishAppliedRef = useRef(false);
  const activeAnimationRef = useRef<AnimationState | null>(null);
  const { asset } = useModel(CHARACTER_MODEL_ASSET_PATH);

  useAppEvent("update", () => {
    const root = rootRef.current;
    const model = modelRef.current;
    if (!root) return;
    const angle = spec.motion === "idle"
      ? spec.phase
      : (Date.now() / 1000) * spec.speed * spec.direction + spec.phase;
    const localX = Math.cos(angle) * spec.radiusX;
    const localZ = Math.sin(angle) * spec.radiusZ + Math.sin(angle * 2 + spec.phase) * spec.bend;
    const rotationCos = Math.cos(spec.rotation);
    const rotationSin = Math.sin(spec.rotation);
    const x = spec.centerX + localX * rotationCos - localZ * rotationSin;
    const z = spec.centerZ + localX * rotationSin + localZ * rotationCos;
    const localDx = -Math.sin(angle) * spec.radiusX * spec.direction;
    const localDz = (Math.cos(angle) * spec.radiusZ + Math.cos(angle * 2 + spec.phase) * spec.bend * 2) * spec.direction;
    const pathDx = localDx * rotationCos - localDz * rotationSin;
    const pathDz = localDx * rotationSin + localDz * rotationCos;
    const dx = spec.motion === "idle" ? -x : pathDx;
    const dz = spec.motion === "idle" ? -z : pathDz;
    root.setPosition(x, 1, z);
    root.setEulerAngles(0, (Math.atan2(dx, dz) * 180) / Math.PI + CHARACTER_MODEL_YAW_OFFSET_DEGREES, 0);

    if (!model || !asset?.resource) return;
    if (!finishAppliedRef.current) finishAppliedRef.current = applyCharacterMaterialFinish(model);
    if (!registeredRef.current) registeredRef.current = registerCharacterAnimationStates(model, asset);
    if (registeredRef.current && activeAnimationRef.current !== spec.motion && model.anim?.baseLayer) {
      model.anim.baseLayer.transition(spec.motion, 0);
      activeAnimationRef.current = spec.motion;
    }
  });

  return (
    <Entity ref={rootRef} name={`launch-bot-${index}`}>
      {asset && (
        <Entity
          ref={modelRef}
          position={[0, CHARACTER_MODEL_Y_OFFSET, 0]}
          scale={[CHARACTER_MODEL_SCALE, CHARACTER_MODEL_SCALE, CHARACTER_MODEL_SCALE]}
        >
          <Render type="asset" asset={asset} />
        </Entity>
      )}
    </Entity>
  );
}

export function LaunchBots() {
  return (
    <>
      {LAUNCH_BOTS.map((spec, index) => (
        <LaunchBot key={index} spec={spec} index={index} />
      ))}
    </>
  );
}
