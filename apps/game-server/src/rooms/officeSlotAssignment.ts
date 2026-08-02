import { OFFICE_SLOTS, type OfficeSlot } from "@multiplayer/shared";

export interface OfficeSlotAssignment {
  index: number;
  slot: OfficeSlot;
}

/**
 * Picks a free office slot for a newly wallet-linked player. Unlike
 * `assignSpawnPoint`, there is no "reuse an occupied slot" fallback — two
 * players sharing one physical alcove would be visually broken, not just
 * cosmetically overlapping like spawn points. Returns null once every slot
 * is taken; that player simply has no physical office this session (their
 * persisted content is unaffected — see officeRepository).
 * `randomFn` is injectable so tests can make the choice deterministic.
 */
export function assignOfficeSlot(
  occupiedIndices: ReadonlySet<number>,
  randomFn: () => number = Math.random,
): OfficeSlotAssignment | null {
  const freeIndices = OFFICE_SLOTS.map((_, index) => index).filter((index) => !occupiedIndices.has(index));
  if (freeIndices.length === 0) return null;

  const pickedIndex = freeIndices[Math.floor(randomFn() * freeIndices.length)];
  const slot = pickedIndex !== undefined ? OFFICE_SLOTS[pickedIndex] : undefined;

  if (pickedIndex === undefined || !slot) {
    throw new Error("unreachable: freeIndices must contain a valid OFFICE_SLOTS index");
  }

  return { index: pickedIndex, slot };
}
