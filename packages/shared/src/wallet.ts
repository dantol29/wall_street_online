/**
 * Wallet-based identity is optional and additive: players can still join and
 * play as an anonymous guest (see `messages.ts`'s plain `displayName` join
 * option). Linking a wallet is a follow-up action taken after joining —
 * connection and signing happen client-side via Privy
 * (`@privy-io/react-auth`), then the resulting Privy access token is sent
 * here for the server to verify directly against Privy
 * (`@privy-io/server-auth`).
 */
export interface WalletLinkRequestMessage {
  requestId: number;
  authToken: string;
}

export interface WalletLinkResultMessage {
  requestId: number;
  success: boolean;
  address?: string;
  /** The linked wallet's chain type as reported by Privy, e.g. "ethereum". */
  chain?: string;
  /**
   * The office alcove (see OFFICE_SLOTS) this player was just bound to for
   * this session, if one was free — undefined if every slot was taken.
   * Carried here (rather than left for the client to discover via schema
   * sync) because the local player's own PlayerState changes aren't
   * observed reactively — see MultiplayerClient.attachRoomHandlers, which
   * only watches *other* players' `onChange`.
   */
  officeSlotId?: string;
  message?: string;
}
