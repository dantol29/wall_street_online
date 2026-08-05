import { useEffect, useRef } from "react";
import { useApp, useAppEvent } from "@playcanvas/react/hooks";
import { Vec3, type Entity } from "playcanvas";
import { NAME_LABEL_MAX_DISTANCE_METERS, type ChatMessage } from "@multiplayer/shared";
import { getVisualTransform } from "../multiplayer/interpolation";
import type { RemotePlayerRecord } from "./remotePlayerRecord";

const UPDATE_INTERVAL_MS = 1000 / 12;
const LOCAL_CAMERA_ENTITY_NAME = "local-camera";
/** A bit above the name/PnL billboard (see PlayerLabelBillboard's own LABEL_HEIGHT_ABOVE_ORIGIN) so the two never overlap. */
const BUBBLE_HEIGHT_ABOVE_ORIGIN = 1.35;
const BUBBLE_DURATION_MS = 6000;

interface ChatBubbleState {
  expiresAt: number;
}

interface ChatBubblesOverlayProps {
  messages: ChatMessage[];
  recordsRef: React.RefObject<Map<string, RemotePlayerRecord>>;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Transient speech-bubble DOM labels over a remote player's head when they
 * send a chat message — a plain DOM sibling of the canvas, positioned via
 * imperative screen-space projection, unlike the name/PnL billboard (see
 * PlayerLabelBillboard.tsx), which is real in-world geometry. Kept as a DOM
 * overlay here since it's transient/rare (one short-lived bubble at a time
 * per sender) rather than a persistent per-player fixture — not worth a
 * canvas-texture entity that would mostly sit unused.
 * Your own messages are skipped implicitly, not by filtering: `recordsRef`
 * only ever tracks *other* players, so looking up the local session id here
 * simply finds no record to position a bubble against.
 */
export function ChatBubblesOverlay({ messages, recordsRef, containerRef }: ChatBubblesOverlayProps) {
  const app = useApp();
  const nodesRef = useRef(new Map<string, HTMLDivElement>());
  const bubblesRef = useRef(new Map<string, ChatBubbleState>());
  const processedCountRef = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const newMessages = messages.slice(processedCountRef.current);
    processedCountRef.current = messages.length;

    for (const message of newMessages) {
      if (!recordsRef.current.has(message.senderId)) continue;

      bubblesRef.current.set(message.senderId, { expiresAt: Date.now() + BUBBLE_DURATION_MS });

      let node = nodesRef.current.get(message.senderId);
      if (!node) {
        node = document.createElement("div");
        node.className = "chat-bubble";
        container.appendChild(node);
        nodesRef.current.set(message.senderId, node);
      }
      node.textContent = message.text;
    }
  }, [messages, containerRef, recordsRef]);

  useEffect(() => {
    const nodes = nodesRef.current;
    const bubbles = bubblesRef.current;
    return () => {
      nodes.forEach((node) => node.remove());
      nodes.clear();
      bubbles.clear();
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

    for (const [sessionId, bubble] of [...bubblesRef.current]) {
      if (now >= bubble.expiresAt) {
        bubblesRef.current.delete(sessionId);
        nodesRef.current.get(sessionId)?.remove();
        nodesRef.current.delete(sessionId);
        continue;
      }

      const node = nodesRef.current.get(sessionId);
      const record = recordsRef.current.get(sessionId);
      if (!node || !record) continue;

      const visual = getVisualTransform(record.transform, now, UPDATE_INTERVAL_MS);
      const bubblePosition = new Vec3(visual.x, visual.y + BUBBLE_HEIGHT_ABOVE_ORIGIN, visual.z);

      const toBubble = new Vec3().sub2(bubblePosition, cameraPosition);
      const isInFrontOfCamera = toBubble.dot(cameraForward) > 0;
      const distance = toBubble.length();

      if (!isInFrontOfCamera || distance > NAME_LABEL_MAX_DISTANCE_METERS) {
        node.style.display = "none";
        continue;
      }

      const screenPosition = cameraComponent.worldToScreen(bubblePosition);
      node.style.display = "block";
      node.style.transform = `translate(-50%, -100%) translate(${screenPosition.x * scaleX}px, ${screenPosition.y * scaleY}px)`;
    }
  });

  return null;
}
