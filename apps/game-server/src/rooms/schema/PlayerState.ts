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

  @type("string")
  seatedDeskId: string = "";

  /** Empty until the player links a wallet (see SocialRoom's wallet_link_request handler) — guest play never sets these. */
  @type("string")
  walletAddress: string = "";

  @type("string")
  walletChain: string = "";

  /** Privy's stable user DID, set alongside walletAddress/walletChain — durable office identity, unlike walletAddress which can change if a player rotates wallets. */
  @type("string")
  playerId: string = "";

  /** Which physical office alcove (see OFFICE_SLOTS) this session is bound to, if any — session-scoped, not persisted; empty until a wallet-linked player is assigned one. */
  @type("string")
  officeSlotId: string = "";
}
