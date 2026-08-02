import {
  WHITEBOARD_HEIGHT,
  WHITEBOARD_MAX_STROKE_POINTS,
  WHITEBOARD_MAX_TEXT_LENGTH,
  WHITEBOARD_WIDTH,
  type WhiteboardShape,
} from "@multiplayer/shared";

const SHAPE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,80}$/;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

function finiteInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function validBase(shape: Partial<WhiteboardShape>): boolean {
  return (
    typeof shape.id === "string" &&
    SHAPE_ID_PATTERN.test(shape.id) &&
    typeof shape.authorId === "string" &&
    shape.authorId.length <= 80 &&
    typeof shape.color === "string" &&
    HEX_COLOR_PATTERN.test(shape.color)
  );
}

export function validateWhiteboardShape(value: unknown): value is WhiteboardShape {
  if (!value || typeof value !== "object") return false;
  const shape = value as WhiteboardShape;
  if (!validBase(shape)) return false;

  if (shape.type === "stroke") {
    return (
      Array.isArray(shape.points) &&
      shape.points.length >= 4 &&
      shape.points.length <= WHITEBOARD_MAX_STROKE_POINTS &&
      shape.points.length % 2 === 0 &&
      shape.points.every((point, index) =>
        finiteInRange(point, 0, index % 2 === 0 ? WHITEBOARD_WIDTH : WHITEBOARD_HEIGHT),
      ) &&
      finiteInRange(shape.width, 1, 24)
    );
  }

  if (shape.type === "level") {
    return finiteInRange(shape.y, 0, WHITEBOARD_HEIGHT) && finiteInRange(shape.width, 1, 24);
  }

  if (shape.type === "arrow") {
    return (
      finiteInRange(shape.x1, 0, WHITEBOARD_WIDTH) &&
      finiteInRange(shape.y1, 0, WHITEBOARD_HEIGHT) &&
      finiteInRange(shape.x2, 0, WHITEBOARD_WIDTH) &&
      finiteInRange(shape.y2, 0, WHITEBOARD_HEIGHT) &&
      finiteInRange(shape.width, 1, 24)
    );
  }

  if (shape.type === "text") {
    return (
      finiteInRange(shape.x, 0, WHITEBOARD_WIDTH) &&
      finiteInRange(shape.y, 0, WHITEBOARD_HEIGHT) &&
      typeof shape.text === "string" &&
      shape.text.trim().length > 0 &&
      shape.text.length <= WHITEBOARD_MAX_TEXT_LENGTH &&
      finiteInRange(shape.fontSize, 12, 72)
    );
  }

  return false;
}
