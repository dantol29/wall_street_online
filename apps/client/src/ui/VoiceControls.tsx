import type {
  VoiceConnectionState,
  VoiceParticipantState,
} from "../game/voice/VoiceClient";

interface VoiceControlsProps {
  state: VoiceConnectionState;
  talking: boolean;
  message: string | null;
  participants: VoiceParticipantState[];
  onEnable: () => void;
  onDisable: () => void;
  onParticipantMuteChange: (sessionId: string, muted: boolean) => void;
}

const LABEL_BY_STATE: Record<VoiceConnectionState, string> = {
  disabled: "Enable Voice",
  "requesting-permission": "Requesting microphone…",
  connecting: "Connecting voice…",
  ready: "Voice ready · Hold V",
  reconnecting: "Reconnecting voice…",
  error: "Retry Voice",
};

export function VoiceControls({
  state,
  talking,
  message,
  participants,
  onEnable,
  onDisable,
  onParticipantMuteChange,
}: VoiceControlsProps) {
  const active = state === "ready" || state === "reconnecting";
  const busy = state === "requesting-permission" || state === "connecting";

  return (
    <section className={`voice-controls voice-controls--${state}`} aria-label="Voice chat">
      <div className="voice-controls__row">
        {active ? (
          <div
            className={talking ? "voice-controls__main voice-controls__main--talking" : "voice-controls__main"}
            role="status"
          >
            <span className="voice-controls__dot" aria-hidden="true" />
            {talking ? "Talking" : LABEL_BY_STATE[state]}
          </div>
        ) : (
          <button type="button" className="voice-controls__main" onClick={onEnable} disabled={busy}>
            <span className="voice-controls__dot" aria-hidden="true" />
            {LABEL_BY_STATE[state]}
          </button>
        )}
        {active && (
          <button type="button" className="voice-controls__off" onClick={onDisable}>
            Off
          </button>
        )}
      </div>
      {message && <div className="voice-controls__message">{message}</div>}
      {active &&
        (participants.length > 0 ? (
          <div className="voice-controls__participants">
            {participants.map((participant) => (
              <button
                type="button"
                key={participant.sessionId}
                className={participant.speaking ? "voice-player voice-player--speaking" : "voice-player"}
                onClick={() => onParticipantMuteChange(participant.sessionId, !participant.locallyMuted)}
                title={participant.locallyMuted ? "Unmute this player" : "Mute this player"}
              >
                <span>{participant.displayName}</span>
                <span>{participant.locallyMuted ? "Muted" : participant.speaking ? "Speaking" : "Connected"}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="voice-controls__empty">No other voice players connected</div>
        ))}
    </section>
  );
}
