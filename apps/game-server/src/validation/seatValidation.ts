import {
  DESK_INTERACTION_DISTANCE_METERS,
  DESK_STATIONS,
  type DeskStation,
} from "@multiplayer/shared";

export function findDeskStation(deskId: string): DeskStation | null {
  return DESK_STATIONS.find((desk) => desk.id === deskId) ?? null;
}

export function isWithinDeskInteractionRange(
  player: { x: number; z: number },
  desk: DeskStation,
): boolean {
  return Math.hypot(player.x - desk.seatX, player.z - desk.seatZ) <= DESK_INTERACTION_DISTANCE_METERS;
}
