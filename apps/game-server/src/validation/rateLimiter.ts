/**
 * Generic sliding-window rate limiter: tracks event timestamps per key and
 * evicts entries older than the window on every check. Extracted from the
 * chat feature's original `ChatRateLimiter` so office features (thesis
 * publishing, visitor-book signing) can reuse the same logic with their own
 * limits instead of duplicating it.
 */
export class SlidingWindowRateLimiter {
  private readonly timestampsByKey = new Map<string, number[]>();

  constructor(
    private readonly maxCount: number,
    private readonly windowMs: number,
  ) {}

  isAllowed(key: string, nowMs: number): boolean {
    const timestamps = this.timestampsByKey.get(key) ?? [];
    const recent = timestamps.filter((timestamp) => nowMs - timestamp < this.windowMs);

    if (recent.length >= this.maxCount) {
      this.timestampsByKey.set(key, recent);
      return false;
    }

    recent.push(nowMs);
    this.timestampsByKey.set(key, recent);
    return true;
  }

  clear(key: string): void {
    this.timestampsByKey.delete(key);
  }
}
