import { useEffect, useRef } from "react";
import { useApp, useAppEvent } from "@playcanvas/react/hooks";
import { Vec3, type Entity } from "playcanvas";
import { NAME_LABEL_MAX_DISTANCE_METERS } from "@multiplayer/shared";
import { getVisualTransform } from "../multiplayer/interpolation";
import type { RemotePlayerRecord } from "./remotePlayerRecord";

const UPDATE_INTERVAL_MS = 1000 / 12;
const LOCAL_CAMERA_ENTITY_NAME = "local-camera";
/**
 * The server-reported Y mirrors the sender's capsule-center origin (half-height
 * 1.0 above the floor at rest), not their feet, so this only needs to clear the
 * ~0.8m from that origin to just above a ~1.8m-tall character's head.
 */
const LABEL_HEIGHT_ABOVE_ORIGIN = 1.0;

interface NameLabelsOverlayProps {
  remoteIds: string[];
  recordsRef: React.RefObject<Map<string, RemotePlayerRecord>>;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Renders name tags as plain DOM elements positioned via camera screen-space
 * projection, imperatively (bypassing React state) since this runs every frame.
 * This lives inside the PlayCanvas tree only to get `useApp`/`useAppEvent`
 * access — it renders no PlayCanvas entities itself, only mutates DOM nodes
 * inside `containerRef`, which is a plain HTML sibling of the <Application>
 * canvas declared in App.tsx. Avoids PlayCanvas's world-space Text Element,
 * which requires a pre-built SDF font asset we don't have.
 */
export function NameLabelsOverlay({ remoteIds, recordsRef, containerRef }: NameLabelsOverlayProps) {
  const app = useApp();
  const nodesRef = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    for (const [id, node] of nodesRef.current) {
      if (!remoteIds.includes(id)) {
        node.remove();
        nodesRef.current.delete(id);
      }
    }

    for (const id of remoteIds) {
      if (nodesRef.current.has(id)) continue;
      const node = document.createElement("div");
      node.className = "name-label";
      node.textContent = recordsRef.current.get(id)?.displayName ?? "";
      container.appendChild(node);
      nodesRef.current.set(id, node);
    }
  }, [remoteIds, containerRef, recordsRef]);

  useEffect(() => {
    const nodes = nodesRef.current;
    return () => {
      nodes.forEach((node) => node.remove());
      nodes.clear();
    };
  }, []);

  useAppEvent("update", () => {
    const canvas = app.graphicsDevice.canvas;
    const cameraEntity = app.root.findByName(LOCAL_CAMERA_ENTITY_NAME) as Entity | null;
    const cameraComponent = cameraEntity?.camera;
    if (!cameraEntity || !cameraComponent) return;

    const cameraPosition = cameraEntity.getPosition();
    const cameraForward = cameraEntity.forward;
    const now = Date.now();

    const canvasRect = canvas.getBoundingClientRect();
    const scaleX = canvas.clientWidth > 0 ? canvasRect.width / canvas.width : 1;
    const scaleY = canvas.clientHeight > 0 ? canvasRect.height / canvas.height : 1;

    nodesRef.current.forEach((node, id) => {
      const record = recordsRef.current.get(id);
      if (!record) {
        node.style.display = "none";
        return;
      }

      const visual = getVisualTransform(record.transform, now, UPDATE_INTERVAL_MS);
      const headPosition = new Vec3(visual.x, visual.y + LABEL_HEIGHT_ABOVE_ORIGIN, visual.z);

      const toHead = new Vec3().sub2(headPosition, cameraPosition);
      const isInFrontOfCamera = toHead.dot(cameraForward) > 0;
      const distance = toHead.length();

      if (!isInFrontOfCamera || distance > NAME_LABEL_MAX_DISTANCE_METERS) {
        node.style.display = "none";
        return;
      }

      const screenPosition = cameraComponent.worldToScreen(headPosition);
      node.style.display = "block";
      node.style.transform = `translate(-50%, -100%) translate(${screenPosition.x * scaleX}px, ${screenPosition.y * scaleY}px)`;
    });
  });

  return null;
}
