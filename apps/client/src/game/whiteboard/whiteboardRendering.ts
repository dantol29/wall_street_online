import Konva from "konva";
import {
  WHITEBOARD_HEIGHT,
  WHITEBOARD_WIDTH,
  type WhiteboardShape,
} from "@multiplayer/shared";

export const WHITEBOARD_BACKGROUND = "#f4f2e9";

export function addWhiteboardBackground(layer: Konva.Layer): void {
  layer.add(new Konva.Rect({ x: 0, y: 0, width: WHITEBOARD_WIDTH, height: WHITEBOARD_HEIGHT, fill: WHITEBOARD_BACKGROUND }));
}

export function createWhiteboardShapeNode(shape: WhiteboardShape): Konva.Shape {
  if (shape.type === "stroke") {
    return new Konva.Line({
      points: shape.points,
      stroke: shape.color,
      strokeWidth: shape.width,
      lineCap: "round",
      lineJoin: "round",
      tension: 0.25,
      perfectDrawEnabled: false,
    });
  }
  if (shape.type === "level") {
    return new Konva.Line({
      points: [0, shape.y, WHITEBOARD_WIDTH, shape.y],
      stroke: shape.color,
      strokeWidth: shape.width,
      dash: [18, 10],
    });
  }
  if (shape.type === "arrow") {
    return new Konva.Arrow({
      points: [shape.x1, shape.y1, shape.x2, shape.y2],
      stroke: shape.color,
      fill: shape.color,
      strokeWidth: shape.width,
      pointerLength: 18,
      pointerWidth: 18,
      lineCap: "round",
      lineJoin: "round",
    });
  }
  return new Konva.Text({
    x: shape.x,
    y: shape.y,
    text: shape.text,
    fill: shape.color,
    fontFamily: "Courier New",
    fontStyle: "bold",
    fontSize: shape.fontSize,
    padding: 4,
  });
}

export function renderWhiteboardLayer(layer: Konva.Layer, shapes: readonly WhiteboardShape[]): void {
  layer.destroyChildren();
  addWhiteboardBackground(layer);
  for (const shape of shapes) layer.add(createWhiteboardShapeNode(shape));
  layer.draw();
}
