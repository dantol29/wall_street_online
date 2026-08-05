import { DISPLAY_NAME_MAX_LENGTH, DISPLAY_NAME_MIN_LENGTH } from "@multiplayer/shared";
import { escapeHtml } from "./chatValidation";

/** The client's own `getOrCreateGuestDisplayName` format — a chosen name is rejected if it happens to collide with this, so a real trader never reads as an anonymous guest. */
export const GUEST_DISPLAY_NAME_PATTERN = /^Trader-\d{4}$/;

export type DisplayNameValidationResult = { valid: true; text: string } | { valid: false; reason: string };

export function validateDisplayName(rawName: string): DisplayNameValidationResult {
  const trimmed = rawName.trim();

  if (trimmed.length < DISPLAY_NAME_MIN_LENGTH) {
    return { valid: false, reason: `Name must be at least ${DISPLAY_NAME_MIN_LENGTH} characters.` };
  }
  if (trimmed.length > DISPLAY_NAME_MAX_LENGTH) {
    return { valid: false, reason: `Name must be ${DISPLAY_NAME_MAX_LENGTH} characters or fewer.` };
  }
  if (GUEST_DISPLAY_NAME_PATTERN.test(trimmed)) {
    return { valid: false, reason: "That name looks like a guest tag — pick something else." };
  }

  return { valid: true, text: escapeHtml(trimmed) };
}
