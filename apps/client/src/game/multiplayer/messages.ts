import type { AnimationState, ChatMessage } from "@multiplayer/shared";

export type { ChatMessage };

export type ConnectionState = "connecting" | "connected" | "reconnecting" | "disconnected";

export interface RemotePlayerSnapshot {
  sessionId: string;
  displayName: string;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  animation: AnimationState;
}
