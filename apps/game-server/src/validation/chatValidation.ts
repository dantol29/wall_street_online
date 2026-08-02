import { CHAT_RATE_LIMIT_MAX_MESSAGES, CHAT_RATE_LIMIT_WINDOW_MS, MAX_CHAT_LENGTH } from "@multiplayer/shared";
import { SlidingWindowRateLimiter } from "./rateLimiter";

export type ChatValidationResult = { valid: true; text: string } | { valid: false; reason: string };

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function isWithinLengthLimit(text: string): boolean {
  return text.length > 0 && text.length <= MAX_CHAT_LENGTH;
}

/** Thin preset over the generic `SlidingWindowRateLimiter` for chat's specific limits. */
export class ChatRateLimiter {
  private readonly limiter = new SlidingWindowRateLimiter(CHAT_RATE_LIMIT_MAX_MESSAGES, CHAT_RATE_LIMIT_WINDOW_MS);

  isAllowed(senderId: string, nowMs: number): boolean {
    return this.limiter.isAllowed(senderId, nowMs);
  }

  clear(senderId: string): void {
    this.limiter.clear(senderId);
  }
}

export function validateChatText(rawText: string): ChatValidationResult {
  const trimmed = rawText.trim();

  if (trimmed.length === 0) {
    return { valid: false, reason: "empty message" };
  }

  if (!isWithinLengthLimit(trimmed)) {
    return { valid: false, reason: "message too long" };
  }

  return { valid: true, text: escapeHtml(trimmed) };
}
