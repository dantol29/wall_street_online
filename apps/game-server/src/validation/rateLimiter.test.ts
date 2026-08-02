import { describe, expect, it } from "vitest";
import { SlidingWindowRateLimiter } from "./rateLimiter";

describe("SlidingWindowRateLimiter", () => {
  it("allows up to maxCount events within the window", () => {
    const limiter = new SlidingWindowRateLimiter(3, 5000);
    expect(limiter.isAllowed("p1", 0)).toBe(true);
    expect(limiter.isAllowed("p1", 100)).toBe(true);
    expect(limiter.isAllowed("p1", 200)).toBe(true);
  });

  it("blocks the event after maxCount inside the window", () => {
    const limiter = new SlidingWindowRateLimiter(3, 5000);
    limiter.isAllowed("p1", 0);
    limiter.isAllowed("p1", 100);
    limiter.isAllowed("p1", 200);
    expect(limiter.isAllowed("p1", 300)).toBe(false);
  });

  it("allows a new event once the oldest ages out of the window", () => {
    const limiter = new SlidingWindowRateLimiter(3, 5000);
    limiter.isAllowed("p1", 0);
    limiter.isAllowed("p1", 100);
    limiter.isAllowed("p1", 200);
    expect(limiter.isAllowed("p1", 5001)).toBe(true);
  });

  it("tracks each key independently", () => {
    const limiter = new SlidingWindowRateLimiter(3, 5000);
    limiter.isAllowed("p1", 0);
    limiter.isAllowed("p1", 100);
    limiter.isAllowed("p1", 200);
    expect(limiter.isAllowed("p2", 250)).toBe(true);
  });

  it("clear() forgets a key's history", () => {
    const limiter = new SlidingWindowRateLimiter(1, 5000);
    limiter.isAllowed("p1", 0);
    expect(limiter.isAllowed("p1", 100)).toBe(false);
    limiter.clear("p1");
    expect(limiter.isAllowed("p1", 200)).toBe(true);
  });
});
