/** Test setting: one complete in-game day lasts five real minutes. */
export const WORLD_DAY_DURATION_MS = 5 * 60 * 1000;
/** New server processes begin in clear mid-morning light. */
export const WORLD_START_HOUR = 10;
/** Periodic correction keeps long-running clients and reconnects aligned. */
export const WORLD_TIME_SYNC_INTERVAL_MS = 30_000;

export interface WorldTimeSyncMessage {
  /** Normalized time of day at `serverTimeMs`; 0 = midnight, 0.5 = noon. */
  phase: number;
  dayDurationMs: number;
  serverTimeMs: number;
}

export function normalizeWorldPhase(phase: number): number {
  return ((phase % 1) + 1) % 1;
}

export function worldPhaseAtTime(epochMs: number, nowMs: number, dayDurationMs = WORLD_DAY_DURATION_MS): number {
  return normalizeWorldPhase((nowMs - epochMs) / dayDurationMs);
}
