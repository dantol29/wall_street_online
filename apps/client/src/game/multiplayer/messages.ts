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
  seatedDeskId: string | null;
  /** Empty/null until this player links a wallet — see WalletPanel. */
  walletAddress: string | null;
  /** Which office alcove (see OFFICE_SLOTS) this player is currently bound to, if any. */
  officeSlotId: string | null;
}
