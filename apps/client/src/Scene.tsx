import { forwardRef, useImperativeHandle, useRef, useState, type Ref } from "react";
import type { Entity as PcEntity } from "playcanvas";
import { SPAWN_POINTS, type WhiteboardSnapshot } from "@multiplayer/shared";
import { RoomEnvironment } from "./game/scene/Environment";
import type { OfficeSlotContent } from "./game/scene/OfficeContentDisplay";
import { CollaborativeWhiteboardDisplay } from "./game/scene/CollaborativeWhiteboardDisplay";
import { Lighting } from "./game/scene/Lighting";
import { LocalPlayer } from "./game/player/LocalPlayer";
import { RemotePlayer } from "./game/player/RemotePlayer";
import { NameLabelsOverlay } from "./game/player/NameLabelsOverlay";
import {
  createRemoteTransform,
  getVisualTransform,
  updateRemoteTransformTarget,
} from "./game/multiplayer/interpolation";
import type { RemotePlayerRecord } from "./game/player/remotePlayerRecord";
import type { RemotePlayerSnapshot } from "./game/multiplayer/messages";

interface SceneProps {
  playerEntityRef?: Ref<PcEntity>;
  nameLabelsContainerRef: React.RefObject<HTMLDivElement | null>;
  speakingPlayerIds: ReadonlySet<string>;
  whiteboardSnapshot: WhiteboardSnapshot;
  officeSlotContentById?: Record<string, OfficeSlotContent>;
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

const DEFAULT_SPAWN = SPAWN_POINTS[0];

const Scene = forwardRef<SceneHandle, SceneProps>(function Scene(
  { playerEntityRef, nameLabelsContainerRef, speakingPlayerIds, whiteboardSnapshot, officeSlotContentById },
  ref,
) {
  const recordsRef = useRef<Map<string, RemotePlayerRecord>>(new Map());
  const [remoteIds, setRemoteIds] = useState<string[]>([]);

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

  return (
    <>
      <RoomEnvironment officeSlotContentById={officeSlotContentById} />
      <CollaborativeWhiteboardDisplay snapshot={whiteboardSnapshot} />
      <Lighting />
      <LocalPlayer spawn={DEFAULT_SPAWN} ref={playerEntityRef} />

      {remoteIds.map((sessionId) => (
        <RemotePlayer key={sessionId} sessionId={sessionId} recordsRef={recordsRef} />
      ))}

      <NameLabelsOverlay
        remoteIds={remoteIds}
        recordsRef={recordsRef}
        containerRef={nameLabelsContainerRef}
        speakingPlayerIds={speakingPlayerIds}
      />
    </>
  );
});

export default Scene;
