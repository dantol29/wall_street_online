import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type MutableRefObject, type Ref } from "react";
import type { Entity as PcEntity } from "playcanvas";
import {
  type AnimationState,
  type StickyNote,
  type WhiteboardSnapshot,
} from "@multiplayer/shared";
import { getSceneConfig } from "./scenes/registry";
import { EditorScene } from "./game/scene/EditorScene";
import { RoomEnvironment } from "./game/scene/Environment";
import { CollaborativeWhiteboardDisplay } from "./game/scene/CollaborativeWhiteboardDisplay";
import { StickyWallDisplay } from "./game/scene/StickyWallDisplay";
import { TokenMonitor } from "./game/scene/TokenMonitor";
import { Lighting } from "./game/scene/Lighting";
import { LocalPlayer } from "./game/player/LocalPlayer";
import { RemotePlayer } from "./game/player/RemotePlayer";
import { PlayerTokenProjectile, type PlayerTokenThrowVisual } from "./game/player/PlayerTokenProjectile";
import { LaunchBots } from "./game/player/LaunchBots";
import {
  createRemoteTransform,
  getVisualTransform,
  updateRemoteTransformTarget,
} from "./game/multiplayer/interpolation";
import type { RemotePlayerRecord } from "./game/player/remotePlayerRecord";
import type { RemotePlayerSnapshot } from "./game/multiplayer/messages";
import type { WorldTimeAnchor } from "./game/scene/dayNight";
import { DayNightProvider } from "./game/scene/DayNightContext";
import { WhiteboardCamera } from "./game/scene/WhiteboardCamera";
import { StickyWallCamera } from "./game/scene/StickyWallCamera";
import { TokenLaunchArea, type TokenLaunchDisplayState } from "./game/scene/TokenLaunchArea";
import type { LaunchedMarketToken } from "./game/scene/TokenRingMarket";
import { ExchangeAmbience } from "./game/audio/ExchangeAmbience";
import { FIRST_TOKEN_STAND } from "./game/scene/tokenRingLayout";
import { SceneBrightness } from "./game/scene/SceneBrightness";

interface SceneProps {
  sceneId: string;
  playerEntityRef?: Ref<PcEntity>;
  /** Read every frame by LocalPlayer's own body model — see App.tsx's movement tick. */
  localAnimationRef: MutableRefObject<AnimationState>;
  localSeated: boolean;
  localHoldingNotepad: boolean;
  speakingPlayerIds: ReadonlySet<string>;
  chatFocused: boolean;
  whiteboardOpen: boolean;
  stickyWallOpen: boolean;
  whiteboardSnapshot: WhiteboardSnapshot;
  stickyNotes: StickyNote[];
  justPlacedStickyNoteAuthorSessionId?: string | null;
  worldTime: WorldTimeAnchor;
  worldTimeOverridePhase: number | null;
  tokenMonitorTimeframeIndex: number;
  pignTimeframeIndex: number;
  tokenMonitorTradePress: { standAddress: string; side: "buy" | "sell"; id: number; sourceSessionId: string } | null;
  tokenLaunchDisplay: TokenLaunchDisplayState;
  launchedMarketToken: LaunchedMarketToken | null;
  tickerAnnouncement: string | null;
  launchStandAnnouncementActive: boolean;
  soundPlayingStandAddresses: ReadonlySet<string>;
  playerTokenThrow: PlayerTokenThrowVisual | null;
  localSessionId: string | null;
}

export interface SceneHandle {
  addRemotePlayer: (snapshot: RemotePlayerSnapshot) => void;
  updateRemotePlayer: (snapshot: RemotePlayerSnapshot) => void;
  removeRemotePlayer: (sessionId: string) => void;
  getRemoteVisualPosition: (sessionId: string) => { x: number; y: number; z: number } | null;
  getRemoteMinimapPlayers: () => Array<{
    sessionId: string;
    displayName: string;
    x: number;
    z: number;
  }>;
  /** Which connected player (if any) is currently bound to this office slot — see OFFICE_SLOTS/PlayerState.officeSlotId. */
  getSessionIdForOfficeSlot: (slotId: string) => string | null;
  /** Applies a pnl_update entry — a no-op if that session isn't (or is no longer) a tracked remote player. */
  updateRemotePnl: (sessionId: string, pnlUsd: number) => void;
}

const Scene = forwardRef<SceneHandle, SceneProps>(function Scene(
  {
    sceneId,
    playerEntityRef,
    localAnimationRef,
    localSeated,
    localHoldingNotepad,
    speakingPlayerIds,
    chatFocused,
    whiteboardOpen,
    stickyWallOpen,
    whiteboardSnapshot,
    stickyNotes,
    justPlacedStickyNoteAuthorSessionId,
    worldTime,
    worldTimeOverridePhase,
    tokenMonitorTimeframeIndex,
    pignTimeframeIndex,
    tokenMonitorTradePress,
    tokenLaunchDisplay,
    launchedMarketToken,
    tickerAnnouncement,
    launchStandAnnouncementActive,
    soundPlayingStandAddresses,
    playerTokenThrow,
    localSessionId,
  },
  ref,
) {
  const recordsRef = useRef<Map<string, RemotePlayerRecord>>(new Map());
  const [remoteIds, setRemoteIds] = useState<string[]>([]);
  const [editorSceneReady, setEditorSceneReady] = useState(false);
  const onEditorSceneReady = useCallback(() => setEditorSceneReady(true), []);
  useEffect(() => setEditorSceneReady(false), [sceneId]);

  useImperativeHandle(
    ref,
    () => ({
      addRemotePlayer(snapshot) {
        if (recordsRef.current.has(snapshot.sessionId)) return;
        recordsRef.current.set(snapshot.sessionId, {
          transform: createRemoteTransform(snapshot, Date.now()),
          displayName: snapshot.displayName,
          animation: snapshot.animation,
          seatedDeskId: snapshot.seatedDeskId,
          holdingNotepad: snapshot.holdingNotepad,
          officeSlotId: snapshot.officeSlotId,
          pnlUsd: null,
        });
        setRemoteIds((prev) => [...prev, snapshot.sessionId]);
      },
      updateRemotePlayer(snapshot) {
        const record = recordsRef.current.get(snapshot.sessionId);
        if (!record) return;
        updateRemoteTransformTarget(record.transform, snapshot, Date.now());
        record.displayName = snapshot.displayName;
        record.animation = snapshot.animation;
        record.seatedDeskId = snapshot.seatedDeskId;
        record.holdingNotepad = snapshot.holdingNotepad;
        record.officeSlotId = snapshot.officeSlotId;
      },
      removeRemotePlayer(sessionId) {
        recordsRef.current.delete(sessionId);
        setRemoteIds((prev) => prev.filter((id) => id !== sessionId));
      },
      getRemoteVisualPosition(sessionId) {
        const record = recordsRef.current.get(sessionId);
        if (!record) return null;
        const visual = getVisualTransform(record.transform, Date.now(), 1000 / 12);
        return { x: visual.x, y: visual.y, z: visual.z };
      },
      getRemoteMinimapPlayers() {
        const now = Date.now();
        return [...recordsRef.current].map(([sessionId, record]) => {
          const visual = getVisualTransform(record.transform, now, 1000 / 12);
          return {
            sessionId,
            displayName: record.displayName,
            x: visual.x,
            z: visual.z,
          };
        });
      },
      getSessionIdForOfficeSlot(slotId) {
        for (const [sessionId, record] of recordsRef.current) {
          if (record.officeSlotId === slotId) return sessionId;
        }
        return null;
      },
      updateRemotePnl(sessionId, pnlUsd) {
        const record = recordsRef.current.get(sessionId);
        if (!record) return;
        record.pnlUsd = pnlUsd;
      },
    }),
    []
  );

  const sceneConfig = getSceneConfig(sceneId);
  const spawn = sceneConfig.spawnPoints[0];

  const sceneEnvironment =
    sceneConfig.type === "editor" && sceneConfig.configUrl && sceneConfig.sceneUrl ? (
      <EditorScene configUrl={sceneConfig.configUrl} sceneUrl={sceneConfig.sceneUrl} onReady={onEditorSceneReady} />
    ) : (
      <DayNightProvider worldTime={worldTime} overridePhase={worldTimeOverridePhase}>
        <RoomEnvironment
          launchedToken={launchedMarketToken}
          tickerAnnouncement={tickerAnnouncement}
          launchAnnouncementActive={launchStandAnnouncementActive}
          soundPlayingStandAddresses={soundPlayingStandAddresses}
          activeTimeframeIndex={pignTimeframeIndex}
          tradePress={tokenMonitorTradePress}
        />
        <CollaborativeWhiteboardDisplay snapshot={whiteboardSnapshot} />
        <StickyWallDisplay notes={stickyNotes} justPlacedAuthorSessionId={justPlacedStickyNoteAuthorSessionId} />
        <TokenMonitor
          activeTimeframeIndex={tokenMonitorTimeframeIndex}
          tradePress={tokenMonitorTradePress?.standAddress === FIRST_TOKEN_STAND.address ? tokenMonitorTradePress : null}
          soundPlaying={soundPlayingStandAddresses.has(FIRST_TOKEN_STAND.address)}
        />
        <TokenLaunchArea state={tokenLaunchDisplay} />
        <Lighting />
        <ExchangeAmbience launchPhase={tokenLaunchDisplay.phase} />
      </DayNightProvider>
    );

  const playerReady = sceneConfig.type !== "editor" || editorSceneReady;

  return (
    <>
      <SceneBrightness exposure={1.6} />
      {sceneEnvironment}
      {playerReady && (
        <LocalPlayer
          spawn={spawn}
          seated={localSeated}
          holdingNotepad={localHoldingNotepad}
          animationRef={localAnimationRef}
          chatFocused={chatFocused}
          alternateCameraActive={whiteboardOpen || stickyWallOpen}
          ref={playerEntityRef}
        />
      )}
      {playerReady && whiteboardOpen && <WhiteboardCamera />}
      {playerReady && stickyWallOpen && <StickyWallCamera />}
      {playerReady && <PlayerTokenProjectile event={playerTokenThrow} localSessionId={localSessionId} />}
      {playerReady && sceneConfig.type !== "editor" && <LaunchBots />}

      {remoteIds.map((sessionId) => (
        <RemotePlayer
          key={sessionId}
          sessionId={sessionId}
          recordsRef={recordsRef}
          speaking={speakingPlayerIds.has(sessionId)}
        />
      ))}
    </>
  );
});

export default Scene;
