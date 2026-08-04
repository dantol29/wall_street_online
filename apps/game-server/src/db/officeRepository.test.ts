import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "./migrations";
import {
  addVisitorBookEntry,
  getCurrentThesis,
  getOfficeProfileBundle,
  getProfileDisplayName,
  getWatchlist,
  listVisitorBookEntries,
  publishThesis,
  replaceWatchlist,
  resolveProfileIdByAddress,
  upsertProfileAndWallet,
} from "./officeRepository";

let db: Database.Database;

beforeEach(() => {
  db = new Database(":memory:");
  runMigrations(db);
});

describe("upsertProfileAndWallet / resolveProfileIdByAddress", () => {
  it("creates a profile and a primary wallet link on first call", () => {
    upsertProfileAndWallet(db, { playerId: "did:privy:1", displayName: "Alice", address: "0xabc", chain: "ethereum" });

    expect(resolveProfileIdByAddress(db, "0xabc", "ethereum")).toBe("did:privy:1");
    const bundle = getOfficeProfileBundle(db, "did:privy:1");
    expect(bundle?.displayName).toBe("Alice");
    expect(bundle?.primaryWalletAddress).toBe("0xabc");
  });

  it("demotes the previous primary wallet when a new one is linked", () => {
    upsertProfileAndWallet(db, { playerId: "did:privy:1", displayName: "Alice", address: "0xabc", chain: "ethereum" });
    upsertProfileAndWallet(db, { playerId: "did:privy:1", displayName: "Alice", address: "0xdef", chain: "ethereum" });

    const bundle = getOfficeProfileBundle(db, "did:privy:1");
    expect(bundle?.primaryWalletAddress).toBe("0xdef");
    // The old wallet is still resolvable to the same profile, just no longer primary.
    expect(resolveProfileIdByAddress(db, "0xabc", "ethereum")).toBe("did:privy:1");
  });

  it("refreshes the cached display name on relink", () => {
    upsertProfileAndWallet(db, { playerId: "did:privy:1", displayName: "Alice", address: "0xabc", chain: "ethereum" });
    upsertProfileAndWallet(db, { playerId: "did:privy:1", displayName: "Alice2", address: "0xabc", chain: "ethereum" });

    expect(getOfficeProfileBundle(db, "did:privy:1")?.displayName).toBe("Alice2");
  });

  it("returns null resolving an address that was never linked", () => {
    expect(resolveProfileIdByAddress(db, "0xnope", "ethereum")).toBeNull();
  });
});

describe("getProfileDisplayName", () => {
  it("returns null for an identity that has never linked a wallet", () => {
    expect(getProfileDisplayName(db, "did:privy:unknown")).toBeNull();
  });

  it("returns whatever name was most recently persisted for that identity", () => {
    upsertProfileAndWallet(db, { playerId: "did:privy:1", displayName: "Alice", address: "0xabc", chain: "ethereum" });
    expect(getProfileDisplayName(db, "did:privy:1")).toBe("Alice");

    upsertProfileAndWallet(db, { playerId: "did:privy:1", displayName: "Alice2", address: "0xabc", chain: "ethereum" });
    expect(getProfileDisplayName(db, "did:privy:1")).toBe("Alice2");
  });
});

describe("thesis publishing", () => {
  beforeEach(() => {
    upsertProfileAndWallet(db, { playerId: "did:privy:1", displayName: "Alice", address: "0xabc", chain: "ethereum" });
  });

  it("has no current thesis before one is published", () => {
    expect(getCurrentThesis(db, "did:privy:1")).toBeNull();
  });

  it("publishing replaces the current thesis and keeps history", () => {
    publishThesis(db, "did:privy:1", "SOL is undervalued.");
    publishThesis(db, "did:privy:1", "Actually, BTC dominance rises.");

    const current = getCurrentThesis(db, "did:privy:1");
    expect(current?.body).toBe("Actually, BTC dominance rises.");

    const historyCount = db
      .prepare(`SELECT COUNT(*) AS n FROM office_theses WHERE player_id = ?`)
      .get("did:privy:1") as { n: number };
    expect(historyCount.n).toBe(2);
  });
});

describe("watchlist replace semantics", () => {
  beforeEach(() => {
    upsertProfileAndWallet(db, { playerId: "did:privy:1", displayName: "Alice", address: "0xabc", chain: "ethereum" });
  });

  it("stores items in order and full-replaces on the next call", () => {
    replaceWatchlist(db, "did:privy:1", [
      { symbol: "BTC", note: "core" },
      { symbol: "ETH", note: "" },
    ]);
    expect(getWatchlist(db, "did:privy:1")).toEqual([
      { symbol: "BTC", note: "core" },
      { symbol: "ETH", note: "" },
    ]);

    replaceWatchlist(db, "did:privy:1", [{ symbol: "SOL", note: "new pick" }]);
    expect(getWatchlist(db, "did:privy:1")).toEqual([{ symbol: "SOL", note: "new pick" }]);
  });
});

describe("visitor book", () => {
  beforeEach(() => {
    upsertProfileAndWallet(db, { playerId: "did:privy:1", displayName: "Alice", address: "0xabc", chain: "ethereum" });
  });

  it("records guest signatures with a null visitor id but a durable name snapshot", () => {
    addVisitorBookEntry(db, {
      ownerPlayerId: "did:privy:1",
      visitorPlayerId: null,
      visitorDisplayName: "Trader-4821",
      message: "Great macro board!",
    });

    const entries = listVisitorBookEntries(db, "did:privy:1");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ visitorDisplayName: "Trader-4821", message: "Great macro board!" });
  });

  it("trims entries beyond the cap, keeping the most recent", () => {
    for (let i = 0; i < 25; i++) {
      addVisitorBookEntry(db, {
        ownerPlayerId: "did:privy:1",
        visitorPlayerId: null,
        visitorDisplayName: `Visitor-${i}`,
        message: `msg ${i}`,
      });
    }

    const totalRows = db
      .prepare(`SELECT COUNT(*) AS n FROM visitor_book_entries WHERE office_owner_player_id = ?`)
      .get("did:privy:1") as { n: number };
    expect(totalRows.n).toBe(20);

    const entries = listVisitorBookEntries(db, "did:privy:1", 1);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.message).toBe("msg 24");
  });
});

describe("getOfficeProfileBundle", () => {
  it("returns null for a playerId with no profile", () => {
    expect(getOfficeProfileBundle(db, "did:privy:unknown")).toBeNull();
  });

  it("assembles thesis, watchlist, and visitor book together", () => {
    upsertProfileAndWallet(db, { playerId: "did:privy:1", displayName: "Alice", address: "0xabc", chain: "ethereum" });
    publishThesis(db, "did:privy:1", "SOL is undervalued.");
    replaceWatchlist(db, "did:privy:1", [{ symbol: "BTC", note: "" }]);
    addVisitorBookEntry(db, {
      ownerPlayerId: "did:privy:1",
      visitorPlayerId: null,
      visitorDisplayName: "Bob",
      message: "hi",
    });

    const bundle = getOfficeProfileBundle(db, "did:privy:1");
    expect(bundle?.currentThesis?.body).toBe("SOL is undervalued.");
    expect(bundle?.watchlist).toEqual([{ symbol: "BTC", note: "" }]);
    expect(bundle?.visitorBook).toHaveLength(1);
  });
});
