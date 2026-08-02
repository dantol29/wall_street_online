import { useEffect, useRef, useState, type RefObject } from "react";
import type { Entity as PcEntity } from "playcanvas";
import {
  WHITEBOARD_HEIGHT,
  WHITEBOARD_POSITION,
  WHITEBOARD_WIDTH,
  WHITEBOARD_WORLD_HEIGHT,
  WHITEBOARD_WORLD_WIDTH,
  type WhiteboardShape,
  type WhiteboardSnapshot,
} from "@multiplayer/shared";

const BOARD_FACE_X = WHITEBOARD_POSITION.x + 0.1;
const ERASER_RADIUS = 26;

interface InWorldWhiteboardControlsProps {
  playerEntityRef: RefObject<PcEntity | null>;
  snapshot: WhiteboardSnapshot;
  localSessionId: string | null;
  onClose: () => void;
  onUpsertShape: (shape: WhiteboardShape) => void;
  onDeleteShape: (id: string) => void;
}

function distanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(px - x1, py - y1);
  const amount = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSquared));
  return Math.hypot(px - (x1 + amount * dx), py - (y1 + amount * dy));
}

export function InWorldWhiteboardControls({
  playerEntityRef,
  snapshot,
  localSessionId,
  onClose,
  onUpsertShape,
  onDeleteShape,
}: InWorldWhiteboardControlsProps) {
  const draftRef = useRef<WhiteboardShape | null>(null);
  const lastBroadcastAtRef = useRef(0);
  const deletedIdsRef = useRef(new Set<string>());
  const [overBoard, setOverBoard] = useState(false);
  const isPresenter = Boolean(localSessionId && snapshot.presenterSessionId === localSessionId);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const boardPoint = (event: React.PointerEvent<HTMLDivElement>): { x: number; y: number } | null => {
    const cameraEntity = playerEntityRef.current?.findByName("local-camera") as PcEntity | null;
    const camera = cameraEntity?.camera;
    if (!camera) return null;
    const canvas = camera.system.app.graphicsDevice.canvas;
    const bounds = canvas.getBoundingClientRect();
    const screenX = event.clientX - bounds.left;
    const screenY = event.clientY - bounds.top;
    if (screenX < 0 || screenY < 0 || screenX > bounds.width || screenY > bounds.height) return null;

    const near = camera.screenToWorld(screenX, screenY, camera.nearClip);
    const far = camera.screenToWorld(screenX, screenY, camera.farClip);
    const rayX = far.x - near.x;
    if (Math.abs(rayX) < 0.0001) return null;
    const amount = (BOARD_FACE_X - near.x) / rayX;
    if (amount < 0 || amount > 1) return null;

    const worldY = near.y + (far.y - near.y) * amount;
    const worldZ = near.z + (far.z - near.z) * amount;
    const halfWidth = WHITEBOARD_WORLD_WIDTH / 2;
    const halfHeight = WHITEBOARD_WORLD_HEIGHT / 2;
    if (
      worldY < WHITEBOARD_POSITION.y - halfHeight ||
      worldY > WHITEBOARD_POSITION.y + halfHeight ||
      worldZ < WHITEBOARD_POSITION.z - halfWidth ||
      worldZ > WHITEBOARD_POSITION.z + halfWidth
    ) {
      return null;
    }

    return {
      x:
        ((WHITEBOARD_POSITION.z + halfWidth - worldZ) / WHITEBOARD_WORLD_WIDTH) *
        WHITEBOARD_WIDTH,
      y:
        ((WHITEBOARD_POSITION.y + halfHeight - worldY) / WHITEBOARD_WORLD_HEIGHT) *
        WHITEBOARD_HEIGHT,
    };
  };

  const publish = (shape: WhiteboardShape, force = false): void => {
    const now = performance.now();
    if (!force && now - lastBroadcastAtRef.current < 50) return;
    lastBroadcastAtRef.current = now;
    onUpsertShape(shape);
  };

  const eraseAt = (point: { x: number; y: number }): void => {
    for (let shapeIndex = snapshot.shapes.length - 1; shapeIndex >= 0; shapeIndex -= 1) {
      const shape = snapshot.shapes[shapeIndex];
      if (shape.type !== "stroke" || deletedIdsRef.current.has(shape.id)) continue;
      for (let index = 0; index < shape.points.length - 2; index += 2) {
        if (
          distanceToSegment(
            point.x,
            point.y,
            shape.points[index],
            shape.points[index + 1],
            shape.points[index + 2],
            shape.points[index + 3],
          ) <= ERASER_RADIUS
        ) {
          deletedIdsRef.current.add(shape.id);
          onDeleteShape(shape.id);
          return;
        }
      }
    }
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!isPresenter || (event.button !== 0 && event.button !== 2)) return;
    const point = boardPoint(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (event.button === 2) {
      eraseAt(point);
      return;
    }
    if (!localSessionId) return;
    const shape: WhiteboardShape = {
      id: crypto.randomUUID(),
      authorId: localSessionId,
      type: "stroke",
      color: "#161b19",
      points: [point.x, point.y, point.x, point.y],
      width: 5,
    };
    draftRef.current = shape;
    publish(shape, true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const point = boardPoint(event);
    setOverBoard(Boolean(point));
    if (!isPresenter || !point) return;
    if ((event.buttons & 2) !== 0) {
      eraseAt(point);
      return;
    }
    const draft = draftRef.current;
    if (!draft || draft.type !== "stroke" || (event.buttons & 1) === 0) return;
    const next: WhiteboardShape = {
      ...draft,
      points: [...draft.points, point.x, point.y].slice(-2048),
    };
    draftRef.current = next;
    publish(next);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>): void => {
    const draft = draftRef.current;
    if (draft) publish(draft, true);
    draftRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div
      className={`in-world-whiteboard${overBoard && isPresenter ? " in-world-whiteboard--active" : ""}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="in-world-whiteboard__hint">
        {isPresenter
          ? "Draw directly on the board · Left drag: pen · Right drag: eraser · Esc: finish"
          : snapshot.presenterDisplayName
            ? `${snapshot.presenterDisplayName} is using the board · Esc: step away`
            : "Waiting for the board · Esc: step away"}
      </div>
    </div>
  );
}
