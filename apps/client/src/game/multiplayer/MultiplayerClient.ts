import { Client, getStateCallbacks, Room } from "colyseus.js";
import { ROOM_NAME, type ChatMessage, type PlayerInputMessage } from "@multiplayer/shared";
import type { ConnectionState, RemotePlayerSnapshot } from "./messages";

const RECONNECTION_TOKEN_STORAGE_KEY = "colyseusReconnectionToken";

export interface MultiplayerClientCallbacks {
  onConnectionStateChange: (state: ConnectionState) => void;
  onPlayerAdd: (snapshot: RemotePlayerSnapshot) => void;
  onPlayerUpdate: (snapshot: RemotePlayerSnapshot) => void;
  onPlayerRemove: (sessionId: string) => void;
  onChatMessage: (message: ChatMessage) => void;
  onLocalSpawn: (spawn: { x: number; y: number; z: number }) => void;
}

/**
 * Wraps colyseus.js: connects, joins `social_room`, translates schema events into
 * plain callbacks, and handles reconnection. `room.state` is untyped (`any`) here —
 * colyseus.js reconstructs the schema shape from the wire protocol at runtime, so
 * the client never needs the server's concrete PlayerState/SocialRoomState classes.
 */
export class MultiplayerClient {
  private readonly client: Client;
  private readonly callbacks: MultiplayerClientCallbacks;
  private room: Room | null = null;
  private sequence = 0;

  constructor(serverUrl: string, callbacks: MultiplayerClientCallbacks) {
    this.client = new Client(serverUrl);
    this.callbacks = callbacks;
  }

  async connect(displayName: string): Promise<void> {
    this.callbacks.onConnectionStateChange("connecting");

    try {
      this.room = await this.client.joinOrCreate(ROOM_NAME, { displayName });
    } catch (error) {
      this.callbacks.onConnectionStateChange("disconnected");
      throw this.toReadableError(error);
    }

    this.callbacks.onConnectionStateChange("connected");
    sessionStorage.setItem(RECONNECTION_TOKEN_STORAGE_KEY, this.room.reconnectionToken);
    this.attachRoomHandlers(this.room);
  }

  sendMovement(input: Omit<PlayerInputMessage, "sequence">): void {
    if (!this.room) return;
    this.sequence += 1;
    const message: PlayerInputMessage = { sequence: this.sequence, ...input };
    this.room.send("move", message);
  }

  sendChat(text: string): void {
    this.room?.send("chat", { text });
  }

  disconnect(): void {
    void this.room?.leave(true);
    this.room = null;
  }

  getSessionId(): string | null {
    return this.room?.sessionId ?? null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private attachRoomHandlers(room: Room<any>): void {
    const $ = getStateCallbacks(room);

    $(room.state).players.onAdd((player: any, sessionId: string) => {
      if (sessionId === room.sessionId) {
        this.callbacks.onLocalSpawn({ x: player.x, y: player.y, z: player.z });
        return;
      }

      this.callbacks.onPlayerAdd(this.toSnapshot(sessionId, player));
      $(player).onChange(() => {
        this.callbacks.onPlayerUpdate(this.toSnapshot(sessionId, player));
      });
    });

    $(room.state).players.onRemove((_player: unknown, sessionId: string) => {
      if (sessionId === room.sessionId) return;
      this.callbacks.onPlayerRemove(sessionId);
    });

    room.onMessage<ChatMessage>("chat", (message) => {
      try {
        if (typeof message?.text !== "string" || typeof message?.displayName !== "string") {
          throw new Error("malformed chat message");
        }
        this.callbacks.onChatMessage(message);
      } catch (error) {
        console.warn("[MultiplayerClient] ignored invalid chat message:", error);
      }
    });

    room.onLeave((code: number) => {
      const abnormalClose = code !== 1000;
      if (!abnormalClose) {
        this.callbacks.onConnectionStateChange("disconnected");
        return;
      }
      void this.attemptReconnect();
    });
  }

  private async attemptReconnect(): Promise<void> {
    this.callbacks.onConnectionStateChange("reconnecting");
    const token = sessionStorage.getItem(RECONNECTION_TOKEN_STORAGE_KEY);
    if (!token) {
      this.callbacks.onConnectionStateChange("disconnected");
      return;
    }

    try {
      this.room = await this.client.reconnect(token);
      this.callbacks.onConnectionStateChange("connected");
      this.attachRoomHandlers(this.room);
    } catch {
      this.callbacks.onConnectionStateChange("disconnected");
    }
  }

  private toSnapshot(sessionId: string, player: Record<string, unknown>): RemotePlayerSnapshot {
    return {
      sessionId,
      displayName: player.displayName as string,
      x: player.x as number,
      y: player.y as number,
      z: player.z as number,
      rotationY: player.rotationY as number,
      animation: player.animation as RemotePlayerSnapshot["animation"],
    };
  }

  private toReadableError(error: unknown): Error {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes("full")) {
      return new Error("This room is full. Please try again later.");
    }
    return new Error("Unable to connect to the multiplayer server.");
  }
}
