import { STICKY_NOTE_MAX_TEXT_LENGTH } from "@multiplayer/shared";
import { escapeHtml } from "./chatValidation";

export type TextValidationResult = { valid: true; text: string } | { valid: false; reason: string };

export function validateStickyNoteText(rawText: string): TextValidationResult {
  const trimmed = rawText.trim();

  if (trimmed.length === 0) {
    return { valid: false, reason: "empty note" };
  }
  if (trimmed.length > STICKY_NOTE_MAX_TEXT_LENGTH) {
    return { valid: false, reason: "note too long" };
  }

  return { valid: true, text: escapeHtml(trimmed) };
}
