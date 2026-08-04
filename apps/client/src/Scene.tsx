import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type MutableRefObject, type Ref } from "react";
import type { Entity as PcEntity } from "playcanvas";
import {
  type AnimationState,
  type ChatMessage,
  type StickyNote,
  type WhiteboardSnapshot,
} from "@multiplayer/shared";
import { getSceneConfig } from "./scenes/registry";
import { EditorScene } from "./game/scene/EditorScene";
import { RoomEnvironment } from "./game/scene/Environment";
import type { OfficeSlotContent } from "./game/scene/OfficeContentDisplay";
import { CollaborativeWhiteboardDisplay } from "./game/scene/CollaborativeWhiteboardDisplay";
import { StickyWallDisplay } from "./game/scene/StickyWallDisplay";
import { Lighting } from "./game/scene/Lighting";
import { LocalPlayer } from "./game/player/LocalPlayer";
import { RemotePlayer } from "./game/player/RemotePlayer";
import { NameLabelsOverlay } from "./game/player/NameLabelsOverlay";
import { ChatBubblesOverlay } from "./game/player/ChatBubblesOverlay";
import {
  createRemoteTransform,
  getVisualTransform,
  updateRemoteTransformTarget,
} from "./game/multiplayer/interpolation";
import type { RemotePlayerRecord } from "./game/player/remotePlayerRecord";
import type { RemotePlayerSnapshot } from "./game/multiplayer/messages";
import type { WorldTimeAnchor } from "./game/scene/dayNight";
import { DayNightProvider } from "./game/scene/DayNightContext";

interface SceneProps {
  sceneId: string;
  playerEntityRef?: Ref<PcEntity>;
  /** Read every frame by LocalPlayer's own body model — see App.tsx's movement tick. */
  localAnimationRef: MutableRefObject<AnimationState>;
  localSeated: boolean;
  nameLabelsContainerRef: React.RefObject<HTMLDivElement | null>;
  speakingPlayerIds: ReadonlySet<string>;
  /** Drives ChatBubblesOverlay — a transient speech bubble over a remote sender's head, in addition to the side chat panel. */
  messages: ChatMessage[];
  whiteboardSnapshot: WhiteboardSnapshot;
  officeSlotContentById?: Record<string, OfficeSlotContent>;
  stickyNotes: StickyNote[];
  justPlacedStickyNoteAuthorSessionId?: string | null;
  worldTime: WorldTimeAnchor;
  worldTimeOverridePhase: number | null;
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
}

const Scene = forwardRef<SceneHandle, SceneProps>(function Scene(
  {
    sceneId,
    playerEntityRef,
    localAnimationRef,
    localSeated,
    nameLabelsContainerRef,
    speakingPlayerIds,
    messages,
    whiteboardSnapshot,
    officeSlotContentById,
    stickyNotes,
    justPlacedStickyNoteAuthorSessionId,
    worldTime,
    worldTimeOverridePhase,
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
          officeSlotId: snapshot.officeSlotId,
        });
        setRemoteIds((prev) => [...prev, snapshot.sessionId]);
      },
      updateRemotePlayer(snapshot) {
        const record = recordsRef.current.get(snapshot.sessionId);
        if (!record) return;
        updateRemoteTransformTarget(record.transform, snapshot, Date.now());
        record.animation = snapshot.animation;
        record.seatedDeskId = snapshot.seatedDeskId;
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
        <RoomEnvironment officeSlotContentById={officeSlotContentById} />
        <CollaborativeWhiteboardDisplay snapshot={whiteboardSnapshot} />
        <StickyWallDisplay notes={stickyNotes} justPlacedAuthorSessionId={justPlacedStickyNoteAuthorSessionId} />
        <Lighting />
      </DayNightProvider>
    );

  const playerReady = sceneConfig.type !== "editor" || editorSceneReady;

  return (
    <>
      {sceneEnvironment}
      {playerReady && (
        <LocalPlayer
          spawn={spawn}
          seated={localSeated}
          animationRef={localAnimationRef}
          ref={playerEntityRef}
        />
      )}

      {remoteIds.map((sessionId) => (
        <RemotePlayer key={sessionId} sessionId={sessionId} recordsRef={recordsRef} />
      ))}

      <NameLabelsOverlay
        remoteIds={remoteIds}
        recordsRef={recordsRef}
        containerRef={nameLabelsContainerRef}
        speakingPlayerIds={speakingPlayerIds}
      />
      <ChatBubblesOverlay messages={messages} recordsRef={recordsRef} containerRef={nameLabelsContainerRef} />
    </>
  );
});

export default Scene;
