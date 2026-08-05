import { TOKEN_NAME_MAX_LENGTH, TOKEN_NAME_MIN_LENGTH, TOKEN_TICKER_MAX_LENGTH, TOKEN_TICKER_MIN_LENGTH } from "@multiplayer/shared";
import { escapeHtml } from "./chatValidation";

const TICKER_PATTERN = /^[A-Za-z0-9]+$/;

export type TokenLaunchValidationResult =
  | { valid: true; tokenName: string; ticker: string }
  | { valid: false; reason: string };

export function validateTokenLaunch(rawTokenName: string, rawTicker: string): TokenLaunchValidationResult {
  const tokenName = rawTokenName.trim();
  const ticker = rawTicker.trim().toUpperCase();

  if (tokenName.length < TOKEN_NAME_MIN_LENGTH) {
    return { valid: false, reason: `Token name must be at least ${TOKEN_NAME_MIN_LENGTH} characters.` };
  }
  if (tokenName.length > TOKEN_NAME_MAX_LENGTH) {
    return { valid: false, reason: `Token name must be ${TOKEN_NAME_MAX_LENGTH} characters or fewer.` };
  }
  if (ticker.length < TOKEN_TICKER_MIN_LENGTH) {
    return { valid: false, reason: `Ticker must be at least ${TOKEN_TICKER_MIN_LENGTH} characters.` };
  }
  if (ticker.length > TOKEN_TICKER_MAX_LENGTH) {
    return { valid: false, reason: `Ticker must be ${TOKEN_TICKER_MAX_LENGTH} characters or fewer.` };
  }
  if (!TICKER_PATTERN.test(ticker)) {
    return { valid: false, reason: "Ticker can only contain letters and numbers." };
  }

  return { valid: true, tokenName: escapeHtml(tokenName), ticker: escapeHtml(ticker) };
}
