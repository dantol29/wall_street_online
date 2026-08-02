/**
 * Personal trader offices — content (thesis wall, watchlist, visitor book)
 * is persisted server-side keyed by a player's durable Privy identity (see
 * the game-server's officeRepository), not by their current session or
 * physical office slot. All messages here are one-shot, human-triggered
 * request/response pairs (mirroring wallet.ts's `linkWallet` shape) rather
 * than continuously-broadcast state like the whiteboard — office content
 * changes are rare, so a visitor simply re-fetches on their next interaction
 * rather than needing a live push.
 */

/**
 * Looks a player's office up either by their current session (the walk-by/
 * in-person case) or directly by wallet address (the cross-shard/offline
 * case — what makes "go check Alice's office" work as a durable, shareable
 * social artifact even when Alice isn't in your shard right now).
 */
export type OfficeProfileLookup =
  | { type: "session"; sessionId: string }
  | { type: "wallet"; address: string; chain: string };

export interface OfficeThesis {
  body: string;
  createdAt: number;
}

export interface OfficeWatchlistItem {
  symbol: string;
  note: string;
}

export interface OfficeVisitorBookEntry {
  visitorDisplayName: string;
  message: string;
  createdAt: number;
}

export interface OfficeProfile {
  displayName: string;
  primaryWalletAddress: string | null;
  currentThesis: OfficeThesis | null;
  watchlist: OfficeWatchlistItem[];
  visitorBook: OfficeVisitorBookEntry[];
}

export interface OfficeProfileRequestMessage {
  requestId: number;
  lookup: OfficeProfileLookup;
}

export interface OfficeProfileResultMessage {
  requestId: number;
  success: boolean;
  profile?: OfficeProfile;
  message?: string;
}

export interface ThesisPublishRequestMessage {
  requestId: number;
  body: string;
}

export interface ThesisPublishResultMessage {
  requestId: number;
  success: boolean;
  thesis?: OfficeThesis;
  message?: string;
}

export interface WatchlistUpdateRequestMessage {
  requestId: number;
  items: OfficeWatchlistItem[];
}

export interface WatchlistUpdateResultMessage {
  requestId: number;
  success: boolean;
  items?: OfficeWatchlistItem[];
  message?: string;
}

export interface VisitorBookSignRequestMessage {
  requestId: number;
  lookup: OfficeProfileLookup;
  message: string;
}

export interface VisitorBookSignResultMessage {
  requestId: number;
  success: boolean;
  entry?: OfficeVisitorBookEntry;
  message?: string;
}
