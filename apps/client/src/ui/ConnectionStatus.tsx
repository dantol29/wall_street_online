import type { ConnectionState } from "../game/multiplayer/messages";

const LABEL_BY_STATE: Record<ConnectionState, string> = {
  connecting: "Connecting",
  connected: "Connected",
  reconnecting: "Reconnecting",
  disconnected: "Disconnected",
};

export function ConnectionStatus({ state }: { state: ConnectionState }) {
  return <div className={`connection-status connection-status--${state}`}>{LABEL_BY_STATE[state]}</div>;
}
