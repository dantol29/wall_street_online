import type { AnimationState } from "@multiplayer/shared";
import type { RemoteTransform } from "../multiplayer/interpolation";

/** Per-remote-player state shared between the 3D avatar (RemotePlayer) and its in-world name/PnL billboard (PlayerLabelBillboard). */
export interface RemotePlayerRecord {
  transform: RemoteTransform;
  displayName: string;
  animation: AnimationState;
  seatedDeskId: string | null;
  officeSlotId: string | null;
  /** Real HyperLiquid unrealized PnL in USD, if this player has linked a wallet — null until the first server broadcast arrives (see pnl_update). */
  pnlUsd: number | null;
}
