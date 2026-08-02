import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { config } from "../config";
import { runMigrations } from "./migrations";

let db: Database.Database | null = null;

/**
 * Lazy singleton connection (mirrors `wallet/privyAuth.ts`'s `getClient()`
 * pattern). Every room shard in this single Node process shares this same
 * connection — there's no cross-shard cache/invalidation problem to solve
 * as long as the game-server runs as one process (see design notes in the
 * office feature plan).
 */
export function getDb(): Database.Database {
  if (db) return db;

  if (config.db.path !== ":memory:") {
    fs.mkdirSync(path.dirname(config.db.path), { recursive: true });
  }

  db = new Database(config.db.path);
  db.pragma("journal_mode = WAL");
  runMigrations(db);
  return db;
}
