export interface TokenRingConfig {
  ring: number;
  radius: number;
  capacity: number;
}

export interface TokenStandAddress {
  globalIndex: number;
  ring: number;
  stand: number;
  address: string;
  x: number;
  z: number;
  rotationY: number;
}

export interface TokenSoundRequestMessage {
  standAddress: string;
  ticker: string;
  soundUrl?: string;
}

export interface TokenSoundEventMessage extends TokenSoundRequestMessage {
  triggeredBy: string;
}

export const TOKEN_RING_CONFIGS: readonly TokenRingConfig[] = [
  { ring: 1, radius: 8, capacity: 12 },
  { ring: 2, radius: 11, capacity: 18 },
  { ring: 3, radius: 14, capacity: 24 },
  { ring: 4, radius: 17, capacity: 30 },
  { ring: 5, radius: 20, capacity: 36 },
];

const RADIAL_AISLE_WIDTH = 3.6;

export function createTokenRingLayout(): TokenStandAddress[] {
  let globalIndex = 0;
  return TOKEN_RING_CONFIGS.flatMap(({ ring, radius, capacity }) => {
    const aisleAngle = 2 * Math.asin(Math.min(0.9, RADIAL_AISLE_WIDTH / (2 * radius)));
    const usableSectorAngle = Math.PI / 2 - aisleAngle;
    return Array.from({ length: capacity }, (_, standIndex) => {
      const sector = standIndex % 4;
      const positionInSector = Math.floor(standIndex / 4);
      const sectorCount = Math.floor((capacity + 3 - sector) / 4);
      const angle = sector * Math.PI / 2 + aisleAngle / 2 + ((positionInSector + 1) / (sectorCount + 1)) * usableSectorAngle;
      return {
        globalIndex: globalIndex++,
        ring,
        stand: standIndex + 1,
        address: `R${ring}-${String(standIndex + 1).padStart(3, "0")}`,
        x: Math.sin(angle) * radius,
        z: Math.cos(angle) * radius,
        rotationY: (angle * 180) / Math.PI + 180,
      };
    });
  });
}

export const TOKEN_STAND_LAYOUT = createTokenRingLayout().slice(0, 84);

// Starting values: one shared sound per second and a 10m social listening radius.
// Pass when players across a nearby ring can trigger a token without enabling
// room-wide remote playback; reduce the radius if sources become ambiguous.
export const TOKEN_SOUND_COOLDOWN_MS = 1_000;
export const TOKEN_SOUND_SERVER_INTERACTION_DISTANCE_METERS = 10;
