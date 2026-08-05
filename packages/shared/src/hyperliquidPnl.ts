/**
 * Real HyperLiquid all-time PnL (Perps + Spot + Vaults combined, realized +
 * unrealized) for whichever connected players have linked a wallet. See the
 * game-server's hyperliquidPnl.ts for the actual fetch against HyperLiquid's
 * public (no-auth) info endpoint, keyed by that same wallet address.
 * Broadcast periodically, same shape as worldTime.ts.
 */
export const HYPERLIQUID_PNL_POLL_INTERVAL_MS = 30_000;

export interface PlayerPnlEntry {
  sessionId: string;
  /** All-time cumulative PnL in USD, across Perps + Spot + Vaults (realized + unrealized). */
  pnlUsd: number;
}

export interface PnlUpdateMessage {
  entries: PlayerPnlEntry[];
}
