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

const BOARD_FACE_X = WHITEBOARD_POSITION.x + 0.13;
const TOOL_FACE_X = WHITEBOARD_POSITION.x + 0.51;
const ERASER_RADIUS = 26;
const MARKER_WORLD_Y = WHITEBOARD_POSITION.y - 1.94;
const ERASER_WORLD_Y = WHITEBOARD_POSITION.y - 1.93;

type EquippedTool =
  | { type: "pen"; color: string; label: string }
  | { type: "eraser"; label: string };

const TRAY_MARKERS: ReadonlyArray<EquippedTool & { z: number }> = [
  { type: "pen", color: "#161b19", label: "Black marker", z: -0.55 },
  { type: "pen", color: "#1769aa", label: "Blue marker", z: 0 },
  { type: "pen", color: "#c7352e", label: "Red marker", z: 0.55 },
];

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
  const activePointerIdRef = useRef<number | null>(null);
  const lastBroadcastAtRef = useRef(0);
  const deletedIdsRef = useRef(new Set<string>());
  const [overBoard, setOverBoard] = useState(false);
  const [hoveringTool, setHoveringTool] = useState(false);
  const [equippedTool, setEquippedTool] = useState<EquippedTool>(TRAY_MARKERS[0]);
  const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });
  const isPresenter = Boolean(localSessionId && snapshot.presenterSessionId === localSessionId);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const pointOnPlane = (
    event: React.PointerEvent<HTMLDivElement>,
    planeX: number,
  ): { y: number; z: number } | null => {
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
    const amount = (planeX - near.x) / rayX;
    if (amount < 0 || amount > 1) return null;

    return {
      y: near.y + (far.y - near.y) * amount,
      z: near.z + (far.z - near.z) * amount,
    };
  };

  const boardPoint = (event: React.PointerEvent<HTMLDivElement>): { x: number; y: number } | null => {
    const worldPoint = pointOnPlane(event, BOARD_FACE_X);
    if (!worldPoint) return null;
    const worldY = worldPoint.y;
    const worldZ = worldPoint.z;
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

  const trayToolAt = (event: React.PointerEvent<HTMLDivElement>): EquippedTool | null => {
    const point = pointOnPlane(event, TOOL_FACE_X);
    if (!point) return null;
    for (const marker of TRAY_MARKERS) {
      if (
        Math.abs(point.y - MARKER_WORLD_Y) <= 0.18 &&
        Math.abs(point.z - marker.z) <= 0.24
      ) {
        return marker;
      }
    }
    if (
      Math.abs(point.y - ERASER_WORLD_Y) <= 0.2 &&
      Math.abs(point.z - 1.35) <= 0.3
    ) {
      return { type: "eraser", label: "Eraser" };
    }
    return null;
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
    event.preventDefault();
    if (event.button === 0) {
      const trayTool = trayToolAt(event);
      if (trayTool) {
        setEquippedTool(trayTool);
        return;
      }
    }
    const point = boardPoint(event);
    if (!point) return;
    activePointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (event.button === 2 || equippedTool.type === "eraser") {
      eraseAt(point);
      return;
    }
    if (!localSessionId) return;
    const shape: WhiteboardShape = {
      id: crypto.randomUUID(),
      authorId: localSessionId,
      type: "stroke",
      color: equippedTool.color,
      points: [point.x, point.y, point.x, point.y],
      width: 5,
    };
    draftRef.current = shape;
    publish(shape, true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    setCursorPosition({ x: event.clientX, y: event.clientY });
    setHoveringTool(Boolean(trayToolAt(event)));
    const point = boardPoint(event);
    setOverBoard(Boolean(point));
    if (!isPresenter || !point) return;
    const pointerIsDown = activePointerIdRef.current === event.pointerId;
    const erasing =
      (event.buttons & 2) !== 0 ||
      (pointerIsDown && equippedTool.type === "eraser");
    if (erasing) {
      eraseAt(point);
      return;
    }
    const draft = draftRef.current;
    if (!draft || draft.type !== "stroke" || !pointerIsDown) return;
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
    if (activePointerIdRef.current === event.pointerId) {
      activePointerIdRef.current = null;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div
      className={`in-world-whiteboard${overBoard && isPresenter ? " in-world-whiteboard--active" : ""}${hoveringTool && isPresenter ? " in-world-whiteboard--tool-hover" : ""}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button
        type="button"
        className="in-world-whiteboard__close"
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }}
      >
        Finish
      </button>
      {overBoard && isPresenter && (
        <div
          className={`in-world-whiteboard__cursor in-world-whiteboard__cursor--${equippedTool.type}`}
          style={{
            left: cursorPosition.x,
            top: cursorPosition.y,
            borderColor: equippedTool.type === "pen" ? equippedTool.color : undefined,
          }}
        />
      )}
      <div className="in-world-whiteboard__hint">
        {isPresenter
          ? <>
              <span className="in-world-whiteboard__hint-desktop">
                {equippedTool.label} selected · Click a tool on the tray · Left drag: use · Right drag: quick erase · Esc: finish
              </span>
              <span className="in-world-whiteboard__hint-touch">
                {equippedTool.label} selected · Tap a marker or eraser on the tray, then draw
              </span>
            </>
          : snapshot.presenterDisplayName
            ? `${snapshot.presenterDisplayName} is using the board · Esc: step away`
            : "Waiting for the board · Esc: step away"}
      </div>
    </div>
  );
}
