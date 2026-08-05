import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "./migrations";
import { upsertProfileAndWallet } from "./officeRepository";
import {
  clearBellCycleSlots,
  insertBellCycleHistory,
  launchBellCycleSlot,
  listBellCycleHistory,
  listBellCycleSlots,
  loadBellCycleEndsAt,
  saveBellCycleEndsAt,
} from "./bellCycleRepository";

let db: Database.Database;

beforeEach(() => {
  db = new Database(":memory:");
  runMigrations(db);
  upsertProfileAndWallet(db, { playerId: "did:privy:1", displayName: "Alice", address: "0xabc", chain: "ethereum" });
});

describe("bell cycle state", () => {
  it("returns null before any cycle has ever been created", () => {
    expect(loadBellCycleEndsAt(db)).toBeNull();
  });

  it("persists and overwrites the singleton cycle-ends-at row", () => {
    saveBellCycleEndsAt(db, 1000);
    expect(loadBellCycleEndsAt(db)).toBe(1000);

    saveBellCycleEndsAt(db, 2000);
    expect(loadBellCycleEndsAt(db)).toBe(2000);
  });
});

describe("bell cycle slots", () => {
  it("has no launched slots initially", () => {
    expect(listBellCycleSlots(db)).toEqual([]);
  });

  it("records a launch and lists it back in slot order", () => {
    launchBellCycleSlot(db, {
      slotIndex: 2,
      playerId: "did:privy:1",
      displayNameSnapshot: "Alice",
      tokenName: "Moon Coin",
      ticker: "MOON",
      seed: 42,
      launchedAtMs: 5000,
    });

    const slots = listBellCycleSlots(db);
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({ slotIndex: 2, tokenName: "Moon Coin", ticker: "MOON", seed: 42 });
  });

  it("clears every launched slot", () => {
    launchBellCycleSlot(db, {
      slotIndex: 0,
      playerId: "did:privy:1",
      displayNameSnapshot: "Alice",
      tokenName: "Moon Coin",
      ticker: "MOON",
      seed: 1,
      launchedAtMs: 0,
    });
    clearBellCycleSlots(db);
    expect(listBellCycleSlots(db)).toEqual([]);
  });
});

describe("bell cycle history", () => {
  it("has no history before any cycle resolves", () => {
    expect(listBellCycleHistory(db)).toEqual([]);
  });

  it("records a winning cycle and a winnerless cycle, most recent first", () => {
    insertBellCycleHistory(db, {
      cycleEndsAtMs: 1000,
      winnerPlayerId: "did:privy:1",
      winnerDisplayName: "Alice",
      tokenName: "Moon Coin",
      ticker: "MOON",
      marketCapUsd: 55_000,
    });
    insertBellCycleHistory(db, {
      cycleEndsAtMs: 2000,
      winnerPlayerId: null,
      winnerDisplayName: null,
      tokenName: null,
      ticker: null,
      marketCapUsd: null,
    });

    const history = listBellCycleHistory(db);
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ cycleEndsAtMs: 2000, winnerDisplayName: null });
    expect(history[1]).toMatchObject({ cycleEndsAtMs: 1000, winnerDisplayName: "Alice", marketCapUsd: 55_000 });
  });

  it("respects the limit parameter", () => {
    for (let i = 0; i < 5; i++) {
      insertBellCycleHistory(db, {
        cycleEndsAtMs: i,
        winnerPlayerId: null,
        winnerDisplayName: null,
        tokenName: null,
        ticker: null,
        marketCapUsd: null,
      });
    }
    expect(listBellCycleHistory(db, 2)).toHaveLength(2);
  });
});
