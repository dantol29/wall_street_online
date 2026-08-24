export const WHITEBOARD_WIDTH = 1280;
export const WHITEBOARD_HEIGHT = 720;
export const WHITEBOARD_WORLD_WIDTH = 6.6;
export const WHITEBOARD_WORLD_HEIGHT = 3.72;
export const WHITEBOARD_MAX_SHAPES = 500;
export const WHITEBOARD_MAX_STROKE_POINTS = 2048;
export const WHITEBOARD_MAX_TEXT_LENGTH = 160;

export const WHITEBOARD_POSITION = {
  // Project the board in front of the west-wall structural piers. Their
  // interior face reaches x=-15.60, so the frame's rear face must sit farther
  // into the room instead of intersecting the columns.
  x: -15.35,
  y: 3.25,
  z: -3.8,
} as const;

export const WHITEBOARD_INTERACTION_POSITION = {
  x: -13.77,
  z: -3.8,
} as const;

export const WHITEBOARD_INTERACTION_DISTANCE_METERS = 2.4;

export type WhiteboardShapeType = "stroke" | "level" | "arrow" | "text";

interface WhiteboardShapeBase {
  id: string;
  authorId: string;
  type: WhiteboardShapeType;
  color: string;
}

export interface WhiteboardStrokeShape extends WhiteboardShapeBase {
  type: "stroke";
  points: number[];
  width: number;
}

export interface WhiteboardLevelShape extends WhiteboardShapeBase {
  type: "level";
  y: number;
  width: number;
}

export interface WhiteboardArrowShape extends WhiteboardShapeBase {
  type: "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
}

export interface WhiteboardTextShape extends WhiteboardShapeBase {
  type: "text";
  x: number;
  y: number;
  text: string;
  fontSize: number;
}

export type WhiteboardShape =
  | WhiteboardStrokeShape
  | WhiteboardLevelShape
  | WhiteboardArrowShape
  | WhiteboardTextShape;

export interface WhiteboardSnapshot {
  shapes: WhiteboardShape[];
  presenterSessionId: string | null;
  presenterDisplayName: string | null;
}

export interface WhiteboardShapeDeleteMessage {
  id: string;
}
