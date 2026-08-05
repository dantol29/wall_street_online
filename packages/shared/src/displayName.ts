/**
 * Setting/changing a display name is only meaningful for a wallet-linked
 * trader — guests keep their randomly-assigned "Trader-XXXX" name for the
 * session (see `messages.ts`'s plain `displayName` join option) and never
 * send this. See `WalletLinkResultMessage.needsDisplayName` for how a
 * first-time linker is told they need to.
 */
export const DISPLAY_NAME_MIN_LENGTH = 2;
export const DISPLAY_NAME_MAX_LENGTH = 24;

export interface SetDisplayNameRequestMessage {
  requestId: number;
  displayName: string;
}

export interface SetDisplayNameResultMessage {
  requestId: number;
  success: boolean;
  displayName?: string;
  message?: string;
}
