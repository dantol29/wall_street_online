import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { Application } from "@playcanvas/react";
import { FILLMODE_FILL_WINDOW, Vec3, type Entity as PcEntity } from "playcanvas";
import {
  DESK_INTERACTION_DISTANCE_METERS,
  DESK_STATIONS,
  MOVEMENT_SEND_RATE_HZ,
  OFFICE_INTERACTION_DISTANCE_METERS,
  OFFICE_SLOTS,
  STICKY_WALL_INTERACTION_DISTANCE_METERS,
  STICKY_WALL_INTERACTION_POSITION,
  STICKY_WALL_POSITION,
  STICKY_WALL_WORLD_HEIGHT,
  STICKY_WALL_WORLD_WIDTH,
  WHITEBOARD_INTERACTION_DISTANCE_METERS,
  WHITEBOARD_INTERACTION_POSITION,
  WHITEBOARD_POSITION,
  WHITEBOARD_WORLD_HEIGHT,
  WHITEBOARD_WORLD_WIDTH,
  type ChatMessage,
  type OfficeProfileLookup,
  type SeatResultMessage,
  type StickyNote,
  type VoiceTokenResultMessage,
  type WhiteboardShape,
  type WhiteboardSnapshot,
} from "@multiplayer/shared";
import { selectAnimationState } from "./game/player/animationState";
import { MultiplayerClient } from "./game/multiplayer/MultiplayerClient";
import { getOrCreateGuestDisplayName } from "./game/multiplayer/guestName";
import type { ConnectionState } from "./game/multiplayer/messages";
import { PRIVY_ENABLED } from "./game/wallet/privyConfig";
import type { OfficeSlotContent } from "./game/scene/OfficeContentDisplay";
import { EnterGameOverlay } from "./ui/EnterGameOverlay";
import { ConnectionStatus } from "./ui/ConnectionStatus";
import { Chat } from "./ui/Chat";
import { ErrorOverlay } from "./ui/ErrorOverlay";
import { ApplicationErrorBoundary } from "./ui/ApplicationErrorBoundary";
import { TradingPlanEditor } from "./ui/TradingPlanEditor";
import { InWorldWhiteboardControls } from "./ui/InWorldWhiteboardControls";
import { OfficeEditor, type OfficeVisitorBookEntryView, type OfficeWatchlistItemInput } from "./ui/OfficeEditor";
import { StickyNoteEditor } from "./ui/StickyNoteEditor";
import { VoiceControls, type VoiceTalkMode } from "./ui/VoiceControls";
import { WalletPanel } from "./ui/WalletPanel";
import { Minimap } from "./ui/Minimap";
import { MobileGameControls } from "./ui/MobileGameControls";
import {
  VoiceClient,
  type VoiceAudioOutputDevice,
  type VoiceConnectionState,
  type VoiceParticipantState,
} from "./game/voice/VoiceClient";
import "./App.css";
import Scene, { type SceneHandle } from "./Scene";

const SERVER_URL =
  import.meta.env.VITE_GAME_SERVER_URL ||
  (window.location.hostname === "localhost"
    ? "ws://localhost:2567"
    : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`);
const MAX_STORED_MESSAGES = 20;
const LOCAL_CAMERA_ENTITY_NAME = "local-camera";
const FIRST_PERSON_CONTROLLER_SCRIPT_NAME = "firstPersonController";
const STANDING_CAMERA_HEIGHT = 0.8;
const SEATED_CAMERA_HEIGHT = 0.25;
const WALLET_LINK_TIMEOUT_MS = 10_000;
const VOICE_TALK_MODE_STORAGE_KEY = "voiceTalkMode";

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => {
      window.setTimeout(() => reject(new Error("Timed out. Please try again.")), ms);
    }),
  ]);
}

interface ControllerInputSource {
  attach: (element: HTMLElement) => void;
  detach: () => void;
}

interface ControllerRuntimeState {
  axis: { set: (x: number, y: number, z: number) => unknown };
  mouse: number[];
  a: number;
  space: number;
  shift: number;
  ctrl: number;
}

interface FirstPersonControllerRuntime {
  enabled: boolean;
  app: { graphicsDevice: { canvas: HTMLCanvasElement } };
  _desktopInput?: ControllerInputSource;
  _state?: ControllerRuntimeState;
  _angles?: Vec3;
}

interface SavedCameraView {
  localPosition: Vec3;
  localEulerAngles: Vec3;
  controllerAngles: Vec3 | null;
}

function resetControllerInput(controller: FirstPersonControllerRuntime): void {
  const state = controller._state;
  if (!state) return;
  state.axis.set(0, 0, 0);
  state.mouse.fill(0);
  state.a = 0;
  state.space = 0;
  state.shift = 0;
  state.ctrl = 0;
}

function setPlayerControllerPaused(
  player: PcEntity | null,
  paused: boolean,
  inputDetachedRef: MutableRefObject<boolean>,
): void {
  if (!player) return;
  const controller = player.script?.get(
    FIRST_PERSON_CONTROLLER_SCRIPT_NAME,
  ) as FirstPersonControllerRuntime | undefined;
  if (!controller) return;

  resetControllerInput(controller);
  if (paused) {
    document.exitPointerLock();
    if (!inputDetachedRef.current) {
      controller._desktopInput?.detach();
      inputDetachedRef.current = true;
    }
    if (player.rigidbody) {
      const velocity = player.rigidbody.linearVelocity;
      player.rigidbody.linearVelocity = new Vec3(0, velocity.y, 0);
    }
    controller.enabled = false;
    if (player.script) player.script.enabled = false;
    return;
  }

  if (inputDetachedRef.current) {
    controller._desktopInput?.attach(controller.app.graphicsDevice.canvas);
    inputDetachedRef.current = false;
  }
  if (player.script) player.script.enabled = true;
  controller.enabled = true;
}

function enterWhiteboardCamera(
  player: PcEntity | null,
  savedViewRef: MutableRefObject<SavedCameraView | null>,
): void {
  const cameraEntity = player?.findByName(LOCAL_CAMERA_ENTITY_NAME) as PcEntity | null;
  const camera = cameraEntity?.camera;
  if (!cameraEntity || !camera) return;
  const controller = player?.script?.get(
    FIRST_PERSON_CONTROLLER_SCRIPT_NAME,
  ) as FirstPersonControllerRuntime | undefined;

  if (!savedViewRef.current) {
    savedViewRef.current = {
      localPosition: cameraEntity.getLocalPosition().clone(),
      localEulerAngles: cameraEntity.getLocalEulerAngles().clone(),
      controllerAngles: controller?._angles?.clone() ?? null,
    };
  }

  frameWhiteboardCamera(player);
  controller?._angles?.copy(cameraEntity.getLocalEulerAngles());
}

function frameWhiteboardCamera(player: PcEntity | null): void {
  const cameraEntity = player?.findByName(LOCAL_CAMERA_ENTITY_NAME) as PcEntity | null;
  const camera = cameraEntity?.camera;
  if (!cameraEntity || !camera) return;

  const canvasBounds = camera.system.app.graphicsDevice.canvas.getBoundingClientRect();
  const aspect = Math.max(0.5, canvasBounds.width / Math.max(1, canvasBounds.height));
  const halfVerticalFov = (camera.fov * Math.PI) / 360;
  const verticalScale = Math.tan(halfVerticalFov);
  // Include the marker tray below the board, with enough breathing room to
  // make each physical tool easy to see and click.
  const framedHeight = WHITEBOARD_WORLD_HEIGHT + 0.8;
  const framedCenterY = WHITEBOARD_POSITION.y - 0.12;
  const distanceForHeight = framedHeight / 2 / verticalScale;
  const distanceForWidth = WHITEBOARD_WORLD_WIDTH / 2 / (verticalScale * aspect);
  const distance = Math.max(distanceForHeight, distanceForWidth) * 1.14;

  cameraEntity.setPosition(
    WHITEBOARD_POSITION.x + distance,
    framedCenterY,
    WHITEBOARD_POSITION.z,
  );
  cameraEntity.lookAt(
    WHITEBOARD_POSITION.x,
    framedCenterY,
    WHITEBOARD_POSITION.z,
  );
}

function enterStickyWallCamera(
  player: PcEntity | null,
  savedViewRef: MutableRefObject<SavedCameraView | null>,
): void {
  const cameraEntity = player?.findByName(LOCAL_CAMERA_ENTITY_NAME) as PcEntity | null;
  const camera = cameraEntity?.camera;
  if (!cameraEntity || !camera) return;
  const controller = player?.script?.get(
    FIRST_PERSON_CONTROLLER_SCRIPT_NAME,
  ) as FirstPersonControllerRuntime | undefined;

  if (!savedViewRef.current) {
    savedViewRef.current = {
      localPosition: cameraEntity.getLocalPosition().clone(),
      localEulerAngles: cameraEntity.getLocalEulerAngles().clone(),
      controllerAngles: controller?._angles?.clone() ?? null,
    };
  }

  frameStickyWallOverview(player);
  controller?._angles?.copy(cameraEntity.getLocalEulerAngles());
}

/** Establishing shot: the whole board in view — mirrors frameWhiteboardCamera's fit-to-FOV math. */
function frameStickyWallOverview(player: PcEntity | null): void {
  const cameraEntity = player?.findByName(LOCAL_CAMERA_ENTITY_NAME) as PcEntity | null;
  const camera = cameraEntity?.camera;
  if (!cameraEntity || !camera) return;

  const canvasBounds = camera.system.app.graphicsDevice.canvas.getBoundingClientRect();
  const aspect = Math.max(0.5, canvasBounds.width / Math.max(1, canvasBounds.height));
  const halfVerticalFov = (camera.fov * Math.PI) / 360;
  const verticalScale = Math.tan(halfVerticalFov);
  const distanceForHeight = STICKY_WALL_WORLD_HEIGHT / 2 / verticalScale;
  const distanceForWidth = STICKY_WALL_WORLD_WIDTH / 2 / (verticalScale * aspect);
  const distance = Math.max(distanceForHeight, distanceForWidth) * 1.25;

  // Board is on the east wall (+X) — approach from the room-interior side
  // (lower x), mirroring how the whiteboard (west wall, -X) approaches from +x.
  cameraEntity.setPosition(STICKY_WALL_POSITION.x - distance, STICKY_WALL_POSITION.y, STICKY_WALL_POSITION.z);
  cameraEntity.lookAt(STICKY_WALL_POSITION.x, STICKY_WALL_POSITION.y, STICKY_WALL_POSITION.z);
}

function restoreFirstPersonCamera(
  player: PcEntity | null,
  savedViewRef: MutableRefObject<SavedCameraView | null>,
): void {
  const cameraEntity = player?.findByName(LOCAL_CAMERA_ENTITY_NAME) as PcEntity | null;
  const savedView = savedViewRef.current;
  if (!cameraEntity || !savedView) return;
  cameraEntity.setLocalPosition(savedView.localPosition);
  cameraEntity.setLocalEulerAngles(savedView.localEulerAngles);
  const controller = player?.script?.get(
    FIRST_PERSON_CONTROLLER_SCRIPT_NAME,
  ) as FirstPersonControllerRuntime | undefined;
  if (savedView.controllerAngles) {
    controller?._angles?.copy(savedView.controllerAngles);
  }
  savedViewRef.current = null;
}

const EMPTY_WHITEBOARD_SNAPSHOT: WhiteboardSnapshot = {
  shapes: [],
  presenterSessionId: null,
  presenterDisplayName: null,
};

function App() {
  const playerEntityRef = useRef<PcEntity | null>(null);
  const sceneRef = useRef<SceneHandle | null>(null);
  const clientRef = useRef<MultiplayerClient | null>(null);
  const voiceClientRef = useRef<VoiceClient | null>(null);
  const voiceRequestedRef = useRef(false);
  const voiceRequestIdRef = useRef(0);
  const voiceTalkModeRef = useRef<VoiceTalkMode>(
    window.localStorage.getItem(VOICE_TALK_MODE_STORAGE_KEY) === "toggle" ? "toggle" : "hold",
  );
  const voiceDesiredTalkingRef = useRef(false);
  const attemptConnectRef = useRef<() => void>(() => {});
  const primaryInteractionRef = useRef<() => void>(() => {});
  const isRunningRef = useRef(false);
  const nearbyDeskIdRef = useRef<string | null>(null);
  const seatedDeskIdRef = useRef<string | null>(null);
  const nearWhiteboardRef = useRef(false);
  const whiteboardOpenRef = useRef(false);
  const savedCameraViewRef = useRef<SavedCameraView | null>(null);
  const gameplayInputDetachedRef = useRef(false);
  const nameLabelsContainerRef = useRef<HTMLDivElement | null>(null);
  /** This session's own office slot id (from wallet_link_result), if any — empty until a wallet links and a slot happens to be free. */
  const myOfficeSlotIdRef = useRef<string | null>(null);
  const nearOfficeSlotIdRef = useRef<string | null>(null);
  const officeEditorOpenRef = useRef(false);
  /** The lookup used to open the currently-open office editor — reused for signing the visitor book without a second round of slot-to-session resolution. */
  const officeEditorLookupRef = useRef<OfficeProfileLookup | null>(null);
  /** Slot ids whose content has already been fetched once this session — avoids re-fetching on every schema onChange tick for the same occupant. */
  const fetchedOfficeSlotIdsRef = useRef<Set<string>>(new Set());
  const nearStickyWallRef = useRef(false);
  const stickyNoteEditorOpenRef = useRef(false);
  /** Mirrors the `stickyNotes` state for synchronous reads from `triggerPrimaryInteraction`'s closure (created once, so it can't see fresh state directly). */
  const stickyNotesRef = useRef<StickyNote[]>([]);
  const [entered, setEntered] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [connectErrorMessage, setConnectErrorMessage] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMoved, setHasMoved] = useState(false);
  const [nearbyDeskId, setNearbyDeskId] = useState<string | null>(null);
  const [seatedDeskId, setSeatedDeskId] = useState<string | null>(null);
  const [seatError, setSeatError] = useState<string | null>(null);
  const [nearWhiteboard, setNearWhiteboard] = useState(false);
  const [whiteboardOpen, setWhiteboardOpen] = useState(false);
  const [whiteboardSnapshot, setWhiteboardSnapshot] =
    useState<WhiteboardSnapshot>(EMPTY_WHITEBOARD_SNAPSHOT);
  const [voiceState, setVoiceState] = useState<VoiceConnectionState>("disabled");
  const [voiceMessage, setVoiceMessage] = useState<string | null>(null);
  const [voiceTalking, setVoiceTalking] = useState(false);
  const [voiceMicrophoneLevel, setVoiceMicrophoneLevel] = useState(0);
  const [voiceTalkMode, setVoiceTalkMode] = useState<VoiceTalkMode>(voiceTalkModeRef.current);
  const [voiceParticipants, setVoiceParticipants] = useState<VoiceParticipantState[]>([]);
  const [voiceAudioOutputs, setVoiceAudioOutputs] = useState<VoiceAudioOutputDevice[]>([]);
  const [voiceSelectedAudioOutputId, setVoiceSelectedAudioOutputId] = useState("default");
  const [voiceAudioOutputSelectionSupported, setVoiceAudioOutputSelectionSupported] = useState(false);
  const [nearOfficeSlotId, setNearOfficeSlotId] = useState<string | null>(null);
  const [officeSlotContentById, setOfficeSlotContentById] = useState<Record<string, OfficeSlotContent>>({});
  const [officeError, setOfficeError] = useState<string | null>(null);
  const [officeEditorData, setOfficeEditorData] = useState<{
    mode: "own" | "visit";
    ownerDisplayName: string | null;
    thesis: string | null;
    watchlist: OfficeWatchlistItemInput[];
    visitorBook: OfficeVisitorBookEntryView[];
  } | null>(null);
  const [nearStickyWall, setNearStickyWall] = useState(false);
  const [stickyNotes, setStickyNotes] = useState<StickyNote[]>([]);
  const [stickyNoteEditorOpen, setStickyNoteEditorOpen] = useState(false);

  useEffect(() => {
    let seatErrorTimer: number | null = null;
    let officeErrorTimer: number | null = null;
    let spatialAnimationFrame = 0;

    /**
     * Ambient content population: as soon as any connected player is known to
     * occupy an office slot (including on first sighting), fetch their office
     * bundle once so the always-visible 3D content panel shows real data
     * regardless of whether the local player has ever walked up to it —
     * matching the "peek in as you walk past" pitch rather than gating
     * content on the local player's own proximity. A hoisted function
     * declaration (not a const arrow function) so it can be referenced from
     * the MultiplayerClient callbacks defined below, before `client` itself
     * is assigned — resolved fine since none of this fires synchronously.
     */
    function maybeFetchOfficeSlotContent(slotId: string | null, sessionId: string): void {
      if (!slotId || fetchedOfficeSlotIdsRef.current.has(slotId)) return;
      fetchedOfficeSlotIdsRef.current.add(slotId);
      void clientRef.current?.requestOfficeProfile({ type: "session", sessionId }).then((result) => {
        if (!result?.success || !result.profile) return;
        setOfficeSlotContentById((prev) => ({
          ...prev,
          [slotId]: {
            ownerDisplayName: result.profile!.displayName,
            thesisBody: result.profile!.currentThesis?.body ?? null,
            watchlist: result.profile!.watchlist,
          },
        }));
      });
    }

    /**
     * Fetches a fresh profile bundle (including visitor book, which the
     * ambient 3D panel doesn't need/cache) and opens the office editor —
     * "own" mode for the local player's own slot, "visit" mode (sign the
     * visitor book only) for anyone else's occupied slot.
     */
    async function handleOfficeInteract(slotId: string): Promise<void> {
      const client = clientRef.current;
      if (!client) return;
      const mySessionId = client.getSessionId();
      const isOwn = slotId === myOfficeSlotIdRef.current;
      const targetSessionId = isOwn ? mySessionId : (sceneRef.current?.getSessionIdForOfficeSlot(slotId) ?? null);
      if (!targetSessionId) return;

      officeEditorOpenRef.current = true;

      const showOfficeError = (message: string): void => {
        officeEditorOpenRef.current = false;
        setOfficeError(message);
        if (officeErrorTimer !== null) window.clearTimeout(officeErrorTimer);
        officeErrorTimer = window.setTimeout(() => setOfficeError(null), 2200);
      };

      try {
        const result = await withTimeout(
          client.requestOfficeProfile({ type: "session", sessionId: targetSessionId }),
          WALLET_LINK_TIMEOUT_MS,
        );
        if (!result.success || !result.profile) {
          showOfficeError(result.message || "Could not load this office.");
          return;
        }
        officeEditorLookupRef.current = { type: "session", sessionId: targetSessionId };
        setOfficeEditorData({
          mode: isOwn ? "own" : "visit",
          ownerDisplayName: result.profile.displayName,
          thesis: result.profile.currentThesis?.body ?? null,
          watchlist: result.profile.watchlist,
          visitorBook: result.profile.visitorBook,
        });
        setPlayerControllerPaused(playerEntityRef.current, true, gameplayInputDetachedRef);
      } catch (error) {
        showOfficeError(error instanceof Error ? error.message : "Could not load this office.");
      }
    }

    /**
     * Unlike offices, no fetch is needed here — the client already holds the
     * full live snapshot (see onStickyNoteSnapshot/onStickyNoteUpsert). Enters
     * an in-world camera shot of the whole board, mirroring the whiteboard.
     */
    function openStickyNoteEditor(): void {
      const client = clientRef.current;
      if (!client) return;
      stickyNoteEditorOpenRef.current = true;
      setStickyNoteEditorOpen(true);
      setPlayerControllerPaused(playerEntityRef.current, true, gameplayInputDetachedRef);
      enterStickyWallCamera(playerEntityRef.current, savedCameraViewRef);
    }

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
        onTalkingChange: (talking) => {
          voiceDesiredTalkingRef.current = talking;
          setVoiceTalking(talking);
        },
        onMicrophoneLevelChange: setVoiceMicrophoneLevel,
        onParticipantsChange: setVoiceParticipants,
        onAudioOutputsChange: (devices, selectedDeviceId, supported) => {
          setVoiceAudioOutputs(devices);
          setVoiceSelectedAudioOutputId(selectedDeviceId);
          setVoiceAudioOutputSelectionSupported(supported);
        },
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
      onPlayerAdd: (snapshot) => {
        sceneRef.current?.addRemotePlayer(snapshot);
        maybeFetchOfficeSlotContent(snapshot.officeSlotId, snapshot.sessionId);
      },
      onPlayerUpdate: (snapshot) => {
        sceneRef.current?.updateRemotePlayer(snapshot);
        maybeFetchOfficeSlotContent(snapshot.officeSlotId, snapshot.sessionId);
      },
      onPlayerRemove: (sessionId) => sceneRef.current?.removeRemotePlayer(sessionId),
      onChatHistory: (history) => setMessages(history.slice(-MAX_STORED_MESSAGES)),
      onChatMessage: (message) => setMessages((prev) => [...prev, message].slice(-MAX_STORED_MESSAGES)),
      onLocalSpawn: (spawn) => playerEntityRef.current?.rigidbody?.teleport(spawn.x, spawn.y, spawn.z),
      onSeatResult: applySeatResult,
      onVoiceTokenResult: handleVoiceTokenResult,
      onWhiteboardSnapshot: setWhiteboardSnapshot,
      onWhiteboardShapeUpsert: (shape) => {
        setWhiteboardSnapshot((current) => {
          const index = current.shapes.findIndex((candidate) => candidate.id === shape.id);
          const shapes =
            index < 0
              ? [...current.shapes, shape]
              : current.shapes.map((candidate, candidateIndex) =>
                  candidateIndex === index ? shape : candidate,
                );
          return { ...current, shapes };
        });
      },
      onWhiteboardShapeDelete: (id) => {
        setWhiteboardSnapshot((current) => ({
          ...current,
          shapes: current.shapes.filter((shape) => shape.id !== id),
        }));
      },
      onStickyNoteSnapshot: (snapshot) => {
        stickyNotesRef.current = snapshot.notes;
        setStickyNotes(snapshot.notes);
      },
      onStickyNoteUpsert: (note) => {
        setStickyNotes((prev) => {
          const index = prev.findIndex((candidate) => candidate.authorSessionId === note.authorSessionId);
          const next =
            index < 0
              ? [...prev, note]
              : prev.map((candidate, candidateIndex) => (candidateIndex === index ? note : candidate));
          stickyNotesRef.current = next;
          return next;
        });
      },
      onStickyNoteDelete: (authorSessionId) => {
        setStickyNotes((prev) => {
          const next = prev.filter((note) => note.authorSessionId !== authorSessionId);
          stickyNotesRef.current = next;
          return next;
        });
      },
    });
    clientRef.current = client;

    const triggerPrimaryInteraction = (): void => {
      if (
        seatedDeskIdRef.current ||
        whiteboardOpenRef.current ||
        officeEditorOpenRef.current ||
        stickyNoteEditorOpenRef.current
      )
        return;
      if (nearWhiteboardRef.current) {
        whiteboardOpenRef.current = true;
        setWhiteboardOpen(true);
        setPlayerControllerPaused(playerEntityRef.current, true, gameplayInputDetachedRef);
        enterWhiteboardCamera(playerEntityRef.current, savedCameraViewRef);
        client.requestWhiteboardPresenter();
      } else if (nearbyDeskIdRef.current) {
        client.requestSeat(nearbyDeskIdRef.current);
      } else if (nearOfficeSlotIdRef.current) {
        void handleOfficeInteract(nearOfficeSlotIdRef.current);
      } else if (nearStickyWallRef.current) {
        openStickyNoteEditor();
      }
    };
    primaryInteractionRef.current = triggerPrimaryInteraction;

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
    const requestTalking = (talking: boolean): void => {
      voiceDesiredTalkingRef.current = talking;
      void voice.setTalking(talking);
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Shift") isRunningRef.current = true;
      const target = event.target;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement;
      if (event.code === "KeyV" && !event.repeat && !typing) {
        event.preventDefault();
        requestTalking(
          voiceTalkModeRef.current === "toggle"
            ? !voiceDesiredTalkingRef.current
            : true,
        );
      }
      if (
        event.code === "KeyE" &&
        !event.repeat &&
        !typing &&
        !seatedDeskIdRef.current
      ) {
        if (
          nearWhiteboardRef.current ||
          nearbyDeskIdRef.current ||
          nearOfficeSlotIdRef.current ||
          nearStickyWallRef.current
        ) {
          event.preventDefault();
          triggerPrimaryInteraction();
        }
      }
    };
    const handleKeyUp = (event: KeyboardEvent): void => {
      if (event.key === "Shift") isRunningRef.current = false;
      if (event.code === "KeyV" && voiceTalkModeRef.current === "hold") {
        requestTalking(false);
      }
    };
    const stopTalking = (): void => {
      requestTalking(false);
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
        const whiteboardDistance = Math.hypot(
          position.x - WHITEBOARD_INTERACTION_POSITION.x,
          position.z - WHITEBOARD_INTERACTION_POSITION.z,
        );
        const isNearWhiteboard =
          whiteboardDistance <= WHITEBOARD_INTERACTION_DISTANCE_METERS;
        if (isNearWhiteboard !== nearWhiteboardRef.current) {
          nearWhiteboardRef.current = isNearWhiteboard;
          setNearWhiteboard(isNearWhiteboard);
        }

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

        let nearestOfficeSlotId: string | null = null;
        let nearestOfficeDistance = OFFICE_INTERACTION_DISTANCE_METERS;
        for (const slot of OFFICE_SLOTS) {
          const distance = Math.hypot(position.x - slot.interactionX, position.z - slot.interactionZ);
          if (distance <= nearestOfficeDistance) {
            nearestOfficeDistance = distance;
            nearestOfficeSlotId = slot.id;
          }
        }
        if (nearestOfficeSlotId !== nearOfficeSlotIdRef.current) {
          nearOfficeSlotIdRef.current = nearestOfficeSlotId;
          setNearOfficeSlotId(nearestOfficeSlotId);
        }

        const stickyWallDistance = Math.hypot(
          position.x - STICKY_WALL_INTERACTION_POSITION.x,
          position.z - STICKY_WALL_INTERACTION_POSITION.z,
        );
        const isNearStickyWall = stickyWallDistance <= STICKY_WALL_INTERACTION_DISTANCE_METERS;
        if (isNearStickyWall !== nearStickyWallRef.current) {
          nearStickyWallRef.current = isNearStickyWall;
          setNearStickyWall(isNearStickyWall);
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
      if (officeErrorTimer !== null) window.clearTimeout(officeErrorTimer);
      client.disconnect();
      clientRef.current = null;
      primaryInteractionRef.current = () => {};
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

  const handleChatFocusChange = useCallback((focused: boolean): void => {
    if (seatedDeskIdRef.current) return;
    if (whiteboardOpenRef.current) return;
    setPlayerControllerPaused(
      playerEntityRef.current,
      focused,
      gameplayInputDetachedRef,
    );
  }, []);

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
    voiceDesiredTalkingRef.current = false;
    void voiceClientRef.current?.disconnect();
  };

  const handleVoiceTalkModeChange = (mode: VoiceTalkMode): void => {
    voiceTalkModeRef.current = mode;
    setVoiceTalkMode(mode);
    window.localStorage.setItem(VOICE_TALK_MODE_STORAGE_KEY, mode);
    voiceDesiredTalkingRef.current = false;
    void voiceClientRef.current?.setTalking(false);
  };

  const handleVoiceAudioOutputChange = (deviceId: string): void => {
    setVoiceSelectedAudioOutputId(deviceId);
    void voiceClientRef.current?.setAudioOutputDevice(deviceId).then((switched) => {
      if (switched) {
        setVoiceMessage(null);
      } else {
        setVoiceMessage("This browser could not switch the audio output.");
      }
    }).catch(() => {
      setVoiceMessage("This browser could not switch the audio output.");
    });
  };

  const handleVoiceTalkStart = (): void => {
    voiceDesiredTalkingRef.current = true;
    void voiceClientRef.current?.setTalking(true);
  };

  const handleVoiceTalkEnd = (): void => {
    voiceDesiredTalkingRef.current = false;
    void voiceClientRef.current?.setTalking(false);
  };

  const handleVoiceTalkToggle = (): void => {
    const talking = !voiceDesiredTalkingRef.current;
    voiceDesiredTalkingRef.current = talking;
    void voiceClientRef.current?.setTalking(talking);
  };

  const handleParticipantMuteChange = (sessionId: string, muted: boolean): void => {
    voiceClientRef.current?.setParticipantMuted(sessionId, muted);
  };

  const handleWhiteboardClose = useCallback((): void => {
    clientRef.current?.releaseWhiteboardPresenter();
    whiteboardOpenRef.current = false;
    setWhiteboardOpen(false);
    restoreFirstPersonCamera(playerEntityRef.current, savedCameraViewRef);
    setPlayerControllerPaused(
      playerEntityRef.current,
      false,
      gameplayInputDetachedRef,
    );
  }, []);

  const handleWhiteboardUpsert = useCallback((shape: WhiteboardShape): void => {
    clientRef.current?.upsertWhiteboardShape(shape);
  }, []);

  const handleWhiteboardDelete = useCallback((id: string): void => {
    clientRef.current?.deleteWhiteboardShape(id);
  }, []);

  useEffect(() => {
    if (!whiteboardOpen) return;
    const reframe = (): void => frameWhiteboardCamera(playerEntityRef.current);
    const animationFrame = window.requestAnimationFrame(reframe);
    window.addEventListener("resize", reframe);
    window.addEventListener("orientationchange", reframe);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", reframe);
      window.removeEventListener("orientationchange", reframe);
    };
  }, [whiteboardOpen]);

  useEffect(() => {
    if (!stickyNoteEditorOpen) return;
    const reframe = (): void => frameStickyWallOverview(playerEntityRef.current);
    const animationFrame = window.requestAnimationFrame(reframe);
    window.addEventListener("resize", reframe);
    window.addEventListener("orientationchange", reframe);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", reframe);
      window.removeEventListener("orientationchange", reframe);
    };
  }, [stickyNoteEditorOpen]);

  const handleOfficeEditorClose = useCallback((): void => {
    officeEditorOpenRef.current = false;
    officeEditorLookupRef.current = null;
    setOfficeEditorData(null);
    setPlayerControllerPaused(playerEntityRef.current, false, gameplayInputDetachedRef);
  }, []);

  const handlePublishThesis = useCallback(async (body: string) => {
    const client = clientRef.current;
    if (!client) return { success: false, message: "Not connected." };
    const result = await client.publishThesis(body);
    if (result.success && result.thesis && myOfficeSlotIdRef.current) {
      const slotId = myOfficeSlotIdRef.current;
      const thesisBody = result.thesis.body;
      setOfficeSlotContentById((prev) => ({
        ...prev,
        [slotId]: { ...(prev[slotId] ?? { ownerDisplayName: null, thesisBody: null, watchlist: [] }), thesisBody },
      }));
    }
    return { success: result.success, message: result.message };
  }, []);

  const handleUpdateWatchlist = useCallback(async (items: OfficeWatchlistItemInput[]) => {
    const client = clientRef.current;
    if (!client) return { success: false, message: "Not connected." };
    const result = await client.updateWatchlist(items);
    if (result.success && result.items && myOfficeSlotIdRef.current) {
      const slotId = myOfficeSlotIdRef.current;
      const watchlist = result.items;
      setOfficeSlotContentById((prev) => ({
        ...prev,
        [slotId]: { ...(prev[slotId] ?? { ownerDisplayName: null, thesisBody: null, watchlist: [] }), watchlist },
      }));
    }
    return { success: result.success, message: result.message };
  }, []);

  const handleSignVisitorBook = useCallback(async (message: string) => {
    const client = clientRef.current;
    const lookup = officeEditorLookupRef.current;
    if (!client || !lookup) return { success: false, message: "Not connected." };
    const result = await client.signVisitorBook(lookup, message);
    if (result.success && result.entry) {
      const entry = result.entry;
      setOfficeEditorData((prev) => (prev ? { ...prev, visitorBook: [entry, ...prev.visitorBook] } : prev));
    }
    return { success: result.success, message: result.message };
  }, []);

  const handleStickyNoteEditorClose = useCallback((): void => {
    stickyNoteEditorOpenRef.current = false;
    setStickyNoteEditorOpen(false);
    restoreFirstPersonCamera(playerEntityRef.current, savedCameraViewRef);
    setPlayerControllerPaused(playerEntityRef.current, false, gameplayInputDetachedRef);
  }, []);

  const handleStickyNoteSubmit = useCallback(async (text: string) => {
    const client = clientRef.current;
    if (!client) return { success: false, message: "Not connected." };
    const result = await client.upsertStickyNote(text);
    // No local state update here — the server broadcasts `sticky_note_upsert`
    // (including back to the author), so onStickyNoteUpsert applies it.
    return { success: result.success, message: result.message };
  }, []);

  const handleLinkWallet = useCallback(async (authToken: string) => {
    const client = clientRef.current;
    if (!client) return { success: false, message: "Not connected." };
    const result = await withTimeout(client.linkWallet(authToken), WALLET_LINK_TIMEOUT_MS);
    if (result.success && result.officeSlotId) {
      myOfficeSlotIdRef.current = result.officeSlotId;
      const mySessionId = client.getSessionId();
      const slotId = result.officeSlotId;
      if (mySessionId && !fetchedOfficeSlotIdsRef.current.has(slotId)) {
        fetchedOfficeSlotIdsRef.current.add(slotId);
        void client.requestOfficeProfile({ type: "session", sessionId: mySessionId }).then((profileResult) => {
          if (!profileResult.success || !profileResult.profile) return;
          setOfficeSlotContentById((prev) => ({
            ...prev,
            [slotId]: {
              ownerDisplayName: profileResult.profile!.displayName,
              thesisBody: profileResult.profile!.currentThesis?.body ?? null,
              watchlist: profileResult.profile!.watchlist,
            },
          }));
        });
      }
    }
    return result;
  }, []);

  const showErrorOverlay =
    connectErrorMessage ?? (connectionState === "disconnected" ? "Lost connection to the multiplayer server." : null);
  const speakingPlayerIds = new Set(
    voiceParticipants.filter((participant) => participant.speaking).map((participant) => participant.sessionId),
  );
  const isNearOwnOffice = nearOfficeSlotId !== null && nearOfficeSlotId === myOfficeSlotIdRef.current;
  const nearOfficeOccupantSessionId =
    nearOfficeSlotId && !isNearOwnOffice ? (sceneRef.current?.getSessionIdForOfficeSlot(nearOfficeSlotId) ?? null) : null;
  const mySessionId = clientRef.current?.getSessionId() ?? null;
  const myStickyNote = mySessionId ? stickyNotes.find((note) => note.authorSessionId === mySessionId) ?? null : null;
  const mobileActionLabel = nearWhiteboard
    ? "Use board"
    : nearbyDeskId
      ? "Sit at desk"
      : isNearOwnOffice
        ? "Manage office"
        : nearOfficeOccupantSessionId
          ? "Visit office"
          : nearStickyWall
            ? myStickyNote
              ? "Update note"
              : "Post note"
            : null;

  return (
    <div className="full-bleed">
      <ApplicationErrorBoundary>
        <Application className="playcanvas-app" usePhysics fillMode={FILLMODE_FILL_WINDOW}>
          <Scene
            playerEntityRef={playerEntityRef}
            ref={sceneRef}
            nameLabelsContainerRef={nameLabelsContainerRef}
            speakingPlayerIds={speakingPlayerIds}
            whiteboardSnapshot={whiteboardSnapshot}
            officeSlotContentById={officeSlotContentById}
            stickyNotes={stickyNotes}
          />
        </Application>
      </ApplicationErrorBoundary>
      <div className="trading-floor-overlay" aria-hidden="true">
        <div className="trading-floor-overlay__glow" />
      </div>
      <div className="name-labels-container" ref={nameLabelsContainerRef} />
      <ConnectionStatus state={connectionState} />
      {entered && PRIVY_ENABLED && (
        <WalletPanel connected={connectionState === "connected"} onLinkWallet={handleLinkWallet} />
      )}
      {entered && (
        <VoiceControls
          gameConnected={connectionState === "connected"}
          state={voiceState}
          talking={voiceTalking}
          microphoneLevel={voiceMicrophoneLevel}
          message={voiceMessage}
          participants={voiceParticipants}
          talkMode={voiceTalkMode}
          audioOutputs={voiceAudioOutputs}
          selectedAudioOutputId={voiceSelectedAudioOutputId}
          audioOutputSelectionSupported={voiceAudioOutputSelectionSupported}
          onEnable={handleVoiceEnable}
          onDisable={handleVoiceDisable}
          onTalkModeChange={handleVoiceTalkModeChange}
          onAudioOutputChange={handleVoiceAudioOutputChange}
          onParticipantMuteChange={handleParticipantMuteChange}
        />
      )}
      {entered && !whiteboardOpen && !officeEditorData && !stickyNoteEditorOpen && (
        <Minimap playerEntityRef={playerEntityRef} sceneRef={sceneRef} />
      )}
      <Chat
        messages={messages}
        onSend={handleChatSend}
        onFocusChange={handleChatFocusChange}
        disabled={Boolean(seatedDeskId) || whiteboardOpen}
      />
      {entered && !seatedDeskId && !whiteboardOpen && <div className="crosshair" />}
      {entered && !hasMoved && !seatedDeskId && !whiteboardOpen && <div className="wasd-hint">WASD to move</div>}
      {entered && !seatedDeskId && !whiteboardOpen && !officeEditorData && !stickyNoteEditorOpen && (
        <MobileGameControls
          actionLabel={mobileActionLabel}
          showMovementHint={!hasMoved}
          voiceReady={voiceState === "ready"}
          talking={voiceTalking}
          microphoneLevel={voiceMicrophoneLevel}
          talkMode={voiceTalkMode}
          onAction={() => primaryInteractionRef.current()}
          onTalkStart={handleVoiceTalkStart}
          onTalkEnd={handleVoiceTalkEnd}
          onTalkToggle={handleVoiceTalkToggle}
        />
      )}
      {entered && nearWhiteboard && !seatedDeskId && !whiteboardOpen && (
        <div className="desk-interaction"><kbd>E</kbd> Open live analysis board</div>
      )}
      {entered && nearbyDeskId && !nearWhiteboard && !seatedDeskId && !whiteboardOpen && (
        <div className="desk-interaction"><kbd>E</kbd> Sit and create a trade plan</div>
      )}
      {entered && isNearOwnOffice && !seatedDeskId && !whiteboardOpen && !officeEditorData && (
        <div className="desk-interaction"><kbd>E</kbd> Manage your office</div>
      )}
      {entered && nearOfficeOccupantSessionId && !seatedDeskId && !whiteboardOpen && !officeEditorData && (
        <div className="desk-interaction"><kbd>E</kbd> Sign the visitor book</div>
      )}
      {entered && nearStickyWall && !seatedDeskId && !whiteboardOpen && !stickyNoteEditorOpen && (
        <div className="desk-interaction">
          <kbd>E</kbd> {myStickyNote ? "Update your note" : "Post a note"}
        </div>
      )}
      {seatError && <div className="seat-error">{seatError}</div>}
      {officeError && <div className="seat-error">{officeError}</div>}
      {seatedDeskId && <TradingPlanEditor deskId={seatedDeskId} onStand={handleStand} />}
      {officeEditorData && (
        <OfficeEditor
          mode={officeEditorData.mode}
          ownerDisplayName={officeEditorData.ownerDisplayName}
          initialThesis={officeEditorData.thesis}
          initialWatchlist={officeEditorData.watchlist}
          visitorBook={officeEditorData.visitorBook}
          onClose={handleOfficeEditorClose}
          onPublishThesis={handlePublishThesis}
          onUpdateWatchlist={handleUpdateWatchlist}
          onSignVisitorBook={handleSignVisitorBook}
        />
      )}
      {stickyNoteEditorOpen && (
        <StickyNoteEditor
          initialText={myStickyNote?.text ?? ""}
          onClose={handleStickyNoteEditorClose}
          onSubmit={handleStickyNoteSubmit}
        />
      )}
      {whiteboardOpen && (
        <InWorldWhiteboardControls
          playerEntityRef={playerEntityRef}
          snapshot={whiteboardSnapshot}
          localSessionId={clientRef.current?.getSessionId() ?? null}
          onClose={handleWhiteboardClose}
          onUpsertShape={handleWhiteboardUpsert}
          onDeleteShape={handleWhiteboardDelete}
        />
      )}
      <EnterGameOverlay visible={!entered && !showErrorOverlay} onEnter={handleEnter} />
      <ErrorOverlay message={showErrorOverlay} onRetry={handleRetry} />
    </div>
  );
}

export default App;
