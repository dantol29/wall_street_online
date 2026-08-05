import type Database from "better-sqlite3";
import { WALL_OF_FAME_MAX_ENTRIES } from "@multiplayer/shared";

export interface BellCycleSlotRecord {
  slotIndex: number;
  playerId: string;
  displayNameSnapshot: string;
  tokenName: string;
  ticker: string;
  seed: number;
  launchedAtMs: number;
}

export interface BellCycleHistoryRecord {
  cycleEndsAtMs: number;
  winnerPlayerId: string | null;
  winnerDisplayName: string | null;
  tokenName: string | null;
  ticker: string | null;
  marketCapUsd: number | null;
}

/** Null the very first time the server ever boots — no cycle has been created yet. */
export function loadBellCycleEndsAt(db: Database.Database): number | null {
  const row = db.prepare(`SELECT cycle_ends_at AS cycleEndsAtMs FROM bell_cycle_state WHERE id = 1`).get() as
    | { cycleEndsAtMs: number }
    | undefined;
  return row?.cycleEndsAtMs ?? null;
}

export function saveBellCycleEndsAt(db: Database.Database, cycleEndsAtMs: number): void {
  db.prepare(
    `INSERT INTO bell_cycle_state (id, cycle_ends_at) VALUES (1, ?)
     ON CONFLICT(id) DO UPDATE SET cycle_ends_at = ?`,
  ).run(cycleEndsAtMs, cycleEndsAtMs);
}

export function listBellCycleSlots(db: Database.Database): BellCycleSlotRecord[] {
  return db
    .prepare(
      `SELECT slot_index AS slotIndex, player_id AS playerId, display_name_snapshot AS displayNameSnapshot,
              token_name AS tokenName, ticker, seed, launched_at AS launchedAtMs
       FROM bell_cycle_slots ORDER BY slot_index ASC`,
    )
    .all() as BellCycleSlotRecord[];
}

export function launchBellCycleSlot(db: Database.Database, input: BellCycleSlotRecord): void {
  db.prepare(
    `INSERT INTO bell_cycle_slots (slot_index, player_id, display_name_snapshot, token_name, ticker, seed, launched_at)
     VALUES (@slotIndex, @playerId, @displayNameSnapshot, @tokenName, @ticker, @seed, @launchedAtMs)`,
  ).run(input);
}

/** Wipes every launched slot — called once a cycle resolves, right before the next one starts. */
export function clearBellCycleSlots(db: Database.Database): void {
  db.prepare(`DELETE FROM bell_cycle_slots`).run();
}

export function insertBellCycleHistory(db: Database.Database, input: BellCycleHistoryRecord): void {
  db.prepare(
    `INSERT INTO bell_cycle_history (cycle_ends_at, winner_player_id, winner_display_name, token_name, ticker, market_cap_usd, created_at)
     VALUES (@cycleEndsAtMs, @winnerPlayerId, @winnerDisplayName, @tokenName, @ticker, @marketCapUsd, @now)`,
  ).run({ ...input, now: Date.now() });
}

/** Most recent settled cycles first — this is the Wall of Fame's data source. */
export function listBellCycleHistory(
  db: Database.Database,
  limit: number = WALL_OF_FAME_MAX_ENTRIES,
): BellCycleHistoryRecord[] {
  return db
    .prepare(
      `SELECT cycle_ends_at AS cycleEndsAtMs, winner_player_id AS winnerPlayerId, winner_display_name AS winnerDisplayName,
              token_name AS tokenName, ticker, market_cap_usd AS marketCapUsd
       FROM bell_cycle_history ORDER BY cycle_ends_at DESC, id DESC LIMIT ?`,
    )
    .all(limit) as BellCycleHistoryRecord[];
}
