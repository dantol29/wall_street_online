import { useEffect, useState } from "react";
import { Entity } from "@playcanvas/react";
import { Camera } from "@playcanvas/react/components";
import { STICKY_WALL_POSITION } from "@multiplayer/shared";
import { computeStickyWallCameraFrame } from "./stickyWallBoardProjection";

const CAMERA_FOV = 75;

/** Dedicated camera looking squarely at the physical sticky-note wall. */
export function StickyWallCamera() {
  const [aspect, setAspect] = useState(() => Math.max(0.5, window.innerWidth / Math.max(1, window.innerHeight)));
  useEffect(() => {
    const updateAspect = () => setAspect(Math.max(0.5, window.innerWidth / Math.max(1, window.innerHeight)));
    window.addEventListener("resize", updateAspect);
    window.addEventListener("orientationchange", updateAspect);
    return () => {
      window.removeEventListener("resize", updateAspect);
      window.removeEventListener("orientationchange", updateAspect);
    };
  }, []);

  const frame = computeStickyWallCameraFrame(CAMERA_FOV, aspect);
  return (
    <Entity
      name="sticky-wall-camera"
      position={[STICKY_WALL_POSITION.x - frame.distance, STICKY_WALL_POSITION.y, STICKY_WALL_POSITION.z]}
      rotation={[0, -90, 0]}
    >
      <Camera fov={CAMERA_FOV} nearClip={0.05} farClip={220} priority={1} />
    </Entity>
  );
}
