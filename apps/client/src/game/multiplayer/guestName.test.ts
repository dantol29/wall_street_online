import { describe, expect, it, beforeEach } from "vitest";
import { generateGuestDisplayName, getOrCreateGuestDisplayName } from "./guestName";

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string) {
    return this.store.get(key) ?? null;
  }
  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
}

describe("generateGuestDisplayName", () => {
  it("matches the Trader-#### shape", () => {
    expect(generateGuestDisplayName()).toMatch(/^Trader-\d{4}$/);
  });
});

describe("getOrCreateGuestDisplayName", () => {
  let storage: Storage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it("creates and persists a name on first call", () => {
    const name = getOrCreateGuestDisplayName(storage);
    expect(name).toMatch(/^Trader-\d{4}$/);
    expect(storage.getItem("guestDisplayName")).toBe(name);
  });

  it("returns the same name on subsequent calls", () => {
    const first = getOrCreateGuestDisplayName(storage);
    const second = getOrCreateGuestDisplayName(storage);
    expect(second).toBe(first);
  });
});
