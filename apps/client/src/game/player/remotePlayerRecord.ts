import type { AnimationState } from "@multiplayer/shared";
import type { RemoteTransform } from "../multiplayer/interpolation";

/** Per-remote-player state shared between the 3D avatar (RemotePlayer) and the DOM name label (NameLabelsOverlay). */
export interface RemotePlayerRecord {
  transform: RemoteTransform;
  displayName: string;
  animation: AnimationState;
  seatedDeskId: string | null;
}
