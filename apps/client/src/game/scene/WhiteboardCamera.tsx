import { useEffect, useState } from "react";
import { Entity } from "@playcanvas/react";
import { Camera } from "@playcanvas/react/components";
import { WHITEBOARD_POSITION, WHITEBOARD_WORLD_HEIGHT, WHITEBOARD_WORLD_WIDTH } from "@multiplayer/shared";

const CAMERA_FOV = 75;
const CAMERA_HEIGHT = 1.7;

/** Dedicated, perfectly square-on camera for drawing on the physical board. */
export function WhiteboardCamera() {
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

  const verticalScale = Math.tan((CAMERA_FOV * Math.PI) / 360);
  const boardTop = WHITEBOARD_POSITION.y + WHITEBOARD_WORLD_HEIGHT / 2 + 0.16;
  const trayBottom = WHITEBOARD_POSITION.y - WHITEBOARD_WORLD_HEIGHT / 2 - 0.32;
  const verticalExtent = Math.max(boardTop - CAMERA_HEIGHT, CAMERA_HEIGHT - trayBottom);
  const distanceForHeight = verticalExtent / verticalScale;
  const distanceForWidth = WHITEBOARD_WORLD_WIDTH / 2 / (verticalScale * aspect);
  const distance = Math.max(distanceForHeight, distanceForWidth) * 1.08;

  return (
    <Entity name="whiteboard-camera" position={[WHITEBOARD_POSITION.x + distance, CAMERA_HEIGHT, WHITEBOARD_POSITION.z]} rotation={[0, 90, 0]}>
      <Camera fov={CAMERA_FOV} nearClip={0.05} farClip={220} priority={1} />
    </Entity>
  );
}
