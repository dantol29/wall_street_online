export type TokenTradeSide = "buy" | "sell";

export interface TokenTradeThrowRequestMessage {
  standAddress: string;
  side: TokenTradeSide;
}

export interface TokenTradeThrowEventMessage extends TokenTradeThrowRequestMessage {
  triggeredBy: string;
}

// Starting values: accept at most four physical throws per second and only
// from interaction range. Pass when intentional taps survive normal latency
// while held-key/macro spam cannot flood observers; tighten on visible spam.
export const TOKEN_TRADE_THROW_COOLDOWN_MS = 250;
export const TOKEN_TRADE_THROW_INTERACTION_DISTANCE_METERS = 2.5;
