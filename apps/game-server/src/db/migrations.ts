import type Database from "better-sqlite3";

/**
 * Plain, idempotent DDL run at boot — no ORM/migration-framework, matching
 * this codebase's existing preference for small hand-rolled modules over
 * heavier tooling. Safe to run against an already-migrated database.
 */
export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS player_profiles (
      id             TEXT PRIMARY KEY,        -- Privy DID
      display_name   TEXT NOT NULL,
      created_at     INTEGER NOT NULL,
      updated_at     INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS wallet_links (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id      TEXT NOT NULL REFERENCES player_profiles(id),
      address        TEXT NOT NULL,
      chain          TEXT NOT NULL,
      is_primary     INTEGER NOT NULL DEFAULT 0,
      linked_at      INTEGER NOT NULL,
      UNIQUE(address, chain)
    );

    -- Append-only + is_current flag: one boolean column buys a career trail
    -- for free ("published N theses") at ~zero extra cost over a bare
    -- mutable row.
    CREATE TABLE IF NOT EXISTS office_theses (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id      TEXT NOT NULL REFERENCES player_profiles(id),
      body           TEXT NOT NULL,
      is_current     INTEGER NOT NULL DEFAULT 1,
      created_at     INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_theses_current ON office_theses(player_id, is_current);

    -- Full-replace-on-edit semantics — only the owner ever edits their own
    -- list, so there's no concurrent-writer race to guard against.
    CREATE TABLE IF NOT EXISTS watchlist_items (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id      TEXT NOT NULL REFERENCES player_profiles(id),
      symbol         TEXT NOT NULL,
      note           TEXT NOT NULL DEFAULT '',
      sort_order     INTEGER NOT NULL,
      updated_at     INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_watchlist_order ON watchlist_items(player_id, sort_order);

    -- Guests can sign but never own — visitor_player_id is nullable
    -- specifically so a guest's signature still records a durable
    -- display-name snapshot (guest names aren't persisted anywhere else).
    CREATE TABLE IF NOT EXISTS visitor_book_entries (
      id                            INTEGER PRIMARY KEY AUTOINCREMENT,
      office_owner_player_id        TEXT NOT NULL REFERENCES player_profiles(id),
      visitor_player_id             TEXT REFERENCES player_profiles(id),
      visitor_display_name_snapshot TEXT NOT NULL,
      message                       TEXT NOT NULL,
      created_at                    INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_visitorbook_owner ON visitor_book_entries(office_owner_player_id, created_at DESC);
  `);
}
