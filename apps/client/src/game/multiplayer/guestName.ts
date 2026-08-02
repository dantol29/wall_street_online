const DISPLAY_NAME_STORAGE_KEY = "guestDisplayName";

export function generateGuestDisplayName(): string {
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `Trader-${suffix}`;
}

/** Restores a guest's name from browser storage, or creates and persists a new one. */
export function getOrCreateGuestDisplayName(storage: Storage): string {
  const existing = storage.getItem(DISPLAY_NAME_STORAGE_KEY);
  if (existing) return existing;

  const name = generateGuestDisplayName();
  storage.setItem(DISPLAY_NAME_STORAGE_KEY, name);
  return name;
}
