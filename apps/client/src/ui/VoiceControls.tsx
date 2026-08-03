import type {
  VoiceAudioOutputDevice,
  VoiceConnectionState,
  VoiceParticipantState,
} from "../game/voice/VoiceClient";

export type VoiceTalkMode = "hold" | "toggle";

interface VoiceControlsProps {
  gameConnected: boolean;
  state: VoiceConnectionState;
  talking: boolean;
  microphoneLevel: number;
  message: string | null;
  participants: VoiceParticipantState[];
  talkMode: VoiceTalkMode;
  audioOutputs: VoiceAudioOutputDevice[];
  selectedAudioOutputId: string;
  audioOutputSelectionSupported: boolean;
  onEnable: () => void;
  onDisable: () => void;
  onTalkModeChange: (mode: VoiceTalkMode) => void;
  onAudioOutputChange: (deviceId: string) => void;
  onParticipantMuteChange: (sessionId: string, muted: boolean) => void;
}

const LABEL_BY_STATE: Record<VoiceConnectionState, string> = {
  disabled: "Enable voice",
  "requesting-permission": "Allow microphone",
  connecting: "Connecting voice",
  ready: "Voice ready",
  reconnecting: "Reconnecting voice",
  error: "Retry voice",
};

const DETAIL_BY_STATE: Record<VoiceConnectionState, string> = {
  disabled: "Microphone is off",
  "requesting-permission": "Use the browser prompt to allow microphone access",
  connecting: "Joining proximity voice chat",
  ready: "Nearby traders can hear you while you talk",
  reconnecting: "Voice was interrupted; your microphone is muted",
  error: "Voice is unavailable",
};

export function VoiceControls({
  gameConnected,
  state,
  talking,
  microphoneLevel,
  message,
  participants,
  talkMode,
  audioOutputs,
  selectedAudioOutputId,
  audioOutputSelectionSupported,
  onEnable,
  onDisable,
  onTalkModeChange,
  onAudioOutputChange,
  onParticipantMuteChange,
}: VoiceControlsProps) {
  const active = state === "ready" || state === "reconnecting";
  const busy = state === "requesting-permission" || state === "connecting";
  const label = gameConnected ? LABEL_BY_STATE[state] : "Voice offline";
  const detail = gameConnected
    ? DETAIL_BY_STATE[state]
    : "Reconnect to the game server to use voice";

  return (
    <section className={`voice-controls voice-controls--${state}`} aria-label="Voice chat">
      <div className="voice-controls__row">
        {active ? (
          <div
            className={talking ? "voice-controls__main voice-controls__main--talking" : "voice-controls__main"}
            role="status"
          >
            <span className="voice-controls__dot" aria-hidden="true" />
            <span>
              <strong>{talking ? "Talking" : label}</strong>
              <small>{talking ? "Your microphone is live" : detail}</small>
            </span>
          </div>
        ) : (
          <button
            type="button"
            className="voice-controls__main"
            onClick={onEnable}
            disabled={busy || !gameConnected}
          >
            <span className="voice-controls__dot" aria-hidden="true" />
            <span>
              <strong>{label}</strong>
              <small>{detail}</small>
            </span>
          </button>
        )}
        {active && (
          <button type="button" className="voice-controls__off" onClick={onDisable}>
            Off
          </button>
        )}
      </div>

      {active && (
        <div
          className={`voice-meter${talking ? " voice-meter--live" : ""}`}
          role="meter"
          aria-label="Microphone level"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(microphoneLevel * 100)}
        >
          <span style={{ transform: `scaleX(${Math.max(0.025, microphoneLevel)})` }} />
        </div>
      )}

      {message && (
        <div className="voice-controls__message" role={state === "error" ? "alert" : "status"}>
          {message}
        </div>
      )}

      {active && (
        <div className="voice-controls__settings">
          <div className="voice-talk-mode" role="group" aria-label="Talk mode">
            <button
              type="button"
              className={talkMode === "hold" ? "voice-talk-mode__active" : ""}
              aria-pressed={talkMode === "hold"}
              onClick={() => onTalkModeChange("hold")}
            >
              Hold V
            </button>
            <button
              type="button"
              className={talkMode === "toggle" ? "voice-talk-mode__active" : ""}
              aria-pressed={talkMode === "toggle"}
              onClick={() => onTalkModeChange("toggle")}
            >
              Toggle V
            </button>
          </div>

          {audioOutputSelectionSupported ? (
            audioOutputs.length > 0 && (
              <label className="voice-output">
                <span>Output</span>
                <select
                  value={selectedAudioOutputId}
                  onChange={(event) => onAudioOutputChange(event.target.value)}
                >
                  {audioOutputs.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label}
                    </option>
                  ))}
                </select>
              </label>
            )
          ) : (
            <div className="voice-controls__capability">Output follows system settings</div>
          )}
        </div>
      )}

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
          <div className="voice-controls__empty">No other voice players nearby</div>
        ))}
    </section>
  );
}
