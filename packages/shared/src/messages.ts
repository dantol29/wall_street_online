/**
 * `walk_left`/`walk_right`/`run_left`/`run_right`/`walk_back`/`run_back` are
 * directional variants for strafing and moving backward — the character
 * model has dedicated left/right/backward clips for these.
 */
export type AnimationState =
  | "idle"
  | "walk"
  | "run"
  | "walk_left"
  | "walk_right"
  | "run_left"
  | "run_right"
  | "walk_back"
  | "run_back";

export const ANIMATION_STATES: readonly AnimationState[] = [
  "idle",
  "walk",
  "run",
  "walk_left",
  "walk_right",
  "run_left",
  "run_right",
  "walk_back",
  "run_back",
];

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

export interface SeatRequestMessage {
  deskId: string | null;
}

export interface SeatResultMessage {
  success: boolean;
  deskId: string | null;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  message?: string;
}

export interface VoiceTokenRequestMessage {
  requestId: number;
}

export interface VoiceTokenResultMessage {
  requestId: number;
  enabled: boolean;
  serverUrl: string;
  token?: string;
  message?: string;
}
