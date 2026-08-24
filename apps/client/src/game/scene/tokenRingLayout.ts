export {
  TOKEN_RING_CONFIGS,
  TOKEN_STAND_LAYOUT,
  createTokenRingLayout,
  type TokenRingConfig,
  type TokenStandAddress,
} from "@multiplayer/shared";
import { TOKEN_STAND_LAYOUT } from "@multiplayer/shared";
export const FIRST_TOKEN_STAND = TOKEN_STAND_LAYOUT.find((slot) => slot.address === "R3-022") ?? TOKEN_STAND_LAYOUT[51];
export const NEXT_TOKEN_STAND = TOKEN_STAND_LAYOUT.find((slot) => slot.address === "R1-005") ?? TOKEN_STAND_LAYOUT[4];
