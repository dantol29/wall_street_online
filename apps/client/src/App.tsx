import { useCallback, useEffect, useRef, useState } from "react";
import { Application } from "@playcanvas/react";
import { FILLMODE_FILL_WINDOW, type Entity as PcEntity } from "playcanvas";
import {
  DESK_INTERACTION_DISTANCE_METERS,
  DESK_STATIONS,
  MOVEMENT_SEND_RATE_HZ,
  type ChatMessage,
  type SeatResultMessage,
  type VoiceTokenResultMessage,
} from "@multiplayer/shared";
import { selectAnimationState } from "./game/player/animationState";
import { MultiplayerClient } from "./game/multiplayer/MultiplayerClient";
import { getOrCreateGuestDisplayName } from "./game/multiplayer/guestName";
import type { ConnectionState } from "./game/multiplayer/messages";
import { EnterGameOverlay } from "./ui/EnterGameOverlay";
import { ConnectionStatus } from "./ui/ConnectionStatus";
import { Chat } from "./ui/Chat";
import { ErrorOverlay } from "./ui/ErrorOverlay";
import { ApplicationErrorBoundary } from "./ui/ApplicationErrorBoundary";
import { TradingPlanEditor } from "./ui/TradingPlanEditor";
import { VoiceControls } from "./ui/VoiceControls";
import {
  VoiceClient,
  type VoiceConnectionState,
  type VoiceParticipantState,
} from "./game/voice/VoiceClient";
import "./App.css";
import Scene, { type SceneHandle } from "./Scene";

const SERVER_URL = import.meta.env.VITE_GAME_SERVER_URL || "ws://localhost:2567";
const MAX_STORED_MESSAGES = 20;
const LOCAL_CAMERA_ENTITY_NAME = "local-camera";
const FIRST_PERSON_CONTROLLER_SCRIPT_NAME = "firstPersonController";
const STANDING_CAMERA_HEIGHT = 0.8;
const SEATED_CAMERA_HEIGHT = 0.25;

function App() {
  const playerEntityRef = useRef<PcEntity | null>(null);
  const sceneRef = useRef<SceneHandle | null>(null);
  const clientRef = useRef<MultiplayerClient | null>(null);
  const voiceClientRef = useRef<VoiceClient | null>(null);
  const voiceRequestedRef = useRef(false);
  const voiceRequestIdRef = useRef(0);
  const attemptConnectRef = useRef<() => void>(() => {});
  const isRunningRef = useRef(false);
  const nearbyDeskIdRef = useRef<string | null>(null);
  const seatedDeskIdRef = useRef<string | null>(null);
  const nameLabelsContainerRef = useRef<HTMLDivElement | null>(null);
  const [entered, setEntered] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [connectErrorMessage, setConnectErrorMessage] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMoved, setHasMoved] = useState(false);
  const [nearbyDeskId, setNearbyDeskId] = useState<string | null>(null);
  const [seatedDeskId, setSeatedDeskId] = useState<string | null>(null);
  const [seatError, setSeatError] = useState<string | null>(null);
  const [voiceState, setVoiceState] = useState<VoiceConnectionState>("disabled");
  const [voiceMessage, setVoiceMessage] = useState<string | null>(null);
  const [voiceTalking, setVoiceTalking] = useState(false);
  const [voiceParticipants, setVoiceParticipants] = useState<VoiceParticipantState[]>([]);

  useEffect(() => {
    let seatErrorTimer: number | null = null;
    let spatialAnimationFrame = 0;
    const applySeatResult = (result: SeatResultMessage): void => {
      if (!result.success) {
        setSeatError(result.message ?? "Unable to use this desk.");
        if (seatErrorTimer !== null) window.clearTimeout(seatErrorTimer);
        seatErrorTimer = window.setTimeout(() => setSeatError(null), 2200);
        return;
      }

      const player = playerEntityRef.current;
      const camera = player?.findByName(LOCAL_CAMERA_ENTITY_NAME);
      seatedDeskIdRef.current = result.deskId;
      setSeatedDeskId(result.deskId);
      nearbyDeskIdRef.current = null;
      setNearbyDeskId(null);

      if (!player || !camera) return;
      const controller = player.script?.get(FIRST_PERSON_CONTROLLER_SCRIPT_NAME);
      if (result.deskId) {
        document.exitPointerLock();
        if (controller) controller.enabled = false;
        if (player.rigidbody) player.rigidbody.enabled = false;
        player.setPosition(result.x, result.y, result.z);
        camera.setLocalPosition(0, SEATED_CAMERA_HEIGHT, 0);
        camera.setLocalEulerAngles(0, (result.rotationY * 180) / Math.PI, 0);
      } else {
        camera.setLocalPosition(0, STANDING_CAMERA_HEIGHT, 0);
        if (player.rigidbody) player.rigidbody.enabled = true;
        if (controller) controller.enabled = true;
      }
    };

    const voice = new VoiceClient(
      {
        getListenerTransform: () => {
          const camera = playerEntityRef.current?.findByName(LOCAL_CAMERA_ENTITY_NAME);
          if (!camera) return null;
          const position = camera.getPosition();
          const forward = camera.forward;
          const up = camera.up;
          return {
            position: { x: position.x, y: position.y, z: position.z },
            forward: { x: forward.x, y: forward.y, z: forward.z },
            up: { x: up.x, y: up.y, z: up.z },
          };
        },
        getRemotePosition: (sessionId) => sceneRef.current?.getRemoteVisualPosition(sessionId) ?? null,
      },
      {
        onStateChange: (state, message) => {
          setVoiceState(state);
          setVoiceMessage(message ?? null);
        },
        onTalkingChange: setVoiceTalking,
        onParticipantsChange: setVoiceParticipants,
      },
    );
    voiceClientRef.current = voice;

    const handleVoiceTokenResult = (result: VoiceTokenResultMessage): void => {
      if (!voiceRequestedRef.current || result.requestId !== voiceRequestIdRef.current) return;
      void voice.connect(result);
    };

    const client = new MultiplayerClient(SERVER_URL, {
      onConnectionStateChange: (state) => {
        setConnectionState(state);
        if (state === "disconnected") {
          voiceRequestedRef.current = false;
          void voice.disconnect();
        }
      },
      onPlayerAdd: (snapshot) => sceneRef.current?.addRemotePlayer(snapshot),
      onPlayerUpdate: (snapshot) => sceneRef.current?.updateRemotePlayer(snapshot),
      onPlayerRemove: (sessionId) => sceneRef.current?.removeRemotePlayer(sessionId),
      onChatMessage: (message) => setMessages((prev) => [...prev, message].slice(-MAX_STORED_MESSAGES)),
      onLocalSpawn: (spawn) => playerEntityRef.current?.rigidbody?.teleport(spawn.x, spawn.y, spawn.z),
      onSeatResult: applySeatResult,
      onVoiceTokenResult: handleVoiceTokenResult,
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
      const target = event.target;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement;
      if (event.code === "KeyV" && !event.repeat && !typing) {
        event.preventDefault();
        void voice.setTalking(true);
      }
      if (
        event.code === "KeyE" &&
        !event.repeat &&
        !typing &&
        !seatedDeskIdRef.current &&
        nearbyDeskIdRef.current
      ) {
        event.preventDefault();
        client.requestSeat(nearbyDeskIdRef.current);
      }
    };
    const handleKeyUp = (event: KeyboardEvent): void => {
      if (event.key === "Shift") isRunningRef.current = false;
      if (event.code === "KeyV") void voice.setTalking(false);
    };
    const stopTalking = (): void => {
      void voice.setTalking(false);
    };
    const handleVisibilityChange = (): void => {
      if (document.hidden) stopTalking();
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", stopTalking);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const updateSpatialAudio = (): void => {
      voice.updateSpatialAudio();
      spatialAnimationFrame = window.requestAnimationFrame(updateSpatialAudio);
    };
    spatialAnimationFrame = window.requestAnimationFrame(updateSpatialAudio);

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

      // Movement relative to the camera's own facing (not world axes), so
      // strafing left/right can pick the character's dedicated strafe clips
      // instead of always playing the forward walk/run pose while sliding
      // sideways — see selectAnimationState/RemotePlayer.tsx.
      let forwardAmount = 1;
      let rightAmount = 0;
      if (cameraEntity && horizontalSpeed > 0) {
        const forward = cameraEntity.forward;
        const right = cameraEntity.right;
        forwardAmount = velocity.x * forward.x + velocity.z * forward.z;
        rightAmount = velocity.x * right.x + velocity.z * right.z;
      }

      client.sendMovement({
        x: position.x,
        y: position.y,
        z: position.z,
        rotationY,
        animation: selectAnimationState(horizontalSpeed, isRunningRef.current, forwardAmount, rightAmount),
      });

      if (!seatedDeskIdRef.current) {
        let nearestId: string | null = null;
        let nearestDistance = DESK_INTERACTION_DISTANCE_METERS;
        for (const desk of DESK_STATIONS) {
          const distance = Math.hypot(position.x - desk.seatX, position.z - desk.seatZ);
          if (distance <= nearestDistance) {
            nearestDistance = distance;
            nearestId = desk.id;
          }
        }
        if (nearestId !== nearbyDeskIdRef.current) {
          nearbyDeskIdRef.current = nearestId;
          setNearbyDeskId(nearestId);
        }
      }
    }, sendIntervalMs);

    return () => {
      window.clearInterval(sendTimer);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", stopTalking);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.cancelAnimationFrame(spatialAnimationFrame);
      if (seatErrorTimer !== null) window.clearTimeout(seatErrorTimer);
      client.disconnect();
      clientRef.current = null;
      voiceClientRef.current = null;
      void voice.dispose();
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
    if (seatedDeskIdRef.current) return;
    const controller = playerEntityRef.current?.script?.get(FIRST_PERSON_CONTROLLER_SCRIPT_NAME);
    if (controller) controller.enabled = !focused;
  };

  const handleStand = useCallback((): void => {
    clientRef.current?.requestSeat(null);
  }, []);

  const handleRetry = (): void => {
    attemptConnectRef.current();
  };

  const handleVoiceEnable = (): void => {
    const voice = voiceClientRef.current;
    if (!voice || connectionState !== "connected") return;
    voiceRequestedRef.current = true;
    voice.prepareAudio();
    voiceRequestIdRef.current += 1;
    clientRef.current?.requestVoiceToken(voiceRequestIdRef.current);
  };

  const handleVoiceDisable = (): void => {
    voiceRequestedRef.current = false;
    void voiceClientRef.current?.disconnect();
  };

  const handleParticipantMuteChange = (sessionId: string, muted: boolean): void => {
    voiceClientRef.current?.setParticipantMuted(sessionId, muted);
  };

  const showErrorOverlay =
    connectErrorMessage ?? (connectionState === "disconnected" ? "Lost connection to the multiplayer server." : null);
  const speakingPlayerIds = new Set(
    voiceParticipants.filter((participant) => participant.speaking).map((participant) => participant.sessionId),
  );

  return (
    <div className="full-bleed">
      <ApplicationErrorBoundary>
        <Application className="playcanvas-app" usePhysics fillMode={FILLMODE_FILL_WINDOW}>
          <Scene
            playerEntityRef={playerEntityRef}
            ref={sceneRef}
            nameLabelsContainerRef={nameLabelsContainerRef}
            speakingPlayerIds={speakingPlayerIds}
          />
        </Application>
      </ApplicationErrorBoundary>
      <div className="trading-floor-overlay" aria-hidden="true">
        <div className="trading-floor-overlay__glow" />
      </div>
      <div className="name-labels-container" ref={nameLabelsContainerRef} />
      <ConnectionStatus state={connectionState} />
      {entered && (
        <VoiceControls
          state={voiceState}
          talking={voiceTalking}
          message={voiceMessage}
          participants={voiceParticipants}
          onEnable={handleVoiceEnable}
          onDisable={handleVoiceDisable}
          onParticipantMuteChange={handleParticipantMuteChange}
        />
      )}
      <Chat
        messages={messages}
        onSend={handleChatSend}
        onFocusChange={handleChatFocusChange}
        disabled={Boolean(seatedDeskId)}
      />
      {entered && !seatedDeskId && <div className="crosshair" />}
      {entered && !hasMoved && !seatedDeskId && <div className="wasd-hint">WASD to move</div>}
      {entered && nearbyDeskId && !seatedDeskId && (
        <div className="desk-interaction"><kbd>E</kbd> Sit and create a trade plan</div>
      )}
      {seatError && <div className="seat-error">{seatError}</div>}
      {seatedDeskId && <TradingPlanEditor deskId={seatedDeskId} onStand={handleStand} />}
      <EnterGameOverlay visible={!entered && !showErrorOverlay} onEnter={handleEnter} />
      <ErrorOverlay message={showErrorOverlay} onRetry={handleRetry} />
    </div>
  );
}

export default App;
