import { Client, Room } from "colyseus";
import {
  MAX_PLAYERS,
  RECONNECTION_TIMEOUT_SECONDS,
  VOICE_TOKEN_REQUEST_COOLDOWN_MS,
  type ChatMessage,
  type PlayerInputMessage,
  type SeatRequestMessage,
  type SeatResultMessage,
  type VoiceTokenRequestMessage,
  type VoiceTokenResultMessage,
} from "@multiplayer/shared";
import { SocialRoomState } from "./schema/SocialRoomState";
import { PlayerState } from "./schema/PlayerState";
import { assignSpawnPoint } from "./spawnAssignment";
import { validateMovementInput, type PreviousPlayerPosition } from "../validation/movementValidation";
import { ChatRateLimiter, validateChatText } from "../validation/chatValidation";
import { findDeskStation, isWithinDeskInteractionRange } from "../validation/seatValidation";
import { config } from "../config";
import { createVoiceToken } from "../voice/voiceToken";

interface JoinOptions {
  displayName?: string;
}

export class SocialRoom extends Room<SocialRoomState> {
  override maxClients = MAX_PLAYERS;

  private readonly spawnIndexBySessionId = new Map<string, number>();
  private readonly previousPositionBySessionId = new Map<string, PreviousPlayerPosition>();
  private readonly chatRateLimiter = new ChatRateLimiter();
  private readonly lastVoiceTokenRequestBySessionId = new Map<string, number>();

  override onCreate(): void {
    this.setState(new SocialRoomState());

    this.onMessage("move", (client, message: PlayerInputMessage) => {
      this.handleMove(client, message);
    });

    this.onMessage("chat", (client, message: { text: unknown }) => {
      this.handleChat(client, message);
    });

    this.onMessage("seat", (client, message: SeatRequestMessage) => {
      this.handleSeat(client, message);
    });

    this.onMessage("voice_token_request", (client, message: VoiceTokenRequestMessage) => {
      void this.handleVoiceTokenRequest(client, message);
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
      this.lastVoiceTokenRequestBySessionId.delete(client.sessionId);
    }
  }

  private handleMove(client: Client, message: PlayerInputMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || !message) return;
    if (player.seatedDeskId) return;

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

  private handleSeat(client: Client, message: SeatRequestMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || !message) return;

    if (message.deskId === null) {
      player.seatedDeskId = "";
      this.previousPositionBySessionId.set(client.sessionId, {
        x: player.x,
        y: player.y,
        z: player.z,
        updatedAtMs: Date.now(),
      });
      client.send("seat_result", this.seatResult(player, true));
      return;
    }

    const desk = findDeskStation(message.deskId);
    if (!desk || !isWithinDeskInteractionRange(player, desk)) {
      client.send("seat_result", this.seatResult(player, false, "Move closer to the chair."));
      return;
    }

    const occupied = [...this.state.players.values()].some(
      (other) => other.id !== player.id && other.seatedDeskId === desk.id,
    );
    if (occupied) {
      client.send("seat_result", this.seatResult(player, false, "That desk is occupied."));
      return;
    }

    player.x = desk.seatX;
    player.y = desk.seatY;
    player.z = desk.seatZ;
    player.rotationY = desk.rotationY;
    player.animation = "idle";
    player.seatedDeskId = desk.id;
    this.previousPositionBySessionId.set(client.sessionId, {
      x: player.x,
      y: player.y,
      z: player.z,
      updatedAtMs: Date.now(),
    });
    client.send("seat_result", this.seatResult(player, true));
  }

  private seatResult(player: PlayerState, success: boolean, message?: string): SeatResultMessage {
    return {
      success,
      deskId: player.seatedDeskId || null,
      x: player.x,
      y: player.y,
      z: player.z,
      rotationY: player.rotationY,
      ...(message ? { message } : {}),
    };
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

  private async handleVoiceTokenRequest(client: Client, message: VoiceTokenRequestMessage): Promise<void> {
    if (!message || !Number.isSafeInteger(message.requestId) || message.requestId < 0) return;

    const now = Date.now();
    const previousRequest = this.lastVoiceTokenRequestBySessionId.get(client.sessionId) ?? 0;
    const baseResult: Pick<VoiceTokenResultMessage, "requestId" | "serverUrl"> = {
      requestId: message.requestId,
      serverUrl: config.voice.serverUrl,
    };
    if (now - previousRequest < VOICE_TOKEN_REQUEST_COOLDOWN_MS) {
      client.send("voice_token_result", {
        ...baseResult,
        enabled: false,
        message: "Please wait before retrying voice chat.",
      } satisfies VoiceTokenResultMessage);
      return;
    }
    this.lastVoiceTokenRequestBySessionId.set(client.sessionId, now);

    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    if (!config.voice.enabled) {
      client.send("voice_token_result", {
        ...baseResult,
        enabled: false,
        message: "Voice chat is not enabled on this server.",
      } satisfies VoiceTokenResultMessage);
      return;
    }

    try {
      const token = await createVoiceToken(
        { apiKey: config.voice.apiKey, apiSecret: config.voice.apiSecret },
        {
          sessionId: client.sessionId,
          displayName: player.displayName,
          roomId: this.roomId,
        },
      );
      client.send("voice_token_result", {
        ...baseResult,
        enabled: true,
        token,
      } satisfies VoiceTokenResultMessage);
    } catch (error) {
      console.error("[SocialRoom] failed to issue voice token:", error);
      client.send("voice_token_result", {
        ...baseResult,
        enabled: false,
        message: "Voice chat is temporarily unavailable.",
      } satisfies VoiceTokenResultMessage);
    }
  }

  private sanitizeDisplayName(rawName: string | undefined): string | null {
    if (typeof rawName !== "string") return null;
    const trimmed = rawName.trim().slice(0, 32);
    return trimmed.length > 0 ? trimmed : null;
  }
}
