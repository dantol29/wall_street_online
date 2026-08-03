import { Client, getStateCallbacks, Room } from "colyseus.js";
import {
  ROOM_NAME,
  type ChatMessage,
  type OfficeProfileLookup,
  type OfficeProfileResultMessage,
  type OfficeWatchlistItem,
  type PlayerInputMessage,
  type SeatResultMessage,
  type StickyNote,
  type StickyNoteDeleteMessage,
  type StickyNoteDeleteResultMessage,
  type StickyNoteSnapshot,
  type StickyNoteUpsertResultMessage,
  type ThesisPublishResultMessage,
  type VisitorBookSignResultMessage,
  type VoiceTokenResultMessage,
  type WalletLinkResultMessage,
  type WatchlistUpdateResultMessage,
  type WhiteboardShape,
  type WhiteboardShapeDeleteMessage,
  type WhiteboardSnapshot,
} from "@multiplayer/shared";
import type { ConnectionState, RemotePlayerSnapshot } from "./messages";

const RECONNECTION_TOKEN_STORAGE_KEY = "colyseusReconnectionToken";

export interface MultiplayerClientCallbacks {
  onConnectionStateChange: (state: ConnectionState) => void;
  onPlayerAdd: (snapshot: RemotePlayerSnapshot) => void;
  onPlayerUpdate: (snapshot: RemotePlayerSnapshot) => void;
  onPlayerRemove: (sessionId: string) => void;
  onChatHistory: (messages: ChatMessage[]) => void;
  onChatMessage: (message: ChatMessage) => void;
  onLocalSpawn: (spawn: { x: number; y: number; z: number }) => void;
  onSeatResult: (result: SeatResultMessage) => void;
  onVoiceTokenResult: (result: VoiceTokenResultMessage) => void;
  onWhiteboardSnapshot: (snapshot: WhiteboardSnapshot) => void;
  onWhiteboardShapeUpsert: (shape: WhiteboardShape) => void;
  onWhiteboardShapeDelete: (id: string) => void;
  onStickyNoteSnapshot: (snapshot: StickyNoteSnapshot) => void;
  onStickyNoteUpsert: (note: StickyNote) => void;
  onStickyNoteDelete: (authorSessionId: string) => void;
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
  /** Shared monotonic counter for every one-shot request/response message below (wallet + office) — each message type has its own pending-resolvers map, so a single counter is enough to keep requestIds unique per type. */
  private oneShotRequestSequence = 0;
  private readonly pendingWalletLink = new Map<number, (message: WalletLinkResultMessage) => void>();
  private readonly pendingOfficeProfile = new Map<number, (message: OfficeProfileResultMessage) => void>();
  private readonly pendingThesisPublish = new Map<number, (message: ThesisPublishResultMessage) => void>();
  private readonly pendingWatchlistUpdate = new Map<number, (message: WatchlistUpdateResultMessage) => void>();
  private readonly pendingVisitorBookSign = new Map<number, (message: VisitorBookSignResultMessage) => void>();
  private readonly pendingStickyNoteUpsert = new Map<number, (message: StickyNoteUpsertResultMessage) => void>();
  private readonly pendingStickyNoteDelete = new Map<number, (message: StickyNoteDeleteResultMessage) => void>();

  constructor(serverUrl: string, callbacks: MultiplayerClientCallbacks) {
    this.client = new Client(serverUrl);
    this.callbacks = callbacks;
  }

  async connect(displayName: string): Promise<void> {
    this.callbacks.onConnectionStateChange("connecting");

    try {
      this.room = await this.reconnectOrJoin(displayName);
    } catch (error) {
      this.callbacks.onConnectionStateChange("disconnected");
      throw this.toReadableError(error);
    }

    this.callbacks.onConnectionStateChange("connected");
    sessionStorage.setItem(RECONNECTION_TOKEN_STORAGE_KEY, this.room.reconnectionToken);
    this.attachRoomHandlers(this.room);
    this.room.send("chat_history_request");
    this.room.send("whiteboard_snapshot_request");
    this.room.send("sticky_note_snapshot_request");
  }

  /**
   * A page refresh closes the socket before the normal leave message is always
   * delivered. The server keeps that player alive during its reconnection
   * window, so reclaim the existing session before creating a new character.
   */
  private async reconnectOrJoin(displayName: string): Promise<Room> {
    const token = sessionStorage.getItem(RECONNECTION_TOKEN_STORAGE_KEY);
    if (token) {
      try {
        return await this.client.reconnect(token);
      } catch {
        sessionStorage.removeItem(RECONNECTION_TOKEN_STORAGE_KEY);
      }
    }
    return this.client.joinOrCreate(ROOM_NAME, { displayName });
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

  requestSeat(deskId: string | null): void {
    this.room?.send("seat", { deskId });
  }

  requestVoiceToken(requestId: number): void {
    this.room?.send("voice_token_request", { requestId });
  }

  requestWhiteboardPresenter(): void {
    this.room?.send("whiteboard_present_request");
  }

  releaseWhiteboardPresenter(): void {
    this.room?.send("whiteboard_release");
  }

  upsertWhiteboardShape(shape: WhiteboardShape): void {
    this.room?.send("whiteboard_shape_upsert", shape);
  }

  deleteWhiteboardShape(id: string): void {
    this.room?.send("whiteboard_shape_delete", { id } satisfies WhiteboardShapeDeleteMessage);
  }

  clearWhiteboard(): void {
    this.room?.send("whiteboard_clear");
  }

  /**
   * One-shot request/response over the already-connected room — wallet
   * linking is a follow-up action taken after joining (via Privy on the
   * client), not part of the join flow, so unlike the other room
   * interactions this is Promise-based rather than callback-based (nothing
   * else needs to observe it as ongoing state). `authToken` is the Privy
   * access token (from `usePrivy().getAccessToken()`); the server verifies it
   * against Privy directly, so no client-side signing step is needed here.
   */
  linkWallet(authToken: string): Promise<WalletLinkResultMessage> {
    if (!this.room) return Promise.reject(new Error("Not connected."));
    const requestId = this.nextRequestId();
    const result = new Promise<WalletLinkResultMessage>((resolve) => {
      this.pendingWalletLink.set(requestId, resolve);
    });
    this.room.send("wallet_link_request", { requestId, authToken });
    return result;
  }

  /** Fetches someone's office content — see `OfficeProfileLookup` for the two ways to identify them (currently-present session, or directly by wallet address for the cross-shard/offline case). */
  requestOfficeProfile(lookup: OfficeProfileLookup): Promise<OfficeProfileResultMessage> {
    if (!this.room) return Promise.reject(new Error("Not connected."));
    const requestId = this.nextRequestId();
    const result = new Promise<OfficeProfileResultMessage>((resolve) => {
      this.pendingOfficeProfile.set(requestId, resolve);
    });
    this.room.send("office_profile_request", { requestId, lookup });
    return result;
  }

  publishThesis(body: string): Promise<ThesisPublishResultMessage> {
    if (!this.room) return Promise.reject(new Error("Not connected."));
    const requestId = this.nextRequestId();
    const result = new Promise<ThesisPublishResultMessage>((resolve) => {
      this.pendingThesisPublish.set(requestId, resolve);
    });
    this.room.send("thesis_publish_request", { requestId, body });
    return result;
  }

  updateWatchlist(items: OfficeWatchlistItem[]): Promise<WatchlistUpdateResultMessage> {
    if (!this.room) return Promise.reject(new Error("Not connected."));
    const requestId = this.nextRequestId();
    const result = new Promise<WatchlistUpdateResultMessage>((resolve) => {
      this.pendingWatchlistUpdate.set(requestId, resolve);
    });
    this.room.send("watchlist_update_request", { requestId, items });
    return result;
  }

  signVisitorBook(lookup: OfficeProfileLookup, message: string): Promise<VisitorBookSignResultMessage> {
    if (!this.room) return Promise.reject(new Error("Not connected."));
    const requestId = this.nextRequestId();
    const result = new Promise<VisitorBookSignResultMessage>((resolve) => {
      this.pendingVisitorBookSign.set(requestId, resolve);
    });
    this.room.send("visitor_book_sign_request", { requestId, lookup, message });
    return result;
  }

  /** Always an upsert of the caller's own note — see `sticky_note_upsert_request`'s doc comment for why there's no "target" concept here. */
  upsertStickyNote(text: string, xFraction: number, yFraction: number): Promise<StickyNoteUpsertResultMessage> {
    if (!this.room) return Promise.reject(new Error("Not connected."));
    const requestId = this.nextRequestId();
    const result = new Promise<StickyNoteUpsertResultMessage>((resolve) => {
      this.pendingStickyNoteUpsert.set(requestId, resolve);
    });
    this.room.send("sticky_note_upsert_request", { requestId, text, xFraction, yFraction });
    return result;
  }

  /** Always deletes the caller's own note. */
  deleteStickyNote(): Promise<StickyNoteDeleteResultMessage> {
    if (!this.room) return Promise.reject(new Error("Not connected."));
    const requestId = this.nextRequestId();
    const result = new Promise<StickyNoteDeleteResultMessage>((resolve) => {
      this.pendingStickyNoteDelete.set(requestId, resolve);
    });
    this.room.send("sticky_note_delete_request", { requestId });
    return result;
  }

  private nextRequestId(): number {
    this.oneShotRequestSequence += 1;
    return this.oneShotRequestSequence;
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

    room.onMessage<ChatMessage[]>("chat_history", (messages) => {
      if (!Array.isArray(messages)) return;
      const validMessages = messages.filter(
        (message) =>
          typeof message?.senderId === "string" &&
          typeof message.displayName === "string" &&
          typeof message.text === "string" &&
          Number.isFinite(message.timestamp),
      );
      this.callbacks.onChatHistory(validMessages);
    });

    room.onMessage<SeatResultMessage>("seat_result", (message) => {
      this.callbacks.onSeatResult(message);
    });

    room.onMessage<VoiceTokenResultMessage>("voice_token_result", (message) => {
      if (
        !message ||
        !Number.isSafeInteger(message.requestId) ||
        typeof message.enabled !== "boolean" ||
        typeof message.serverUrl !== "string"
      ) {
        console.warn("[MultiplayerClient] ignored invalid voice token response");
        return;
      }
      this.callbacks.onVoiceTokenResult(message);
    });

    room.onMessage<WhiteboardSnapshot>("whiteboard_snapshot", (snapshot) => {
      if (
        !snapshot ||
        !Array.isArray(snapshot.shapes) ||
        (snapshot.presenterSessionId !== null && typeof snapshot.presenterSessionId !== "string") ||
        (snapshot.presenterDisplayName !== null && typeof snapshot.presenterDisplayName !== "string")
      ) {
        return;
      }
      this.callbacks.onWhiteboardSnapshot(snapshot);
    });

    room.onMessage<WhiteboardShape>("whiteboard_shape_upsert", (shape) => {
      if (!shape || typeof shape.id !== "string" || typeof shape.type !== "string") return;
      this.callbacks.onWhiteboardShapeUpsert(shape);
    });

    room.onMessage<WhiteboardShapeDeleteMessage>("whiteboard_shape_delete", (message) => {
      if (!message || typeof message.id !== "string") return;
      this.callbacks.onWhiteboardShapeDelete(message.id);
    });

    room.onMessage<WalletLinkResultMessage>("wallet_link_result", (message) => {
      const resolve = this.pendingWalletLink.get(message.requestId);
      if (!resolve) return;
      this.pendingWalletLink.delete(message.requestId);
      resolve(message);
    });

    room.onMessage<OfficeProfileResultMessage>("office_profile_result", (message) => {
      const resolve = this.pendingOfficeProfile.get(message.requestId);
      if (!resolve) return;
      this.pendingOfficeProfile.delete(message.requestId);
      resolve(message);
    });

    room.onMessage<ThesisPublishResultMessage>("thesis_publish_result", (message) => {
      const resolve = this.pendingThesisPublish.get(message.requestId);
      if (!resolve) return;
      this.pendingThesisPublish.delete(message.requestId);
      resolve(message);
    });

    room.onMessage<WatchlistUpdateResultMessage>("watchlist_update_result", (message) => {
      const resolve = this.pendingWatchlistUpdate.get(message.requestId);
      if (!resolve) return;
      this.pendingWatchlistUpdate.delete(message.requestId);
      resolve(message);
    });

    room.onMessage<VisitorBookSignResultMessage>("visitor_book_sign_result", (message) => {
      const resolve = this.pendingVisitorBookSign.get(message.requestId);
      if (!resolve) return;
      this.pendingVisitorBookSign.delete(message.requestId);
      resolve(message);
    });

    room.onMessage<StickyNoteSnapshot>("sticky_note_snapshot", (snapshot) => {
      if (!snapshot || !Array.isArray(snapshot.notes)) return;
      this.callbacks.onStickyNoteSnapshot(snapshot);
    });

    room.onMessage<StickyNote>("sticky_note_upsert", (note) => {
      if (!note || typeof note.authorSessionId !== "string" || typeof note.text !== "string") return;
      this.callbacks.onStickyNoteUpsert(note);
    });

    room.onMessage<StickyNoteDeleteMessage>("sticky_note_delete", (message) => {
      if (!message || typeof message.authorSessionId !== "string") return;
      this.callbacks.onStickyNoteDelete(message.authorSessionId);
    });

    room.onMessage<StickyNoteUpsertResultMessage>("sticky_note_upsert_result", (message) => {
      const resolve = this.pendingStickyNoteUpsert.get(message.requestId);
      if (!resolve) return;
      this.pendingStickyNoteUpsert.delete(message.requestId);
      resolve(message);
    });

    room.onMessage<StickyNoteDeleteResultMessage>("sticky_note_delete_result", (message) => {
      const resolve = this.pendingStickyNoteDelete.get(message.requestId);
      if (!resolve) return;
      this.pendingStickyNoteDelete.delete(message.requestId);
      resolve(message);
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
      sessionStorage.setItem(RECONNECTION_TOKEN_STORAGE_KEY, this.room.reconnectionToken);
      this.attachRoomHandlers(this.room);
      this.room.send("chat_history_request");
      this.room.send("whiteboard_snapshot_request");
      this.room.send("sticky_note_snapshot_request");
    } catch {
      sessionStorage.removeItem(RECONNECTION_TOKEN_STORAGE_KEY);
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
      seatedDeskId: typeof player.seatedDeskId === "string" && player.seatedDeskId ? player.seatedDeskId : null,
      walletAddress: typeof player.walletAddress === "string" && player.walletAddress ? player.walletAddress : null,
      officeSlotId: typeof player.officeSlotId === "string" && player.officeSlotId ? player.officeSlotId : null,
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
