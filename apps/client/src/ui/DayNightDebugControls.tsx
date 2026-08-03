import {
  formatWorldTime,
  useDayNightProfile,
  type WorldTimeAnchor,
} from "../game/scene/dayNight";

interface DayNightDebugControlsProps {
  worldTime: WorldTimeAnchor;
  overridePhase: number | null;
  onOverridePhaseChange: (phase: number | null) => void;
}

export function DayNightDebugControls({
  worldTime,
  overridePhase,
  onOverridePhaseChange,
}: DayNightDebugControlsProps) {
  const profile = useDayNightProfile(worldTime, overridePhase);
  const enabled =
    import.meta.env.VITE_SHOW_TIME_DEBUG === "true" ||
    new URLSearchParams(window.location.search).get("timeDebug") === "1";

  if (!enabled) return null;

  return (
    <section className="day-night-debug" aria-label="Day and night preview controls">
      <div className="day-night-debug__header">
        <span>New York</span>
        <strong>{formatWorldTime(profile.hour)}</strong>
      </div>
      <input
        aria-label="Preview time of day"
        type="range"
        min="0"
        max="1"
        step="0.001"
        value={overridePhase ?? profile.phase}
        onChange={(event) => onOverridePhaseChange(Number(event.currentTarget.value))}
      />
      <button type="button" disabled={overridePhase === null} onClick={() => onOverridePhaseChange(null)}>
        Live
      </button>
    </section>
  );
}
