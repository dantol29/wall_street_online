import { Schema, type } from "@colyseus/schema";
import type { AnimationState } from "@multiplayer/shared";

export class PlayerState extends Schema {
  @type("string")
  id: string = "";

  @type("string")
  displayName: string = "";

  @type("number")
  x: number = 0;

  @type("number")
  y: number = 0;

  @type("number")
  z: number = 0;

  @type("number")
  rotationY: number = 0;

  @type("string")
  animation: AnimationState = "idle";
}
