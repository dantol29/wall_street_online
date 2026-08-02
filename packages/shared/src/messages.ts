export type AnimationState = "idle" | "walk" | "run";

export const ANIMATION_STATES: readonly AnimationState[] = ["idle", "walk", "run"];

export interface PlayerInputMessage {
  sequence: number;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  animation: AnimationState;
}

export interface ChatMessage {
  senderId: string;
  displayName: string;
  text: string;
  timestamp: number;
}

export interface ChatSendMessage {
  text: string;
}
