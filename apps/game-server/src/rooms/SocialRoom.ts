import { Client, Room } from "colyseus";
import {
  HYPERLIQUID_PNL_POLL_INTERVAL_MS,
  MAX_PLAYERS,
  RECONNECTION_TIMEOUT_SECONDS,
  STICKY_NOTE_UPDATE_COOLDOWN_MS,
  isStickyWallSpotFree,
  THESIS_PUBLISH_COOLDOWN_MS,
  VISITOR_BOOK_SIGN_PER_OFFICE_COOLDOWN_MS,
  VISITOR_BOOK_SIGN_RATE_LIMIT_MAX,
  VISITOR_BOOK_SIGN_RATE_LIMIT_WINDOW_MS,
  VOICE_TOKEN_REQUEST_COOLDOWN_MS,
  WATCHLIST_UPDATE_COOLDOWN_MS,
  WHITEBOARD_MAX_SHAPES,
  WORLD_DAY_DURATION_MS,
  WORLD_START_HOUR,
  WORLD_TIME_SYNC_INTERVAL_MS,
  type ChatMessage,
  type OfficeProfileLookup,
  type OfficeProfileRequestMessage,
  type OfficeProfileResultMessage,
  type PlayerInputMessage,
  type PlayerPnlEntry,
  type PnlUpdateMessage,
  type SeatRequestMessage,
  type SeatResultMessage,
  type SetDisplayNameRequestMessage,
  type SetDisplayNameResultMessage,
  type StickyNote,
  type StickyNoteDeleteMessage,
  type StickyNoteDeleteRequestMessage,
  type StickyNoteDeleteResultMessage,
  type StickyNoteSnapshot,
  type StickyNoteUpsertRequestMessage,
  type StickyNoteUpsertResultMessage,
  type ThesisPublishRequestMessage,
  type ThesisPublishResultMessage,
  type VisitorBookSignRequestMessage,
  type VisitorBookSignResultMessage,
  type VoiceTokenRequestMessage,
  type VoiceTokenResultMessage,
  type WalletLinkRequestMessage,
  type WalletLinkResultMessage,
  type WatchlistUpdateRequestMessage,
  type WatchlistUpdateResultMessage,
  type WhiteboardShape,
  type WhiteboardShapeDeleteMessage,
  type WhiteboardSnapshot,
  type WorldTimeSyncMessage,
  worldPhaseAtTime,
} from "@multiplayer/shared";
import { SocialRoomState } from "./schema/SocialRoomState";
import { PlayerState } from "./schema/PlayerState";
import { assignSpawnPoint } from "./spawnAssignment";
import { assignOfficeSlot } from "./officeSlotAssignment";
import { validateMovementInput, type PreviousPlayerPosition } from "../validation/movementValidation";
import { ChatRateLimiter, validateChatText } from "../validation/chatValidation";
import { findDeskStation, isWithinDeskInteractionRange } from "../validation/seatValidation";
import { SlidingWindowRateLimiter } from "../validation/rateLimiter";
import { validateThesisBody, validateVisitorBookMessage, validateWatchlistItems } from "../validation/officeValidation";
import { validateStickyNoteText, validateStickyNotePosition } from "../validation/stickyNoteValidation";
import { config } from "../config";
import { createVoiceToken } from "../voice/voiceToken";
import { verifyPrivyWallet } from "../wallet/privyAuth";
import { validateWhiteboardShape } from "../validation/whiteboardValidation";
import { getDb } from "../db/client";
import { fetchHyperliquidAllTimePnl } from "../hyperliquid/hyperliquidPnl";
import {
  addVisitorBookEntry,
  getOfficeProfileBundle,
  getProfileDisplayName,
  publishThesis,
  replaceWatchlist,
  resolveProfileIdByAddress,
  upsertProfileAndWallet,
} from "../db/officeRepository";
import { validateDisplayName } from "../validation/displayNameValidation";

const MAX_CHAT_HISTORY_MESSAGES = 20;
/** Shared by every room/shard in this server process, so all traders see the same time. */
const WORLD_TIME_EPOCH_MS = Date.now() - (WORLD_START_HOUR / 24) * WORLD_DAY_DURATION_MS;

interface JoinOptions {
  displayName?: string;
}

export class SocialRoom extends Room<SocialRoomState> {
  override maxClients = MAX_PLAYERS;

  private readonly spawnIndexBySessionId = new Map<string, number>();
  private readonly previousPositionBySessionId = new Map<string, PreviousPlayerPosition>();
  private readonly chatRateLimiter = new ChatRateLimiter();
  private readonly chatHistory: ChatMessage[] = [];
  private readonly whiteboardShapes = new Map<string, WhiteboardShape>();
  private whiteboardPresenterSessionId: string | null = null;
  private readonly lastVoiceTokenRequestBySessionId = new Map<string, number>();
  private readonly db = getDb();
  /** Session-scoped, transient — never persisted (see officeSlotAssignment.ts). Persisted office *content* is keyed by PlayerState.playerId instead. */
  private readonly officeSlotIndexBySessionId = new Map<string, number>();
  private readonly thesisPublishRateLimiter = new SlidingWindowRateLimiter(1, THESIS_PUBLISH_COOLDOWN_MS);
  private readonly watchlistUpdateRateLimiter = new SlidingWindowRateLimiter(1, WATCHLIST_UPDATE_COOLDOWN_MS);
  private readonly visitorBookGlobalRateLimiter = new SlidingWindowRateLimiter(
    VISITOR_BOOK_SIGN_RATE_LIMIT_MAX,
    VISITOR_BOOK_SIGN_RATE_LIMIT_WINDOW_MS,
  );
  private readonly visitorBookPerOfficeRateLimiter = new SlidingWindowRateLimiter(
    1,
    VISITOR_BOOK_SIGN_PER_OFFICE_COOLDOWN_MS,
  );
  /** Ephemeral, like whiteboardShapes — one note per session, keyed by sessionId so there's structurally no way to add a second or edit someone else's. Reset when the shard empties/restarts, not persisted. */
  private readonly stickyNotesBySessionId = new Map<string, StickyNote>();
  private readonly stickyNoteUpdateRateLimiter = new SlidingWindowRateLimiter(1, STICKY_NOTE_UPDATE_COOLDOWN_MS);
  /** Purely a defensive debounce against accidental double-submits — this isn't meant to be a frequent action. */
  private readonly setDisplayNameRateLimiter = new SlidingWindowRateLimiter(1, 5000);

  override onCreate(): void {
    this.setState(new SocialRoomState());
    this.clock.setInterval(() => this.broadcast("world_time_sync", this.worldTimeSync()), WORLD_TIME_SYNC_INTERVAL_MS);
    this.clock.setInterval(() => void this.pollAndBroadcastPnl(), HYPERLIQUID_PNL_POLL_INTERVAL_MS);

    this.onMessage("world_time_request", (client) => {
      client.send("world_time_sync", this.worldTimeSync());
    });

    // Lightweight round trip measurement used by the opt-in Colyseus bot test.
    // It is harmless in production and intentionally does not mutate room state.
    this.onMessage("loadtest_ping", (client, message: { sentAt?: unknown }) => {
      if (!Number.isFinite(message?.sentAt)) return;
      client.send("loadtest_pong", { sentAt: message.sentAt });
    });

    this.onMessage("move", (client, message: PlayerInputMessage) => {
      this.handleMove(client, message);
    });

    this.onMessage("chat", (client, message: { text: unknown }) => {
      this.handleChat(client, message);
    });

    this.onMessage("chat_history_request", (client) => {
      client.send("chat_history", this.chatHistory);
    });

    this.onMessage("whiteboard_snapshot_request", (client) => {
      client.send("whiteboard_snapshot", this.whiteboardSnapshot());
    });

    this.onMessage("whiteboard_present_request", (client) => {
      if (!this.whiteboardPresenterSessionId) {
        this.whiteboardPresenterSessionId = client.sessionId;
        this.broadcast("whiteboard_snapshot", this.whiteboardSnapshot());
      } else {
        client.send("whiteboard_snapshot", this.whiteboardSnapshot());
      }
    });

    this.onMessage("whiteboard_release", (client) => {
      if (this.whiteboardPresenterSessionId !== client.sessionId) return;
      this.whiteboardPresenterSessionId = null;
      this.broadcast("whiteboard_snapshot", this.whiteboardSnapshot());
    });

    this.onMessage("whiteboard_shape_upsert", (client, shape: unknown) => {
      this.handleWhiteboardShapeUpsert(client, shape);
    });

    this.onMessage("whiteboard_shape_delete", (client, message: WhiteboardShapeDeleteMessage) => {
      this.handleWhiteboardShapeDelete(client, message);
    });

    this.onMessage("whiteboard_clear", (client) => {
      if (this.whiteboardPresenterSessionId !== client.sessionId) return;
      this.whiteboardShapes.clear();
      this.broadcast("whiteboard_snapshot", this.whiteboardSnapshot());
    });

    this.onMessage("seat", (client, message: SeatRequestMessage) => {
      this.handleSeat(client, message);
    });

    this.onMessage("voice_token_request", (client, message: VoiceTokenRequestMessage) => {
      void this.handleVoiceTokenRequest(client, message);
    });

    this.onMessage("wallet_link_request", (client, message: WalletLinkRequestMessage) => {
      void this.handleWalletLinkRequest(client, message);
    });

    this.onMessage("set_display_name_request", (client, message: SetDisplayNameRequestMessage) => {
      this.handleSetDisplayNameRequest(client, message);
    });

    this.onMessage("office_profile_request", (client, message: OfficeProfileRequestMessage) => {
      this.handleOfficeProfileRequest(client, message);
    });

    this.onMessage("thesis_publish_request", (client, message: ThesisPublishRequestMessage) => {
      this.handleThesisPublishRequest(client, message);
    });

    this.onMessage("watchlist_update_request", (client, message: WatchlistUpdateRequestMessage) => {
      this.handleWatchlistUpdateRequest(client, message);
    });

    this.onMessage("visitor_book_sign_request", (client, message: VisitorBookSignRequestMessage) => {
      this.handleVisitorBookSignRequest(client, message);
    });

    this.onMessage("sticky_note_snapshot_request", (client) => {
      client.send("sticky_note_snapshot", this.stickyNoteSnapshot());
    });

    this.onMessage("sticky_note_upsert_request", (client, message: StickyNoteUpsertRequestMessage) => {
      this.handleStickyNoteUpsertRequest(client, message);
    });

    this.onMessage("sticky_note_delete_request", (client, message: StickyNoteDeleteRequestMessage) => {
      this.handleStickyNoteDeleteRequest(client, message);
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
    client.send("world_time_sync", this.worldTimeSync());
  }

  private worldTimeSync(): WorldTimeSyncMessage {
    const serverTimeMs = Date.now();
    return {
      phase: worldPhaseAtTime(WORLD_TIME_EPOCH_MS, serverTimeMs),
      dayDurationMs: WORLD_DAY_DURATION_MS,
      serverTimeMs,
    };
  }

  /**
   * Real HyperLiquid all-time PnL (Perps + Spot + Vaults, realized +
   * unrealized) for every currently wallet-linked player, via HyperLiquid's
   * public info endpoint (no auth, no API key, same data anyone could look
   * up for that address directly). A player with no trading history at all
   * (or a failed lookup) is simply omitted from that cycle's broadcast
   * rather than sent as a false 0.
   */
  private async pollAndBroadcastPnl(): Promise<void> {
    const linkedPlayers: Array<{ sessionId: string; address: string }> = [];
    for (const [sessionId, player] of this.state.players.entries()) {
      if (player.walletAddress) linkedPlayers.push({ sessionId, address: player.walletAddress });
    }
    if (linkedPlayers.length === 0) return;

    const results = await Promise.all(
      linkedPlayers.map(async ({ sessionId, address }) => {
        const pnlUsd = await fetchHyperliquidAllTimePnl(address);
        return pnlUsd === null ? null : { sessionId, pnlUsd };
      }),
    );

    const entries = results.filter((entry): entry is PlayerPnlEntry => entry !== null);
    if (entries.length === 0) return;

    this.broadcast("pnl_update", { entries } satisfies PnlUpdateMessage);
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
      this.officeSlotIndexBySessionId.delete(client.sessionId);
      this.thesisPublishRateLimiter.clear(client.sessionId);
      this.watchlistUpdateRateLimiter.clear(client.sessionId);
      this.visitorBookGlobalRateLimiter.clear(client.sessionId);
      this.stickyNoteUpdateRateLimiter.clear(client.sessionId);
      if (this.stickyNotesBySessionId.delete(client.sessionId)) {
        this.broadcast("sticky_note_delete", { authorSessionId: client.sessionId } satisfies StickyNoteDeleteMessage);
      }
      if (this.whiteboardPresenterSessionId === client.sessionId) {
        this.whiteboardPresenterSessionId = null;
        this.broadcast("whiteboard_snapshot", this.whiteboardSnapshot());
      }
    }
  }

  private handleMove(client: Client, message: PlayerInputMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || !message) return;
    if (player.seatedDeskId) {
      // A seated player cannot move away from the server-owned chair
      // position, but their look direction is still replicated so nearby
      // players see them turn while they sit and talk.
      if (Number.isFinite(message.rotationY)) {
        player.rotationY = message.rotationY;
        player.animation = "idle";
      }
      return;
    }

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

    this.chatHistory.push(chatMessage);
    if (this.chatHistory.length > MAX_CHAT_HISTORY_MESSAGES) {
      this.chatHistory.splice(0, this.chatHistory.length - MAX_CHAT_HISTORY_MESSAGES);
    }
    this.broadcast("chat", chatMessage);
  }

  private whiteboardSnapshot(): WhiteboardSnapshot {
    const presenter = this.whiteboardPresenterSessionId
      ? this.state.players.get(this.whiteboardPresenterSessionId)
      : undefined;
    return {
      shapes: [...this.whiteboardShapes.values()],
      presenterSessionId: this.whiteboardPresenterSessionId,
      presenterDisplayName: presenter?.displayName ?? null,
    };
  }

  private handleWhiteboardShapeUpsert(client: Client, value: unknown): void {
    if (this.whiteboardPresenterSessionId !== client.sessionId) return;
    if (!validateWhiteboardShape(value) || value.authorId !== client.sessionId) return;
    if (!this.whiteboardShapes.has(value.id) && this.whiteboardShapes.size >= WHITEBOARD_MAX_SHAPES) return;

    const shape = structuredClone(value);
    this.whiteboardShapes.set(shape.id, shape);
    this.broadcast("whiteboard_shape_upsert", shape);
  }

  private handleWhiteboardShapeDelete(client: Client, message: WhiteboardShapeDeleteMessage): void {
    if (this.whiteboardPresenterSessionId !== client.sessionId) return;
    if (!message || typeof message.id !== "string" || !this.whiteboardShapes.delete(message.id)) return;
    this.broadcast("whiteboard_shape_delete", { id: message.id } satisfies WhiteboardShapeDeleteMessage);
  }

  private stickyNoteSnapshot(): StickyNoteSnapshot {
    return { notes: [...this.stickyNotesBySessionId.values()] };
  }

  /**
   * Always an upsert keyed by the caller's own sessionId — there is no
   * "target" field, so this message can never create a second note for one
   * player or edit anyone else's. Broadcast to everyone (like whiteboard
   * shapes) since the board is meant to be read live, not fetched on demand
   * like the office thesis wall.
   */
  private handleStickyNoteUpsertRequest(client: Client, message: StickyNoteUpsertRequestMessage): void {
    if (!message || !Number.isSafeInteger(message.requestId)) return;
    const baseResult: Pick<StickyNoteUpsertResultMessage, "requestId"> = { requestId: message.requestId };

    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    // Validated before the rate limit is consumed: clicking an occupied spot
    // while choosing where to place a note is an expected, frequent part of
    // that flow, not a "retry" that should cost the same cooldown as an
    // actual post.
    const textValidation = validateStickyNoteText(typeof message.text === "string" ? message.text : "");
    if (!textValidation.valid) {
      client.send("sticky_note_upsert_result", {
        ...baseResult,
        success: false,
        message: textValidation.reason,
      } satisfies StickyNoteUpsertResultMessage);
      return;
    }

    const positionValidation = validateStickyNotePosition(message.xFraction, message.yFraction);
    if (!positionValidation.valid) {
      client.send("sticky_note_upsert_result", {
        ...baseResult,
        success: false,
        message: positionValidation.reason,
      } satisfies StickyNoteUpsertResultMessage);
      return;
    }

    if (
      !isStickyWallSpotFree(
        [...this.stickyNotesBySessionId.values()],
        positionValidation.xFraction,
        positionValidation.yFraction,
        client.sessionId,
      )
    ) {
      client.send("sticky_note_upsert_result", {
        ...baseResult,
        success: false,
        message: "That spot's taken — try another.",
      } satisfies StickyNoteUpsertResultMessage);
      return;
    }

    if (!this.stickyNoteUpdateRateLimiter.isAllowed(client.sessionId, Date.now())) {
      client.send("sticky_note_upsert_result", {
        ...baseResult,
        success: false,
        message: "Please wait before updating your note again.",
      } satisfies StickyNoteUpsertResultMessage);
      return;
    }

    const note: StickyNote = {
      authorSessionId: client.sessionId,
      authorDisplayName: player.displayName,
      text: textValidation.text,
      xFraction: positionValidation.xFraction,
      yFraction: positionValidation.yFraction,
      updatedAt: Date.now(),
    };
    this.stickyNotesBySessionId.set(client.sessionId, note);

    client.send("sticky_note_upsert_result", { ...baseResult, success: true, note } satisfies StickyNoteUpsertResultMessage);
    this.broadcast("sticky_note_upsert", note);
  }

  /** Always deletes the caller's own note — same no-target-field reasoning as the upsert. Deleting a note you don't have is a harmless no-op. */
  private handleStickyNoteDeleteRequest(client: Client, message: StickyNoteDeleteRequestMessage): void {
    if (!message || !Number.isSafeInteger(message.requestId)) return;
    const baseResult: Pick<StickyNoteDeleteResultMessage, "requestId"> = { requestId: message.requestId };

    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const existed = this.stickyNotesBySessionId.delete(client.sessionId);
    this.stickyNoteUpdateRateLimiter.clear(client.sessionId);

    client.send("sticky_note_delete_result", { ...baseResult, success: true } satisfies StickyNoteDeleteResultMessage);
    if (existed) {
      this.broadcast("sticky_note_delete", { authorSessionId: client.sessionId } satisfies StickyNoteDeleteMessage);
    }
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

  /**
   * Wallet linking is optional and additive (see wallet.ts) — guests never
   * touch this. The client already ran the full connect/sign-in flow through
   * Privy before calling this; the server's only job is to verify the
   * resulting access token directly against Privy and read back that user's
   * linked wallet, rather than trusting a client-supplied address.
   */
  private async handleWalletLinkRequest(client: Client, message: WalletLinkRequestMessage): Promise<void> {
    if (!message || !Number.isSafeInteger(message.requestId)) return;
    const baseResult: Pick<WalletLinkResultMessage, "requestId"> = { requestId: message.requestId };

    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    if (typeof message.authToken !== "string" || message.authToken.length === 0 || message.authToken.length > 4096) {
      client.send("wallet_link_result", {
        ...baseResult,
        success: false,
        message: "Invalid wallet link request.",
      } satisfies WalletLinkResultMessage);
      return;
    }

    const wallet = await verifyPrivyWallet(message.authToken);
    if (!wallet) {
      client.send("wallet_link_result", {
        ...baseResult,
        success: false,
        message: "Could not verify wallet with Privy.",
      } satisfies WalletLinkResultMessage);
      return;
    }

    player.walletAddress = wallet.address;
    player.walletChain = wallet.chain;
    player.playerId = wallet.userId;

    // Restore whatever name this identity already chose in a past session —
    // otherwise every reconnect would re-derive the in-memory guest-pattern
    // placeholder as "current", clobbering a real chosen name back to
    // nothing every time. No existing profile at all means this is their
    // very first wallet link ever, so there's nothing to restore: they're
    // required to choose a real name via set_display_name_request, and the
    // guest placeholder stays until they do.
    const existingDisplayName = getProfileDisplayName(this.db, wallet.userId);
    const needsDisplayName = existingDisplayName === null;
    if (existingDisplayName !== null) {
      player.displayName = existingDisplayName;
    }

    upsertProfileAndWallet(this.db, {
      playerId: wallet.userId,
      displayName: player.displayName,
      address: wallet.address,
      chain: wallet.chain,
    });
    this.assignOfficeSlotIfNeeded(client, player);

    client.send("wallet_link_result", {
      ...baseResult,
      success: true,
      address: wallet.address,
      chain: wallet.chain,
      ...(player.officeSlotId ? { officeSlotId: player.officeSlotId } : {}),
      needsDisplayName,
    } satisfies WalletLinkResultMessage);

    // A one-off lookup for just this player, so their PnL shows up promptly
    // rather than waiting for the next full poll cycle (see pollAndBroadcastPnl).
    const sessionId = client.sessionId;
    void fetchHyperliquidAllTimePnl(wallet.address).then((pnlUsd) => {
      if (pnlUsd === null) return;
      this.broadcast("pnl_update", { entries: [{ sessionId, pnlUsd }] } satisfies PnlUpdateMessage);
    });
  }

  /**
   * Only meaningful for a wallet-linked identity — `player.playerId` (the
   * Privy DID) is empty for guests, and there's no profile row to persist
   * a name against. Setting `state.players`' own `displayName` here is
   * enough for every other client to see it live: it's a schema field,
   * replicated automatically, no broadcast needed.
   */
  private handleSetDisplayNameRequest(client: Client, message: SetDisplayNameRequestMessage): void {
    if (!message || !Number.isSafeInteger(message.requestId)) return;
    const baseResult: Pick<SetDisplayNameResultMessage, "requestId"> = { requestId: message.requestId };

    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    if (!player.playerId) {
      client.send("set_display_name_result", {
        ...baseResult,
        success: false,
        message: "Link a wallet first.",
      } satisfies SetDisplayNameResultMessage);
      return;
    }

    if (!this.setDisplayNameRateLimiter.isAllowed(client.sessionId, Date.now())) {
      client.send("set_display_name_result", {
        ...baseResult,
        success: false,
        message: "Please wait before changing your name again.",
      } satisfies SetDisplayNameResultMessage);
      return;
    }

    const validation = validateDisplayName(typeof message.displayName === "string" ? message.displayName : "");
    if (!validation.valid) {
      client.send("set_display_name_result", {
        ...baseResult,
        success: false,
        message: validation.reason,
      } satisfies SetDisplayNameResultMessage);
      return;
    }

    player.displayName = validation.text;
    upsertProfileAndWallet(this.db, {
      playerId: player.playerId,
      displayName: validation.text,
      address: player.walletAddress,
      chain: player.walletChain,
    });

    client.send("set_display_name_result", {
      ...baseResult,
      success: true,
      displayName: validation.text,
    } satisfies SetDisplayNameResultMessage);
  }

  /** Binds a newly wallet-linked player to a free physical office slot for this shard session, if one is available (see officeSlotAssignment.ts — unlike spawn/desk assignment, there's no overlap fallback). Idempotent: a player who already has a slot keeps it. */
  private assignOfficeSlotIfNeeded(client: Client, player: PlayerState): void {
    if (this.officeSlotIndexBySessionId.has(client.sessionId)) return;

    const occupied = new Set(this.officeSlotIndexBySessionId.values());
    const assignment = assignOfficeSlot(occupied);
    if (!assignment) return;

    this.officeSlotIndexBySessionId.set(client.sessionId, assignment.index);
    player.officeSlotId = assignment.slot.id;
  }

  private resolvePlayerIdFromLookup(lookup: OfficeProfileLookup): string | null {
    if (!lookup || typeof lookup !== "object") return null;

    if (lookup.type === "session") {
      if (typeof lookup.sessionId !== "string") return null;
      const target = this.state.players.get(lookup.sessionId);
      return target?.playerId || null;
    }

    if (lookup.type === "wallet") {
      if (typeof lookup.address !== "string" || typeof lookup.chain !== "string") return null;
      return resolveProfileIdByAddress(this.db, lookup.address, lookup.chain);
    }

    return null;
  }

  private handleOfficeProfileRequest(client: Client, message: OfficeProfileRequestMessage): void {
    if (!message || !Number.isSafeInteger(message.requestId)) return;
    const baseResult: Pick<OfficeProfileResultMessage, "requestId"> = { requestId: message.requestId };

    const targetPlayerId = this.resolvePlayerIdFromLookup(message.lookup);
    if (!targetPlayerId) {
      client.send("office_profile_result", {
        ...baseResult,
        success: false,
        message: "Player not found.",
      } satisfies OfficeProfileResultMessage);
      return;
    }

    const bundle = getOfficeProfileBundle(this.db, targetPlayerId);
    if (!bundle) {
      client.send("office_profile_result", {
        ...baseResult,
        success: false,
        message: "This player doesn't have an office yet.",
      } satisfies OfficeProfileResultMessage);
      return;
    }

    client.send("office_profile_result", {
      ...baseResult,
      success: true,
      profile: {
        displayName: bundle.displayName,
        primaryWalletAddress: bundle.primaryWalletAddress,
        currentThesis: bundle.currentThesis,
        watchlist: bundle.watchlist,
        visitorBook: bundle.visitorBook,
      },
    } satisfies OfficeProfileResultMessage);
  }

  private handleThesisPublishRequest(client: Client, message: ThesisPublishRequestMessage): void {
    if (!message || !Number.isSafeInteger(message.requestId)) return;
    const baseResult: Pick<ThesisPublishResultMessage, "requestId"> = { requestId: message.requestId };

    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    if (!player.playerId) {
      client.send("thesis_publish_result", {
        ...baseResult,
        success: false,
        message: "Link a wallet to get your own office.",
      } satisfies ThesisPublishResultMessage);
      return;
    }

    if (!this.thesisPublishRateLimiter.isAllowed(client.sessionId, Date.now())) {
      client.send("thesis_publish_result", {
        ...baseResult,
        success: false,
        message: "Please wait before publishing again.",
      } satisfies ThesisPublishResultMessage);
      return;
    }

    const validation = validateThesisBody(typeof message.body === "string" ? message.body : "");
    if (!validation.valid) {
      client.send("thesis_publish_result", {
        ...baseResult,
        success: false,
        message: validation.reason,
      } satisfies ThesisPublishResultMessage);
      return;
    }

    const thesis = publishThesis(this.db, player.playerId, validation.text);
    client.send("thesis_publish_result", { ...baseResult, success: true, thesis } satisfies ThesisPublishResultMessage);
  }

  private handleWatchlistUpdateRequest(client: Client, message: WatchlistUpdateRequestMessage): void {
    if (!message || !Number.isSafeInteger(message.requestId)) return;
    const baseResult: Pick<WatchlistUpdateResultMessage, "requestId"> = { requestId: message.requestId };

    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    if (!player.playerId) {
      client.send("watchlist_update_result", {
        ...baseResult,
        success: false,
        message: "Link a wallet to get your own office.",
      } satisfies WatchlistUpdateResultMessage);
      return;
    }

    if (!this.watchlistUpdateRateLimiter.isAllowed(client.sessionId, Date.now())) {
      client.send("watchlist_update_result", {
        ...baseResult,
        success: false,
        message: "Please wait before updating again.",
      } satisfies WatchlistUpdateResultMessage);
      return;
    }

    const validation = validateWatchlistItems(message.items);
    if (!validation.valid) {
      client.send("watchlist_update_result", {
        ...baseResult,
        success: false,
        message: validation.reason,
      } satisfies WatchlistUpdateResultMessage);
      return;
    }

    const items = replaceWatchlist(this.db, player.playerId, validation.items);
    client.send("watchlist_update_result", { ...baseResult, success: true, items } satisfies WatchlistUpdateResultMessage);
  }

  private handleVisitorBookSignRequest(client: Client, message: VisitorBookSignRequestMessage): void {
    if (!message || !Number.isSafeInteger(message.requestId)) return;
    const baseResult: Pick<VisitorBookSignResultMessage, "requestId"> = { requestId: message.requestId };

    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const ownerPlayerId = this.resolvePlayerIdFromLookup(message.lookup);
    if (!ownerPlayerId) {
      client.send("visitor_book_sign_result", {
        ...baseResult,
        success: false,
        message: "Player not found.",
      } satisfies VisitorBookSignResultMessage);
      return;
    }

    if (player.playerId && ownerPlayerId === player.playerId) {
      client.send("visitor_book_sign_result", {
        ...baseResult,
        success: false,
        message: "You can't sign your own visitor book.",
      } satisfies VisitorBookSignResultMessage);
      return;
    }

    const now = Date.now();
    if (!this.visitorBookGlobalRateLimiter.isAllowed(client.sessionId, now)) {
      client.send("visitor_book_sign_result", {
        ...baseResult,
        success: false,
        message: "Please wait before signing again.",
      } satisfies VisitorBookSignResultMessage);
      return;
    }

    if (!this.visitorBookPerOfficeRateLimiter.isAllowed(`${client.sessionId}:${ownerPlayerId}`, now)) {
      client.send("visitor_book_sign_result", {
        ...baseResult,
        success: false,
        message: "You've already signed this office recently.",
      } satisfies VisitorBookSignResultMessage);
      return;
    }

    const validation = validateVisitorBookMessage(typeof message.message === "string" ? message.message : "");
    if (!validation.valid) {
      client.send("visitor_book_sign_result", {
        ...baseResult,
        success: false,
        message: validation.reason,
      } satisfies VisitorBookSignResultMessage);
      return;
    }

    const entry = addVisitorBookEntry(this.db, {
      ownerPlayerId,
      visitorPlayerId: player.playerId || null,
      visitorDisplayName: player.displayName,
      message: validation.text,
    });

    client.send("visitor_book_sign_result", { ...baseResult, success: true, entry } satisfies VisitorBookSignResultMessage);
  }

  private sanitizeDisplayName(rawName: string | undefined): string | null {
    if (typeof rawName !== "string") return null;
    const trimmed = rawName.trim().slice(0, 32);
    return trimmed.length > 0 ? trimmed : null;
  }
}
