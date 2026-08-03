import { describe, expect, it } from "vitest";
import { rectangleToQuadMatrix3d } from "./projectiveTransform";

function parseMatrix(matrix: string): number[] {
  return matrix.slice("matrix3d(".length, -1).split(",").map(Number);
}

function transform(matrix: number[], x: number, y: number): [number, number] {
  const projectedX = matrix[0] * x + matrix[4] * y + matrix[12];
  const projectedY = matrix[1] * x + matrix[5] * y + matrix[13];
  const projectedW = matrix[3] * x + matrix[7] * y + matrix[15];
  return [projectedX / projectedW, projectedY / projectedW];
}

describe("rectangleToQuadMatrix3d", () => {
  it("maps every rectangle corner onto a perspective quadrilateral", () => {
    const destination = [
      { x: 100, y: 80 },
      { x: 510, y: 110 },
      { x: 470, y: 360 },
      { x: 130, y: 330 },
    ] as const;
    const result = rectangleToQuadMatrix3d(1440, 870, destination);
    expect(result).not.toBeNull();
    const matrix = parseMatrix(result!);

    expect(transform(matrix, 0, 0)).toEqual([destination[0].x, destination[0].y]);
    expect(transform(matrix, 1440, 0)[0]).toBeCloseTo(destination[1].x);
    expect(transform(matrix, 1440, 0)[1]).toBeCloseTo(destination[1].y);
    expect(transform(matrix, 1440, 870)[0]).toBeCloseTo(destination[2].x);
    expect(transform(matrix, 1440, 870)[1]).toBeCloseTo(destination[2].y);
    expect(transform(matrix, 0, 870)[0]).toBeCloseTo(destination[3].x);
    expect(transform(matrix, 0, 870)[1]).toBeCloseTo(destination[3].y);
  });
});
