import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { VoiceTalkMode } from "./VoiceControls";

interface JoystickVisual {
  pointerId: number;
  baseX: number;
  baseY: number;
  stickX: number;
  stickY: number;
}

const JOYSTICK_RADIUS = 50;

interface MobileGameControlsProps {
  actionLabel: string | null;
  showMovementHint: boolean;
  voiceReady: boolean;
  talking: boolean;
  microphoneLevel: number;
  talkMode: VoiceTalkMode;
  onAction: () => void;
  onTalkStart: () => void;
  onTalkEnd: () => void;
  onTalkToggle: () => void;
}

export function MobileGameControls({
  actionLabel,
  showMovementHint,
  voiceReady,
  talking,
  microphoneLevel,
  talkMode,
  onAction,
  onTalkStart,
  onTalkEnd,
  onTalkToggle,
}: MobileGameControlsProps) {
  const activeJoysticksRef = useRef<{ left: JoystickVisual | null; right: JoystickVisual | null }>({
    left: null,
    right: null,
  });
  const [joysticks, setJoysticks] = useState(activeJoysticksRef.current);

  useEffect(() => {
    const publish = (): void => {
      setJoysticks({ ...activeJoysticksRef.current });
    };
    const handlePointerDown = (event: globalThis.PointerEvent): void => {
      if (event.pointerType !== "touch" || !(event.target instanceof HTMLCanvasElement)) return;
      const side = event.clientX < window.innerWidth / 2 ? "left" : "right";
      activeJoysticksRef.current[side] = {
        pointerId: event.pointerId,
        baseX: event.clientX,
        baseY: event.clientY,
        stickX: event.clientX,
        stickY: event.clientY,
      };
      publish();
    };
    const handlePointerMove = (event: globalThis.PointerEvent): void => {
      const side = activeJoysticksRef.current.left?.pointerId === event.pointerId
        ? "left"
        : activeJoysticksRef.current.right?.pointerId === event.pointerId
          ? "right"
          : null;
      if (!side) return;
      const joystick = activeJoysticksRef.current[side];
      if (!joystick) return;
      const dx = event.clientX - joystick.baseX;
      const dy = event.clientY - joystick.baseY;
      const distance = Math.hypot(dx, dy);
      const scale = distance > JOYSTICK_RADIUS ? JOYSTICK_RADIUS / distance : 1;
      activeJoysticksRef.current[side] = {
        ...joystick,
        stickX: joystick.baseX + dx * scale,
        stickY: joystick.baseY + dy * scale,
      };
      publish();
    };
    const handlePointerUp = (event: globalThis.PointerEvent): void => {
      if (activeJoysticksRef.current.left?.pointerId === event.pointerId) {
        activeJoysticksRef.current.left = null;
      }
      if (activeJoysticksRef.current.right?.pointerId === event.pointerId) {
        activeJoysticksRef.current.right = null;
      }
      publish();
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, []);

  const beginTalking = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    event.stopPropagation();
    if (talkMode === "toggle") {
      onTalkToggle();
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    onTalkStart();
  };

  const endTalking = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    event.stopPropagation();
    if (talkMode === "toggle") return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onTalkEnd();
  };

  return (
    <div className="mobile-game-controls" aria-label="Mobile game controls">
      {showMovementHint && (
        <div className="mobile-gesture-hints" aria-hidden="true">
          <span>Drag to move</span>
          <span>Drag to look</span>
        </div>
      )}
      {(["left", "right"] as const).map((side) => {
        const joystick = joysticks[side];
        if (!joystick) return null;
        return (
          <div
            key={side}
            className="mobile-joystick"
            style={{ left: joystick.baseX, top: joystick.baseY }}
            aria-hidden="true"
          >
            <span
              className="mobile-joystick__stick"
              style={{
                transform: `translate(${joystick.stickX - joystick.baseX}px, ${joystick.stickY - joystick.baseY}px)`,
              }}
            />
          </div>
        );
      })}
      <div className="mobile-game-controls__actions">
        {voiceReady && (
          <button
            type="button"
            className={`mobile-game-button mobile-game-button--voice${talking ? " mobile-game-button--active" : ""}`}
            aria-label={talkMode === "hold" ? "Hold to talk" : talking ? "Turn microphone off" : "Turn microphone on"}
            aria-pressed={talkMode === "toggle" ? talking : undefined}
            onPointerDown={beginTalking}
            onPointerUp={endTalking}
            onPointerCancel={endTalking}
            onLostPointerCapture={() => {
              if (talkMode === "hold") onTalkEnd();
            }}
          >
            <span className="mobile-game-button__voice-icon" aria-hidden="true">◉</span>
            <span className="mobile-game-button__voice-label">
              {talking ? "Talking" : talkMode === "hold" ? "Hold to talk" : "Tap to talk"}
            </span>
            <span className="mobile-voice-meter" aria-hidden="true">
              <i style={{ transform: `scaleX(${Math.max(0.025, microphoneLevel)})` }} />
            </span>
          </button>
        )}
        {actionLabel && (
          <button
            type="button"
            className="mobile-game-button mobile-game-button--action"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onAction();
            }}
          >
            <span className="mobile-game-button__key" aria-hidden="true">E</span>
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
