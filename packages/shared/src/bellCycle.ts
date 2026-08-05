/**
 * The Bell Podium — a scheduled, server-wide ceremony. Every `CYCLE_DURATION_MS`,
 * whoever launched the best-performing simulated token gets to ring the bell.
 * Tokens are entirely simulated (no real market data): a wallet-linked player
 * "launches" one into an open slot at the trading pit, and its market cap
 * from then on is a deterministic function of a random seed assigned at
 * launch and elapsed time (`computeMarketCapUsd`) — the same function runs on
 * the server (to pick a winner) and on every client (to animate the gauges),
 * so there's no need to broadcast a live-ticking number.
 *
 * Slot occupancy + the cycle's end time replicate continuously (same
 * architecture as `stickyWall.ts`'s notes — plain state, broadcast on
 * change), but unlike the sticky wall, the *settled result* of each cycle is
 * durably persisted (see the game-server's `bellCycleRepository`) so the Wall
 * of Fame survives restarts and builds real history over time.
 */

export const TOKEN_SLOT_COUNT = 6;
export const CYCLE_DURATION_MS = 24 * 60 * 60 * 1000;

export const TOKEN_NAME_MIN_LENGTH = 2;
export const TOKEN_NAME_MAX_LENGTH = 24;
export const TOKEN_TICKER_MIN_LENGTH = 2;
export const TOKEN_TICKER_MAX_LENGTH = 6;

export const LAUNCH_TOKEN_COOLDOWN_MS = 5000;

/** The trading pit's center (see Environment.tsx's StaticCylinder stack) — where a player launches a token. */
export const BELL_PIT_POSITION = { x: 0, z: 0 } as const;
export const BELL_PIT_INTERACTION_DISTANCE_METERS = 3.2;

/** Raised balcony along the (otherwise undecorated) east wall — faces back across the open center so it's visible from anywhere on the floor. */
export const BELL_PODIUM_POSITION = { x: 9, y: 2.2, z: 0 } as const;
/** Beyond this, a player is considered "elsewhere" when a ceremony starts and gets the toast nudge instead of an in-view spotlight. */
export const BELL_CEREMONY_NUDGE_DISTANCE_METERS = 8;

export const WALL_OF_FAME_MAX_ENTRIES = 20;

// --- Simulated market cap ---
//
// A pure function of (seed, elapsedMs): checkpoints are sampled every
// `BELL_MARKET_CHECKPOINT_INTERVAL_MS` of simulated time and interpolated
// between, so the value is smooth and continuous but only ever needs O(cycle
// length / interval) work to compute from scratch — no stored time series,
// no drift between server and client, and no dependency on call order.

export const BELL_MARKET_BASE_USD = 10_000;
export const BELL_MARKET_CHECKPOINT_INTERVAL_MS = 15 * 60 * 1000;
/** Max fractional move (up or down) applied at each checkpoint. */
export const BELL_MARKET_STEP_VOLATILITY = 0.35;

/** Deterministic, seed+index-only hash — no shared mutable PRNG state, so checkpoints can be recomputed in any order. */
function checkpointRoll(seed: number, checkpointIndex: number): number {
  let h = (seed ^ Math.imul(checkpointIndex, 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

function marketCapAtCheckpoint(seed: number, checkpointIndex: number): number {
  let value = BELL_MARKET_BASE_USD;
  for (let i = 1; i <= checkpointIndex; i++) {
    const roll = checkpointRoll(seed, i);
    const delta = (roll * 2 - 1) * BELL_MARKET_STEP_VOLATILITY;
    value = Math.max(1, value * (1 + delta));
  }
  return value;
}

/** A launched token's simulated market cap `elapsedMs` after it launched. Pure and deterministic — safe to call identically on server and client. */
export function computeMarketCapUsd(seed: number, elapsedMs: number): number {
  const clampedElapsed = Math.max(0, elapsedMs);
  const checkpointIndex = Math.floor(clampedElapsed / BELL_MARKET_CHECKPOINT_INTERVAL_MS);
  const fraction = (clampedElapsed % BELL_MARKET_CHECKPOINT_INTERVAL_MS) / BELL_MARKET_CHECKPOINT_INTERVAL_MS;
  const start = marketCapAtCheckpoint(seed, checkpointIndex);
  const end = marketCapAtCheckpoint(seed, checkpointIndex + 1);
  return start + (end - start) * fraction;
}

export interface BellCycleSlot {
  slotIndex: number;
  /** The launcher's durable Privy identity, not their (ephemeral) session id — so a disconnect/reconnect can't be used to launch a second token this cycle. */
  ownerPlayerId: string | null;
  ownerDisplayName: string | null;
  tokenName: string | null;
  ticker: string | null;
  seed: number | null;
  launchedAtMs: number | null;
}

export interface BellCycleStateSnapshot {
  cycleEndsAtMs: number;
  slots: BellCycleSlot[];
}

export interface LaunchTokenRequestMessage {
  requestId: number;
  slotIndex: number;
  tokenName: string;
  ticker: string;
}

export interface LaunchTokenResultMessage {
  requestId: number;
  success: boolean;
  slot?: BellCycleSlot;
  message?: string;
}

export interface BellCycleHistoryEntry {
  cycleEndsAtMs: number;
  winnerDisplayName: string | null;
  tokenName: string | null;
  ticker: string | null;
  marketCapUsd: number | null;
}

export interface BellCycleHistoryRequestMessage {
  requestId: number;
}

export interface BellCycleHistoryResultMessage {
  requestId: number;
  entries: BellCycleHistoryEntry[];
}

/**
 * Broadcast once, the instant a cycle resolves — carries the full settled
 * result so every client can run the ceremony sequence locally without any
 * further round-trip (winner, plus every slot's final number so gold/red
 * flashes agree for everyone watching).
 */
export interface BellCeremonyMessage {
  cycleEndsAtMs: number;
  winner: {
    displayName: string;
    tokenName: string;
    ticker: string;
    marketCapUsd: number;
  } | null;
  finalSlots: Array<{
    slotIndex: number;
    ownerDisplayName: string | null;
    tokenName: string | null;
    ticker: string | null;
    marketCapUsd: number | null;
    isWinner: boolean;
  }>;
  nextCycleEndsAtMs: number;
}
