import type { AnimationState } from "@multiplayer/shared";

const IDLE_SPEED_THRESHOLD = 0.1;

/**
 * Per the brief's animation rules: idle below a tiny speed threshold, otherwise
 * walk or run depending on whether the run modifier (Shift) is held.
 */
export function selectAnimationState(speed: number, isRunning: boolean): AnimationState {
  if (speed < IDLE_SPEED_THRESHOLD) return "idle";
  return isRunning ? "run" : "walk";
}
