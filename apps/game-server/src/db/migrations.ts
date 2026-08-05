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

    -- The Bell Podium. Singleton row (id is always 1) holding the *current*
    -- cycle's end time — persisted (unlike the whiteboard/sticky wall, which
    -- are memory-only) so a server restart mid-cycle resumes exactly where
    -- it left off instead of silently wiping everyone's launched tokens.
    CREATE TABLE IF NOT EXISTS bell_cycle_state (
      id             INTEGER PRIMARY KEY CHECK (id = 1),
      cycle_ends_at  INTEGER NOT NULL
    );

    -- One row per currently-launched token this cycle (at most
    -- TOKEN_SLOT_COUNT); cleared entirely each time a cycle resolves and a
    -- fresh one starts. display_name_snapshot mirrors visitor_book_entries'
    -- snapshot approach — a launcher's name on the gauge doesn't retroactively
    -- change if they rename mid-cycle.
    CREATE TABLE IF NOT EXISTS bell_cycle_slots (
      slot_index             INTEGER PRIMARY KEY,
      player_id              TEXT NOT NULL REFERENCES player_profiles(id),
      display_name_snapshot  TEXT NOT NULL,
      token_name             TEXT NOT NULL,
      ticker                 TEXT NOT NULL,
      seed                   INTEGER NOT NULL,
      launched_at            INTEGER NOT NULL
    );

    -- One settled row per resolved cycle, forever — this is the Wall of Fame.
    -- winner_player_id/winner_display_name are null when nobody launched a
    -- token that cycle (no bell rung, nothing to display beyond the record
    -- that the cycle simply passed).
    CREATE TABLE IF NOT EXISTS bell_cycle_history (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      cycle_ends_at         INTEGER NOT NULL,
      winner_player_id      TEXT REFERENCES player_profiles(id),
      winner_display_name   TEXT,
      token_name            TEXT,
      ticker                TEXT,
      market_cap_usd        REAL,
      created_at            INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_bell_history_ends_at ON bell_cycle_history(cycle_ends_at DESC);
  `);
}
