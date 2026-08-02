import { useEffect, useRef, useState, type RefObject } from "react";
import { Circle, Group, Layer, Line, Rect, Stage, Text } from "react-konva";
import type { Entity as PcEntity } from "playcanvas";
import {
  DESK_STATIONS,
  OFFICE_SLOTS,
  WHITEBOARD_POSITION,
  WHITEBOARD_WORLD_WIDTH,
  WORLD_BOUNDS,
} from "@multiplayer/shared";
import type { SceneHandle } from "../Scene";

interface MinimapProps {
  playerEntityRef: RefObject<PcEntity | null>;
  sceneRef: RefObject<SceneHandle | null>;
}

interface MapPlayer {
  id: string;
  x: number;
  z: number;
}

interface LiveMapState {
  local: { x: number; z: number; heading: number } | null;
  remotes: MapPlayer[];
}

const MAIN_FLOOR_MAX_Z = 12.5;
const MAP_UPDATE_INTERVAL_MS = 50;
const MAP_METERS_VISIBLE_ACROSS = 30;

export function Minimap({ playerEntityRef, sceneRef }: MinimapProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [diameter, setDiameter] = useState(180);
  const [live, setLive] = useState<LiveMapState>({ local: null, remotes: [] });

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const updateSize = (): void => {
      setDiameter(Math.max(1, Math.round(viewport.getBoundingClientRect().width)));
    };
    const observer = new ResizeObserver(updateSize);
    observer.observe(viewport);
    updateSize();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let animationFrame = 0;
    let previousUpdate = 0;
    const update = (now: number): void => {
      if (now - previousUpdate >= MAP_UPDATE_INTERVAL_MS) {
        previousUpdate = now;
        const player = playerEntityRef.current;
        const camera = player?.findByName("local-camera") as PcEntity | null;
        const position = player?.getPosition();
        const local =
          position && camera
            ? {
                x: position.x,
                z: position.z,
                heading: (Math.atan2(camera.forward.z, camera.forward.x) * 180) / Math.PI,
              }
            : null;
        const remotes = (sceneRef.current?.getRemoteMinimapPlayers() ?? []).map((remote) => ({
          id: remote.sessionId,
          x: remote.x,
          z: remote.z,
        }));
        setLive({ local, remotes });
      }
      animationFrame = window.requestAnimationFrame(update);
    };
    animationFrame = window.requestAnimationFrame(update);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [playerEntityRef, sceneRef]);

  const center = diameter / 2;
  const radius = center - 5;
  const scale = diameter / MAP_METERS_VISIBLE_ACROSS;
  const local = live.local ?? { x: 0, z: 0, heading: -90 };
  const mapRotation = -90 - local.heading;
  const toRadar = (x: number, z: number): [number, number] => [
    (x - local.x) * scale,
    (z - local.z) * scale,
  ];

  const floorTopLeft = toRadar(WORLD_BOUNDS.minX, WORLD_BOUNDS.minZ);
  const floorBottomRight = toRadar(WORLD_BOUNDS.maxX, MAIN_FLOOR_MAX_Z);
  const corridorTopLeft = toRadar(-2, MAIN_FLOOR_MAX_Z);
  const corridorBottomRight = toRadar(2, WORLD_BOUNDS.maxZ);
  const boardTop = toRadar(
    WHITEBOARD_POSITION.x,
    WHITEBOARD_POSITION.z - WHITEBOARD_WORLD_WIDTH / 2,
  );
  const boardBottom = toRadar(
    WHITEBOARD_POSITION.x,
    WHITEBOARD_POSITION.z + WHITEBOARD_WORLD_WIDTH / 2,
  );
  const northRotation = (mapRotation * Math.PI) / 180;
  const compassRadius = radius - 14;
  const northX = center + Math.sin(northRotation) * compassRadius;
  const northY = center - Math.cos(northRotation) * compassRadius;

  return (
    <aside className="minimap" aria-label="Nearby trading floor radar">
      <div className="minimap__viewport" ref={viewportRef}>
        <Stage width={diameter} height={diameter} listening={false}>
          <Layer listening={false}>
            <Circle
              x={center}
              y={center}
              radius={radius + 3}
              fill="rgba(5, 8, 6, 0.86)"
              stroke="rgba(0, 0, 0, 0.9)"
              strokeWidth={7}
            />

            <Group
              x={center}
              y={center}
              rotation={mapRotation}
              clipFunc={(context) => {
                context.arc(0, 0, radius, 0, Math.PI * 2);
              }}
            >
              <Rect
                x={floorTopLeft[0]}
                y={floorTopLeft[1]}
                width={floorBottomRight[0] - floorTopLeft[0]}
                height={floorBottomRight[1] - floorTopLeft[1]}
                fill="#788079"
                stroke="#d5d9d5"
                strokeWidth={0.8}
              />
              <Rect
                x={corridorTopLeft[0]}
                y={corridorTopLeft[1]}
                width={corridorBottomRight[0] - corridorTopLeft[0]}
                height={corridorBottomRight[1] - corridorTopLeft[1]}
                fill="#6b736c"
                stroke="#d5d9d5"
                strokeWidth={0.8}
              />

              <Line
                points={[floorTopLeft[0], floorTopLeft[1], floorBottomRight[0], floorTopLeft[1]]}
                stroke="#8fc4df"
                strokeWidth={2}
              />
              <Line
                points={[boardTop[0], boardTop[1], boardBottom[0], boardBottom[1]]}
                stroke="#f1ead4"
                strokeWidth={3}
              />

              {OFFICE_SLOTS.map((office) => {
                const [x, y] = toRadar(office.deskX, office.deskZ);
                return (
                  <Rect
                    key={office.id}
                    x={x - scale * 1.8}
                    y={y - scale * 1.1}
                    width={scale * 3.6}
                    height={scale * 2.2}
                    fill="#555d56"
                    stroke="#b8beb9"
                    strokeWidth={0.7}
                  />
                );
              })}

              {DESK_STATIONS.map((desk) => {
                const [x, y] = toRadar(desk.deskX, desk.deskZ);
                return (
                  <Rect
                    key={desk.id}
                    x={x - scale * 0.75}
                    y={y - scale * 0.35}
                    width={scale * 1.5}
                    height={scale * 0.7}
                    fill="#333a35"
                  />
                );
              })}

              <Circle
                x={toRadar(0, 0)[0]}
                y={toRadar(0, 0)[1]}
                radius={2.5 * scale}
                fill="#535b55"
                stroke="#c3c9c4"
                strokeWidth={0.8}
              />

              {live.remotes.map((remote) => {
                const [x, y] = toRadar(remote.x, remote.z);
                return (
                  <Circle
                    key={remote.id}
                    x={x}
                    y={y}
                    radius={3.4}
                    fill="#59a8e6"
                    stroke="#d7efff"
                    strokeWidth={0.8}
                  />
                );
              })}
            </Group>

            <Circle
              x={center}
              y={center}
              radius={5.2}
              fill="#f4f4ef"
              stroke="#111"
              strokeWidth={1.4}
            />
            <Line
              points={[center, center - 10, center - 4.5, center + 4, center, center + 1.5, center + 4.5, center + 4]}
              closed
              fill="#f4f4ef"
              stroke="#111"
              strokeWidth={1}
            />

            <Circle
              x={northX}
              y={northY}
              radius={8}
              fill="rgba(4, 6, 5, 0.78)"
            />
            <Text
              x={northX - 4}
              y={northY - 6}
              text="N"
              fill="#ffffff"
              fontFamily="Arial"
              fontStyle="bold"
              fontSize={11}
            />
          </Layer>
        </Stage>
      </div>
    </aside>
  );
}
