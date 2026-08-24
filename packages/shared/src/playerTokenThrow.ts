export interface PlayerTokenThrowRequestMessage {
  targetSessionId: string;
  ticker: string;
  logoUrl: string;
}

export interface PlayerTokenThrowEventMessage extends PlayerTokenThrowRequestMessage {
  triggeredBy: string;
}

// Starting values: social throws should work across a nearby aisle without
// becoming room-wide spam. Pass when a clearly aimed player can be hit while
// players outside the immediate social group cannot be targeted.
export const PLAYER_TOKEN_THROW_MAX_DISTANCE_METERS = 10;
export const PLAYER_TOKEN_THROW_COOLDOWN_MS = 450;

