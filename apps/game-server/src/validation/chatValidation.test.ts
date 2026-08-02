import { describe, expect, it } from "vitest";
import { ChatRateLimiter, escapeHtml, isWithinLengthLimit, validateChatText } from "./chatValidation";

describe("validateChatText", () => {
  it("accepts a normal message and HTML-escapes it", () => {
    const result = validateChatText("<b>BTC is going to zero</b>");
    expect(result).toEqual({ valid: true, text: "&lt;b&gt;BTC is going to zero&lt;/b&gt;" });
  });

  it("trims surrounding whitespace before validating", () => {
    const result = validateChatText("   hello   ");
    expect(result).toEqual({ valid: true, text: "hello" });
  });

  it("rejects an empty message", () => {
    expect(validateChatText("")).toEqual({ valid: false, reason: "empty message" });
  });

  it("rejects a message that is only whitespace", () => {
    expect(validateChatText("     ")).toEqual({ valid: false, reason: "empty message" });
  });

  it("rejects a message over 200 characters", () => {
    const longText = "a".repeat(201);
    expect(validateChatText(longText)).toEqual({ valid: false, reason: "message too long" });
  });

  it("accepts a message exactly at the 200 character limit", () => {
    const exactText = "a".repeat(200);
    const result = validateChatText(exactText);
    expect(result.valid).toBe(true);
  });
});

describe("isWithinLengthLimit", () => {
  it("rejects an empty string", () => {
    expect(isWithinLengthLimit("")).toBe(false);
  });
});

describe("escapeHtml", () => {
  it("escapes all five reserved HTML characters", () => {
    expect(escapeHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;");
  });
});

describe("ChatRateLimiter", () => {
  it("allows up to 3 messages within the 5 second window", () => {
    const limiter = new ChatRateLimiter();
    expect(limiter.isAllowed("p1", 0)).toBe(true);
    expect(limiter.isAllowed("p1", 100)).toBe(true);
    expect(limiter.isAllowed("p1", 200)).toBe(true);
  });

  it("blocks the 4th message inside the window", () => {
    const limiter = new ChatRateLimiter();
    limiter.isAllowed("p1", 0);
    limiter.isAllowed("p1", 100);
    limiter.isAllowed("p1", 200);
    expect(limiter.isAllowed("p1", 300)).toBe(false);
  });

  it("allows a new message once the oldest one ages out of the window", () => {
    const limiter = new ChatRateLimiter();
    limiter.isAllowed("p1", 0);
    limiter.isAllowed("p1", 100);
    limiter.isAllowed("p1", 200);
    expect(limiter.isAllowed("p1", 5001)).toBe(true);
  });

  it("tracks each sender independently", () => {
    const limiter = new ChatRateLimiter();
    limiter.isAllowed("p1", 0);
    limiter.isAllowed("p1", 100);
    limiter.isAllowed("p1", 200);
    expect(limiter.isAllowed("p2", 250)).toBe(true);
  });
});
