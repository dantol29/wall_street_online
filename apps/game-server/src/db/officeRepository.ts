import type Database from "better-sqlite3";
import { VISITOR_BOOK_MAX_ENTRIES } from "@multiplayer/shared";

export interface ThesisRecord {
  body: string;
  createdAt: number;
}

export interface WatchlistItemRecord {
  symbol: string;
  note: string;
}

export interface VisitorBookEntryRecord {
  visitorDisplayName: string;
  message: string;
  createdAt: number;
}

export interface OfficeProfileBundle {
  playerId: string;
  displayName: string;
  primaryWalletAddress: string | null;
  currentThesis: ThesisRecord | null;
  watchlist: WatchlistItemRecord[];
  visitorBook: VisitorBookEntryRecord[];
}

/**
 * Lazily creates or refreshes a player's profile and marks the given wallet
 * as their primary — called on every successful Privy wallet link (which,
 * per WalletPanel's auto-link effect, fires on essentially every session).
 * A `players` row's existence is itself what makes a player have an office.
 */
export function upsertProfileAndWallet(
  db: Database.Database,
  input: { playerId: string; displayName: string; address: string; chain: string },
): void {
  const now = Date.now();

  db.transaction(() => {
    db.prepare(
      `INSERT INTO player_profiles (id, display_name, created_at, updated_at)
       VALUES (@playerId, @displayName, @now, @now)
       ON CONFLICT(id) DO UPDATE SET display_name = @displayName, updated_at = @now`,
    ).run({ playerId: input.playerId, displayName: input.displayName, now });

    db.prepare(`UPDATE wallet_links SET is_primary = 0 WHERE player_id = ?`).run(input.playerId);

    db.prepare(
      `INSERT INTO wallet_links (player_id, address, chain, is_primary, linked_at)
       VALUES (@playerId, @address, @chain, 1, @now)
       ON CONFLICT(address, chain) DO UPDATE SET is_primary = 1`,
    ).run({ playerId: input.playerId, address: input.address, chain: input.chain, now });
  })();
}

/** Resolves a player's durable identity from one of their linked wallet addresses (used for the cross-shard "visit by wallet" lookup). */
export function resolveProfileIdByAddress(db: Database.Database, address: string, chain: string): string | null {
  const row = db
    .prepare(`SELECT player_id AS playerId FROM wallet_links WHERE address = ? AND chain = ? LIMIT 1`)
    .get(address, chain) as { playerId: string } | undefined;
  return row?.playerId ?? null;
}

/**
 * The display name this identity already chose in a previous session, if
 * any — null if this Privy identity has never linked a wallet before (a
 * brand new trader, who must choose one; see `WalletLinkResultMessage.needsDisplayName`).
 */
export function getProfileDisplayName(db: Database.Database, playerId: string): string | null {
  const row = db.prepare(`SELECT display_name AS displayName FROM player_profiles WHERE id = ?`).get(playerId) as
    | { displayName: string }
    | undefined;
  return row?.displayName ?? null;
}

export function getCurrentThesis(db: Database.Database, playerId: string): ThesisRecord | null {
  const row = db
    .prepare(`SELECT body, created_at AS createdAt FROM office_theses WHERE player_id = ? AND is_current = 1 LIMIT 1`)
    .get(playerId) as ThesisRecord | undefined;
  return row ?? null;
}

/** Flips the previous current thesis to history and inserts the new one, in one transaction. */
export function publishThesis(db: Database.Database, playerId: string, body: string): ThesisRecord {
  const now = Date.now();

  db.transaction(() => {
    db.prepare(`UPDATE office_theses SET is_current = 0 WHERE player_id = ? AND is_current = 1`).run(playerId);
    db.prepare(`INSERT INTO office_theses (player_id, body, is_current, created_at) VALUES (?, ?, 1, ?)`).run(
      playerId,
      body,
      now,
    );
  })();

  return { body, createdAt: now };
}

export function getWatchlist(db: Database.Database, playerId: string): WatchlistItemRecord[] {
  return db
    .prepare(`SELECT symbol, note FROM watchlist_items WHERE player_id = ? ORDER BY sort_order ASC`)
    .all(playerId) as WatchlistItemRecord[];
}

/** Full-replace semantics: only the owner ever edits their own list, so there's no concurrent-writer race to protect against. */
export function replaceWatchlist(
  db: Database.Database,
  playerId: string,
  items: WatchlistItemRecord[],
): WatchlistItemRecord[] {
  const now = Date.now();

  db.transaction(() => {
    db.prepare(`DELETE FROM watchlist_items WHERE player_id = ?`).run(playerId);
    const insert = db.prepare(
      `INSERT INTO watchlist_items (player_id, symbol, note, sort_order, updated_at) VALUES (?, ?, ?, ?, ?)`,
    );
    items.forEach((item, index) => insert.run(playerId, item.symbol, item.note, index, now));
  })();

  return items;
}

export function listVisitorBookEntries(
  db: Database.Database,
  ownerPlayerId: string,
  limit: number = VISITOR_BOOK_MAX_ENTRIES,
): VisitorBookEntryRecord[] {
  return db
    .prepare(
      `SELECT visitor_display_name_snapshot AS visitorDisplayName, message, created_at AS createdAt
       FROM visitor_book_entries WHERE office_owner_player_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`,
    )
    .all(ownerPlayerId, limit) as VisitorBookEntryRecord[];
}

/** Inserts a new entry and trims the oldest beyond the cap for that office, mirroring MAX_CHAT_HISTORY_MESSAGES's cap-and-trim idiom. */
export function addVisitorBookEntry(
  db: Database.Database,
  input: { ownerPlayerId: string; visitorPlayerId: string | null; visitorDisplayName: string; message: string },
): VisitorBookEntryRecord {
  const now = Date.now();

  db.transaction(() => {
    db.prepare(
      `INSERT INTO visitor_book_entries (office_owner_player_id, visitor_player_id, visitor_display_name_snapshot, message, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(input.ownerPlayerId, input.visitorPlayerId, input.visitorDisplayName, input.message, now);

    db.prepare(
      `DELETE FROM visitor_book_entries
       WHERE office_owner_player_id = ?
       AND id NOT IN (
         SELECT id FROM visitor_book_entries WHERE office_owner_player_id = ? ORDER BY created_at DESC, id DESC LIMIT ?
       )`,
    ).run(input.ownerPlayerId, input.ownerPlayerId, VISITOR_BOOK_MAX_ENTRIES);
  })();

  return { visitorDisplayName: input.visitorDisplayName, message: input.message, createdAt: now };
}

function getDisplayName(db: Database.Database, playerId: string): string | null {
  const row = db.prepare(`SELECT display_name AS displayName FROM player_profiles WHERE id = ?`).get(playerId) as
    | { displayName: string }
    | undefined;
  return row?.displayName ?? null;
}

function getPrimaryWalletAddress(db: Database.Database, playerId: string): string | null {
  const row = db
    .prepare(`SELECT address FROM wallet_links WHERE player_id = ? AND is_primary = 1 LIMIT 1`)
    .get(playerId) as { address: string } | undefined;
  return row?.address ?? null;
}

/** The full read bundle for rendering someone's office (thesis wall + watchlist + visitor book). Returns null if no profile exists for this playerId. */
export function getOfficeProfileBundle(db: Database.Database, playerId: string): OfficeProfileBundle | null {
  const displayName = getDisplayName(db, playerId);
  if (displayName === null) return null;

  return {
    playerId,
    displayName,
    primaryWalletAddress: getPrimaryWalletAddress(db, playerId),
    currentThesis: getCurrentThesis(db, playerId),
    watchlist: getWatchlist(db, playerId),
    visitorBook: listVisitorBookEntries(db, playerId),
  };
}
