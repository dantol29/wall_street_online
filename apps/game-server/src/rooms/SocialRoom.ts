import { Client, Room } from "colyseus";
import { MAX_PLAYERS, RECONNECTION_TIMEOUT_SECONDS, type ChatMessage, type PlayerInputMessage } from "@multiplayer/shared";
import { SocialRoomState } from "./schema/SocialRoomState";
import { PlayerState } from "./schema/PlayerState";
import { assignSpawnPoint } from "./spawnAssignment";
import { validateMovementInput, type PreviousPlayerPosition } from "../validation/movementValidation";
import { ChatRateLimiter, validateChatText } from "../validation/chatValidation";

interface JoinOptions {
  displayName?: string;
}

export class SocialRoom extends Room<SocialRoomState> {
  override maxClients = MAX_PLAYERS;

  private readonly spawnIndexBySessionId = new Map<string, number>();
  private readonly previousPositionBySessionId = new Map<string, PreviousPlayerPosition>();
  private readonly chatRateLimiter = new ChatRateLimiter();

  override onCreate(): void {
    this.setState(new SocialRoomState());

    this.onMessage("move", (client, message: PlayerInputMessage) => {
      this.handleMove(client, message);
    });

    this.onMessage("chat", (client, message: { text: unknown }) => {
      this.handleChat(client, message);
    });
  }

  override onJoin(client: Client, options: JoinOptions): void {
    const occupiedIndices = new Set(this.spawnIndexBySessionId.values());
    const { index, point } = assignSpawnPoint(occupiedIndices);
    this.spawnIndexBySessionId.set(client.sessionId, index);

    const player = new PlayerState();
    player.id = client.sessionId;
    player.displayName = this.sanitizeDisplayName(options.displayName) ?? `Trader-${Math.floor(1000 + Math.random() * 9000)}`;
    player.x = point.x;
    player.y = point.y;
    player.z = point.z;
    player.rotationY = 0;
    player.animation = "idle";

    this.state.players.set(client.sessionId, player);
    this.previousPositionBySessionId.set(client.sessionId, {
      x: point.x,
      y: point.y,
      z: point.z,
      updatedAtMs: Date.now(),
    });
  }

  override async onLeave(client: Client, consented: boolean): Promise<void> {
    try {
      if (consented) {
        throw new Error("consented leave");
      }
      await this.allowReconnection(client, RECONNECTION_TIMEOUT_SECONDS);
      return;
    } catch {
      this.state.players.delete(client.sessionId);
      this.spawnIndexBySessionId.delete(client.sessionId);
      this.previousPositionBySessionId.delete(client.sessionId);
      this.chatRateLimiter.clear(client.sessionId);
    }
  }

  private handleMove(client: Client, message: PlayerInputMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || !message) return;

    const previous = this.previousPositionBySessionId.get(client.sessionId) ?? null;
    const now = Date.now();

    const result = validateMovementInput(
      { x: message.x, y: message.y, z: message.z, rotationY: message.rotationY, animation: message.animation },
      previous,
      now
    );

    if (!result.valid) return;

    player.x = message.x;
    player.y = message.y;
    player.z = message.z;
    player.rotationY = message.rotationY;
    player.animation = message.animation;

    this.previousPositionBySessionId.set(client.sessionId, { x: message.x, y: message.y, z: message.z, updatedAtMs: now });
  }

  private handleChat(client: Client, message: { text: unknown }): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || typeof message?.text !== "string") return;

    if (!this.chatRateLimiter.isAllowed(client.sessionId, Date.now())) return;

    const result = validateChatText(message.text);
    if (!result.valid) return;

    const chatMessage: ChatMessage = {
      senderId: client.sessionId,
      displayName: player.displayName,
      text: result.text,
      timestamp: Date.now(),
    };

    this.broadcast("chat", chatMessage);
  }

  private sanitizeDisplayName(rawName: string | undefined): string | null {
    if (typeof rawName !== "string") return null;
    const trimmed = rawName.trim().slice(0, 32);
    return trimmed.length > 0 ? trimmed : null;
  }
}
