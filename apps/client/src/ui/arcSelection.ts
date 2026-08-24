export interface ArcSlot<T> {
  item: T;
  index: number;
  offset: number;
}

/** Wraps forward/backward through a list of `itemCount` items, e.g. arrow-key navigation on the token arc. */
export function rotateArcIndex(currentIndex: number, itemCount: number, direction: 1 | -1): number {
  if (itemCount <= 0) return 0;
  return (currentIndex + direction + itemCount) % itemCount;
}

/** Returns up to `2*radius+1` items centered on `activeIndex`, wrapping around the list ends, without repeating an item when the list is shorter than the window. */
export function getVisibleArcSlots<T>(items: T[], activeIndex: number, radius: number): ArcSlot<T>[] {
  if (items.length === 0) return [];

  const effectiveRadius = Math.min(radius, Math.floor((items.length - 1) / 2));
  const slots: ArcSlot<T>[] = [];
  for (let rawOffset = -effectiveRadius; rawOffset <= effectiveRadius; rawOffset++) {
    const offset = rawOffset === 0 ? 0 : rawOffset; // normalize -0 to 0 for clean equality/display
    const index = (activeIndex + offset + items.length) % items.length;
    slots.push({ item: items[index], index, offset });
  }
  return slots;
}
