import { CHAT_RATE_LIMIT_MAX_MESSAGES, CHAT_RATE_LIMIT_WINDOW_MS, MAX_CHAT_LENGTH } from "@multiplayer/shared";

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

/**
 * Sliding-window rate limiter: tracks send timestamps per player and evicts
 * entries older than the window on every check.
 */
export class ChatRateLimiter {
  private readonly timestampsBySender = new Map<string, number[]>();

  isAllowed(senderId: string, nowMs: number): boolean {
    const timestamps = this.timestampsBySender.get(senderId) ?? [];
    const recent = timestamps.filter((timestamp) => nowMs - timestamp < CHAT_RATE_LIMIT_WINDOW_MS);

    if (recent.length >= CHAT_RATE_LIMIT_MAX_MESSAGES) {
      this.timestampsBySender.set(senderId, recent);
      return false;
    }

    recent.push(nowMs);
    this.timestampsBySender.set(senderId, recent);
    return true;
  }

  clear(senderId: string): void {
    this.timestampsBySender.delete(senderId);
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
