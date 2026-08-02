import { useEffect, useMemo, useRef, useState } from "react";
import { Arrow, Layer, Line, Rect, Stage, Text } from "react-konva";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import {
  WHITEBOARD_HEIGHT,
  WHITEBOARD_WIDTH,
  type WhiteboardShape,
  type WhiteboardSnapshot,
} from "@multiplayer/shared";
import {
  WHITEBOARD_BACKGROUND,
} from "../game/whiteboard/whiteboardRendering";

type Tool = "pen" | "eraser";

interface CollaborativeWhiteboardProps {
  snapshot: WhiteboardSnapshot;
  localSessionId: string | null;
  onClose: () => void;
  onRequestPresenter: () => void;
  onUpsertShape: (shape: WhiteboardShape) => void;
  onDeleteShape: (id: string) => void;
  onClear: () => void;
}

const COLORS = ["#161b19", "#1769aa", "#c7352e", "#218653", "#8b4aa0"];

function ShapeNode({
  shape,
  erasable,
  onErase,
}: {
  shape: WhiteboardShape;
  erasable: boolean;
  onErase: (id: string) => void;
}) {
  const common = {
    id: shape.id,
    listening: erasable,
    onPointerDown: (event: KonvaEventObject<PointerEvent>) => {
      if (!erasable) return;
      event.cancelBubble = true;
      onErase(shape.id);
    },
  };
  if (shape.type === "stroke") {
    return (
      <Line
        {...common}
        points={shape.points}
        stroke={shape.color}
        strokeWidth={shape.width}
        lineCap="round"
        lineJoin="round"
        tension={0.25}
        perfectDrawEnabled={false}
      />
    );
  }
  if (shape.type === "level") {
    return (
      <Line
        {...common}
        points={[0, shape.y, WHITEBOARD_WIDTH, shape.y]}
        stroke={shape.color}
        strokeWidth={shape.width}
        dash={[18, 10]}
      />
    );
  }
  if (shape.type === "arrow") {
    return (
      <Arrow
        {...common}
        points={[shape.x1, shape.y1, shape.x2, shape.y2]}
        stroke={shape.color}
        fill={shape.color}
        strokeWidth={shape.width}
        pointerLength={18}
        pointerWidth={18}
        lineCap="round"
        lineJoin="round"
      />
    );
  }
  return (
    <Text
      {...common}
      x={shape.x}
      y={shape.y}
      text={shape.text}
      fill={shape.color}
      fontFamily="Courier New"
      fontStyle="bold"
      fontSize={shape.fontSize}
      padding={4}
    />
  );
}

export function CollaborativeWhiteboard({
  snapshot,
  localSessionId,
  onClose,
  onRequestPresenter,
  onUpsertShape,
  onDeleteShape,
  onClear,
}: CollaborativeWhiteboardProps) {
  const stageRef = useRef<Konva.Stage | null>(null);
  const drawingRef = useRef(false);
  const draftShapeRef = useRef<WhiteboardShape | null>(null);
  const lastBroadcastAtRef = useRef(0);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [draftShape, setDraftShape] = useState<WhiteboardShape | null>(null);
  const isPresenter = Boolean(localSessionId && snapshot.presenterSessionId === localSessionId);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const visibleShapes = useMemo(() => {
    if (!draftShape) return snapshot.shapes;
    const existingIndex = snapshot.shapes.findIndex((shape) => shape.id === draftShape.id);
    if (existingIndex < 0) return [...snapshot.shapes, draftShape];
    return snapshot.shapes.map((shape, index) => (index === existingIndex ? draftShape : shape));
  }, [draftShape, snapshot.shapes]);

  const pointer = (event: KonvaEventObject<PointerEvent>): { x: number; y: number } | null => {
    const stage = stageRef.current;
    if (!stage) return null;
    const bounds = stage.container().getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return null;
    const position = {
      x: ((event.evt.clientX - bounds.left) / bounds.width) * WHITEBOARD_WIDTH,
      y: ((event.evt.clientY - bounds.top) / bounds.height) * WHITEBOARD_HEIGHT,
    };
    return {
      x: Math.max(0, Math.min(WHITEBOARD_WIDTH, position.x)),
      y: Math.max(0, Math.min(WHITEBOARD_HEIGHT, position.y)),
    };
  };

  const publish = (shape: WhiteboardShape, force = false): void => {
    const now = performance.now();
    if (!force && now - lastBroadcastAtRef.current < 50) return;
    lastBroadcastAtRef.current = now;
    onUpsertShape(shape);
  };

  const handlePointerDown = (event: KonvaEventObject<PointerEvent>): void => {
    if (!isPresenter || tool === "eraser") return;
    const position = pointer(event);
    if (!position || !localSessionId) return;
    const id = crypto.randomUUID();

    drawingRef.current = true;
    const shape: WhiteboardShape = {
      id,
      authorId: localSessionId,
      type: "stroke",
      color,
      points: [position.x, position.y, position.x, position.y],
      width: 5,
    };
    setDraftShape(shape);
    draftShapeRef.current = shape;
    publish(shape, true);
  };

  const handlePointerMove = (event: KonvaEventObject<PointerEvent>): void => {
    const currentDraft = draftShapeRef.current;
    if (!drawingRef.current || !currentDraft) return;
    const position = pointer(event);
    if (!position) return;
    const next: WhiteboardShape =
      currentDraft.type === "stroke"
        ? { ...currentDraft, points: [...currentDraft.points, position.x, position.y].slice(-2048) }
        : currentDraft;
    draftShapeRef.current = next;
    setDraftShape(next);
    publish(next);
  };

  const handlePointerUp = (_event: KonvaEventObject<PointerEvent>): void => {
    const currentDraft = draftShapeRef.current;
    if (!drawingRef.current || !currentDraft) return;
    drawingRef.current = false;
    publish(currentDraft, true);
    draftShapeRef.current = null;
    setDraftShape(null);
  };

  return (
    <div className="whiteboard-backdrop">
      <section className="whiteboard-shell" role="dialog" aria-modal="true" aria-label="Collaborative analysis board">
        <header className="whiteboard-header">
          <div>
            <span className="whiteboard-kicker">TRADING FLOOR · LIVE ANALYSIS</span>
            <strong>
              {isPresenter
                ? "You are presenting"
                : snapshot.presenterDisplayName
                  ? `Watching ${snapshot.presenterDisplayName}`
                  : "Board is available"}
            </strong>
          </div>
          <div className="whiteboard-header__actions">
            {!snapshot.presenterSessionId && (
              <button type="button" onClick={onRequestPresenter}>Take board</button>
            )}
            <button type="button" onClick={onClose}>Close <kbd>Esc</kbd></button>
          </div>
        </header>

        <div className="whiteboard-workspace">
          <aside className="whiteboard-tools" aria-label="Board tools">
            {([
              ["pen", "Pen"],
              ["eraser", "Erase"],
            ] as Array<[Tool, string]>).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={tool === value ? "whiteboard-tool whiteboard-tool--active" : "whiteboard-tool"}
                onClick={() => setTool(value)}
                disabled={!isPresenter}
              >
                {label}
              </button>
            ))}
            <div className="whiteboard-colors">
              {COLORS.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-label={`Use ${value}`}
                  className={color === value ? "whiteboard-color whiteboard-color--active" : "whiteboard-color"}
                  style={{ backgroundColor: value }}
                  onClick={() => setColor(value)}
                  disabled={!isPresenter}
                />
              ))}
            </div>
            <button
              type="button"
              className="whiteboard-clear"
              disabled={!isPresenter || snapshot.shapes.length === 0}
              onClick={() => {
                if (window.confirm("Clear the analysis board for everyone?")) onClear();
              }}
            >
              Clear board
            </button>
          </aside>

          <div className={isPresenter ? "whiteboard-canvas whiteboard-canvas--editing" : "whiteboard-canvas"}>
            <Stage
              ref={stageRef}
              width={WHITEBOARD_WIDTH}
              height={WHITEBOARD_HEIGHT}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            >
              <Layer>
                <Rect width={WHITEBOARD_WIDTH} height={WHITEBOARD_HEIGHT} fill={WHITEBOARD_BACKGROUND} />
                {visibleShapes.map((shape) => (
                  <ShapeNode key={shape.id} shape={shape} erasable={isPresenter && tool === "eraser"} onErase={onDeleteShape} />
                ))}
              </Layer>
            </Stage>
            {!isPresenter && (
              <div className="whiteboard-viewer-label">
                {snapshot.presenterDisplayName ? "VIEW ONLY · LIVE" : "NO PRESENTER"}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
