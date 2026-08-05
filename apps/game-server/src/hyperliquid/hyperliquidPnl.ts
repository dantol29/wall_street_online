const HYPERLIQUID_INFO_URL = "https://api.hyperliquid.xyz/info";
const REQUEST_TIMEOUT_MS = 8000;
/**
 * The non-"perp"-prefixed periods ("day"/"week"/"month"/"allTime") are the
 * combined Perps + Spot + Vaults view — the same default HyperLiquid's own
 * portfolio page shows before toggling to the perps-only ("perpAllTime" etc.)
 * variant, which is what we want here rather than perps-only.
 */
const ALL_TIME_PERIOD = "allTime";

/** Each entry is `[timestampMs, cumulativeValueString]`. */
type PortfolioHistoryPoint = [number, string];

interface PortfolioPeriodData {
  pnlHistory?: PortfolioHistoryPoint[];
}

/** The real response is an array of `[periodName, data]` tuples — periods include "day", "week", "month", "allTime", and their "perp"-prefixed variants. */
type PortfolioResponse = Array<[string, PortfolioPeriodData]>;

/**
 * All-time running PnL (realized + unrealized, across Perps + Spot +
 * Vaults — see ALL_TIME_PERIOD) via the public (no API key) `portfolio` info
 * endpoint. Deliberately *not* `clearinghouseState`'s per-position
 * `unrealizedPnl` sum — that only covers currently-open positions, so it
 * reads as 0 the moment someone has no open position, even if they're down
 * overall from trades they've already closed. "day"/"week"/"month" have the
 * same blind spot at a shorter timescale: they read 0 for anyone who simply
 * hasn't traded within that specific shorter window, even with a real
 * all-time track record — allTime is the one period that's never just "no
 * activity yet today."
 * Returns null on any network/parse failure so a single bad request doesn't
 * take down the whole broadcast cycle (see SocialRoom's poll loop).
 */
export async function fetchHyperliquidAllTimePnl(address: string): Promise<number | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(HYPERLIQUID_INFO_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "portfolio", user: address }),
      signal: controller.signal,
    });
    if (!response.ok) return null;

    const data = (await response.json()) as PortfolioResponse;
    if (!Array.isArray(data)) return null;

    const allTimeEntry = data.find(([period]) => period === ALL_TIME_PERIOD);
    const history = allTimeEntry?.[1]?.pnlHistory;
    if (!history || history.length === 0) return null;

    const latestPoint = history[history.length - 1];
    const value = Number(latestPoint?.[1]);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
