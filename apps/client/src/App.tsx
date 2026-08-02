import { useEffect, useRef, useState } from "react";
import { Application } from "@playcanvas/react";
import { FILLMODE_FILL_WINDOW, type Entity as PcEntity } from "playcanvas";
import { MOVEMENT_SEND_RATE_HZ, type ChatMessage } from "@multiplayer/shared";
import { selectAnimationState } from "./game/player/animationState";
import { MultiplayerClient } from "./game/multiplayer/MultiplayerClient";
import { getOrCreateGuestDisplayName } from "./game/multiplayer/guestName";
import type { ConnectionState } from "./game/multiplayer/messages";
import { EnterGameOverlay } from "./ui/EnterGameOverlay";
import { ConnectionStatus } from "./ui/ConnectionStatus";
import { Chat } from "./ui/Chat";
import { ErrorOverlay } from "./ui/ErrorOverlay";
import { ApplicationErrorBoundary } from "./ui/ApplicationErrorBoundary";
import "./App.css";
import Scene, { type SceneHandle } from "./Scene";

const SERVER_URL = import.meta.env.VITE_GAME_SERVER_URL || "ws://localhost:2567";
const MAX_STORED_MESSAGES = 20;
const LOCAL_CAMERA_ENTITY_NAME = "local-camera";
const FIRST_PERSON_CONTROLLER_SCRIPT_NAME = "firstPersonController";

function App() {
  const playerEntityRef = useRef<PcEntity | null>(null);
  const sceneRef = useRef<SceneHandle | null>(null);
  const clientRef = useRef<MultiplayerClient | null>(null);
  const attemptConnectRef = useRef<() => void>(() => {});
  const isRunningRef = useRef(false);
  const nameLabelsContainerRef = useRef<HTMLDivElement | null>(null);
  const [entered, setEntered] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [connectErrorMessage, setConnectErrorMessage] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMoved, setHasMoved] = useState(false);

  useEffect(() => {
    const client = new MultiplayerClient(SERVER_URL, {
      onConnectionStateChange: setConnectionState,
      onPlayerAdd: (snapshot) => sceneRef.current?.addRemotePlayer(snapshot),
      onPlayerUpdate: (snapshot) => sceneRef.current?.updateRemotePlayer(snapshot),
      onPlayerRemove: (sessionId) => sceneRef.current?.removeRemotePlayer(sessionId),
      onChatMessage: (message) => setMessages((prev) => [...prev, message].slice(-MAX_STORED_MESSAGES)),
      onLocalSpawn: (spawn) => playerEntityRef.current?.rigidbody?.teleport(spawn.x, spawn.y, spawn.z),
    });
    clientRef.current = client;

    const attemptConnect = (): void => {
      setConnectErrorMessage(null);
      const displayName = getOrCreateGuestDisplayName(window.localStorage);
      client.connect(displayName).catch((error: Error) => {
        console.error("[App] failed to connect:", error);
        setConnectErrorMessage(error.message || "Unable to connect to the multiplayer server.");
      });
    };
    attemptConnectRef.current = attemptConnect;
    attemptConnect();

    // The ready-made controller tracks its own key state internally; we only need
    // Shift here to label outgoing movement as "run" vs "walk" for other clients.
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Shift") isRunningRef.current = true;
    };
    const handleKeyUp = (event: KeyboardEvent): void => {
      if (event.key === "Shift") isRunningRef.current = false;
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    const sendIntervalMs = 1000 / MOVEMENT_SEND_RATE_HZ;
    const sendTimer = window.setInterval(() => {
      const player = playerEntityRef.current;
      if (!player?.rigidbody) return;

      const position = player.getPosition();
      const cameraEntity = player.findByName(LOCAL_CAMERA_ENTITY_NAME);
      const rotationY = cameraEntity ? (cameraEntity.getLocalEulerAngles().y * Math.PI) / 180 : 0;
      const velocity = player.rigidbody.linearVelocity;
      const horizontalSpeed = Math.hypot(velocity.x, velocity.z);

      if (horizontalSpeed > 0) setHasMoved(true);

      client.sendMovement({
        x: position.x,
        y: position.y,
        z: position.z,
        rotationY,
        animation: selectAnimationState(horizontalSpeed, isRunningRef.current),
      });
    }, sendIntervalMs);

    return () => {
      window.clearInterval(sendTimer);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      client.disconnect();
      clientRef.current = null;
    };
  }, []);

  const handleEnter = (): void => {
    // Just dismiss the overlay. The ready-made controller requests pointer lock
    // itself the moment the user clicks the now-visible canvas underneath — a
    // second manual request here raced against that one and neither ever won.
    setEntered(true);
  };

  const handleChatSend = (text: string): void => {
    clientRef.current?.sendChat(text);
  };

  const handleChatFocusChange = (focused: boolean): void => {
    const controller = playerEntityRef.current?.script?.get(FIRST_PERSON_CONTROLLER_SCRIPT_NAME);
    if (controller) controller.enabled = !focused;
  };

  const handleRetry = (): void => {
    attemptConnectRef.current();
  };

  const showErrorOverlay =
    connectErrorMessage ?? (connectionState === "disconnected" ? "Lost connection to the multiplayer server." : null);

  return (
    <div className="full-bleed">
      <ApplicationErrorBoundary>
        <Application className="playcanvas-app" usePhysics fillMode={FILLMODE_FILL_WINDOW}>
          <Scene playerEntityRef={playerEntityRef} ref={sceneRef} nameLabelsContainerRef={nameLabelsContainerRef} />
        </Application>
      </ApplicationErrorBoundary>
      <div className="trading-floor-overlay" aria-hidden="true">
        <div className="trading-floor-overlay__glow" />
      </div>
      <div className="name-labels-container" ref={nameLabelsContainerRef} />
      <ConnectionStatus state={connectionState} />
      <Chat messages={messages} onSend={handleChatSend} onFocusChange={handleChatFocusChange} />
      {entered && <div className="crosshair" />}
      {entered && !hasMoved && <div className="wasd-hint">WASD to move</div>}
      <EnterGameOverlay visible={!entered && !showErrorOverlay} onEnter={handleEnter} />
      <ErrorOverlay message={showErrorOverlay} onRetry={handleRetry} />
    </div>
  );
}

export default App;
