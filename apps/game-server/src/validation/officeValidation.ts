import {
  THESIS_MAX_LENGTH,
  VISITOR_BOOK_MESSAGE_MAX_LENGTH,
  WATCHLIST_MAX_ITEMS,
  WATCHLIST_NOTE_MAX_LENGTH,
  WATCHLIST_SYMBOL_MAX_LENGTH,
  type OfficeWatchlistItem,
} from "@multiplayer/shared";
import { escapeHtml } from "./chatValidation";

export type TextValidationResult = { valid: true; text: string } | { valid: false; reason: string };

export function validateThesisBody(rawBody: string): TextValidationResult {
  const trimmed = rawBody.trim();

  if (trimmed.length === 0) {
    return { valid: false, reason: "empty thesis" };
  }
  if (trimmed.length > THESIS_MAX_LENGTH) {
    return { valid: false, reason: "thesis too long" };
  }

  return { valid: true, text: escapeHtml(trimmed) };
}

export function validateVisitorBookMessage(rawMessage: string): TextValidationResult {
  const trimmed = rawMessage.trim();

  if (trimmed.length === 0) {
    return { valid: false, reason: "empty message" };
  }
  if (trimmed.length > VISITOR_BOOK_MESSAGE_MAX_LENGTH) {
    return { valid: false, reason: "message too long" };
  }

  return { valid: true, text: escapeHtml(trimmed) };
}

export type WatchlistValidationResult =
  | { valid: true; items: OfficeWatchlistItem[] }
  | { valid: false; reason: string };

export function validateWatchlistItems(rawItems: unknown): WatchlistValidationResult {
  if (!Array.isArray(rawItems)) {
    return { valid: false, reason: "invalid watchlist" };
  }
  if (rawItems.length > WATCHLIST_MAX_ITEMS) {
    return { valid: false, reason: "too many watchlist items" };
  }

  const items: OfficeWatchlistItem[] = [];
  for (const rawItem of rawItems) {
    if (typeof (rawItem as { symbol?: unknown })?.symbol !== "string") {
      return { valid: false, reason: "invalid watchlist item" };
    }

    const symbol = (rawItem as { symbol: string }).symbol.trim().toUpperCase().slice(0, WATCHLIST_SYMBOL_MAX_LENGTH);
    if (symbol.length === 0) {
      return { valid: false, reason: "invalid watchlist item" };
    }

    const rawNote = (rawItem as { note?: unknown }).note;
    const note = typeof rawNote === "string" ? escapeHtml(rawNote.trim().slice(0, WATCHLIST_NOTE_MAX_LENGTH)) : "";

    items.push({ symbol, note });
  }

  return { valid: true, items };
}
