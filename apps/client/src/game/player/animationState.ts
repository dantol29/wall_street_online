import type { AnimationState } from "@multiplayer/shared";

const IDLE_SPEED_THRESHOLD = 0.1;

/**
 * Per the brief's animation rules: idle below a tiny speed threshold,
 * otherwise walk or run depending on whether the run modifier (Shift) is
 * held. `forwardAmount`/`rightAmount` are the movement velocity's components
 * along the camera's own forward/right axes (not world axes) — i.e. how much
 * of the player's motion is "forward/back" vs "strafe" from their own point
 * of view. The character model has dedicated left/right/backward clips (see
 * `RemotePlayer.tsx`), so whichever axis dominates the movement, and its
 * sign, picks forward vs. back vs. left vs. right.
 */
export function selectAnimationState(
  speed: number,
  isRunning: boolean,
  forwardAmount: number = 1,
  rightAmount: number = 0
): AnimationState {
  if (speed < IDLE_SPEED_THRESHOLD) return "idle";

  const base = isRunning ? "run" : "walk";
  if (Math.abs(rightAmount) > Math.abs(forwardAmount)) {
    return rightAmount > 0 ? `${base}_right` : `${base}_left`;
  }
  return forwardAmount < 0 ? `${base}_back` : base;
}
