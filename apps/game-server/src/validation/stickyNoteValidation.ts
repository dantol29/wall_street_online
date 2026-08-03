import { STICKY_NOTE_MAX_TEXT_LENGTH, isStickyWallPositionValid } from "@multiplayer/shared";
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

export type PositionValidationResult =
  | { valid: true; xFraction: number; yFraction: number }
  | { valid: false; reason: string };

export function validateStickyNotePosition(rawXFraction: unknown, rawYFraction: unknown): PositionValidationResult {
  const xFraction = Number(rawXFraction);
  const yFraction = Number(rawYFraction);
  if (!isStickyWallPositionValid(xFraction, yFraction)) {
    return { valid: false, reason: "invalid position" };
  }
  return { valid: true, xFraction, yFraction };
}
