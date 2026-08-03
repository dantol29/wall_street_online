import { useEffect, useRef } from "react";
import { Vec3, type Entity as PcEntity } from "playcanvas";
import { getDeskMonitorScreenWorldCorners } from "../game/scene/deskMonitor";
import { rectangleToQuadMatrix3d } from "./projectiveTransform";

interface HyperliquidTerminalProps {
  player: PcEntity | null;
  deskId: string;
  interactive: boolean;
  onClose: () => void;
}

const HYPERLIQUID_TRADE_URL = "https://app.hyperliquid.xyz/trade";
const TERMINAL_WIDTH = 1440;
const TERMINAL_HEIGHT = 870.5;
const LOCAL_CAMERA_ENTITY_NAME = "local-camera";

/**
 * Live HyperLiquid DOM projected onto the physical monitor. Keeping the site
 * as an iframe is what makes it genuinely interactive; the projective CSS
 * transform makes that browser surface follow the four 3D screen corners.
 */
export function HyperliquidTerminal({
  player,
  deskId,
  interactive,
  onClose,
}: HyperliquidTerminalProps) {
  const screenRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const screen = screenRef.current;
    const cameraEntity = player?.findByName(LOCAL_CAMERA_ENTITY_NAME) as PcEntity | null;
    const camera = cameraEntity?.camera;
    const worldCorners = getDeskMonitorScreenWorldCorners(deskId);
    if (!screen || !cameraEntity || !camera || !worldCorners) return;

    let animationFrame = 0;
    const center = new Vec3();
    const toScreen = new Vec3();

    const updateProjection = (): void => {
      center.set(0, 0, 0);
      for (const corner of worldCorners) center.add(corner);
      center.mulScalar(1 / worldCorners.length);
      toScreen.sub2(center, cameraEntity.getPosition());

      const canvasBounds =
        camera.system.app.graphicsDevice.canvas.getBoundingClientRect();
      const facingScreen = cameraEntity.forward.dot(toScreen) > 0;
      const projected = worldCorners.map((corner) => {
        const point = camera.worldToScreen(corner);
        return {
          x: point.x + canvasBounds.left,
          y: point.y + canvasBounds.top,
        };
      });
      const signedArea = projected.reduce((sum, point, index) => {
        const next = projected[(index + 1) % projected.length];
        return sum + point.x * next.y - next.x * point.y;
      }, 0);
      const visible =
        facingScreen &&
        Math.abs(signedArea) > 100 &&
        projected.some(
          ({ x, y }) =>
            x >= canvasBounds.left - 100 &&
            x <= canvasBounds.right + 100 &&
            y >= canvasBounds.top - 100 &&
            y <= canvasBounds.bottom + 100,
        );
      const matrix = visible
        ? rectangleToQuadMatrix3d(
            TERMINAL_WIDTH,
            TERMINAL_HEIGHT,
            projected as [
              { x: number; y: number },
              { x: number; y: number },
              { x: number; y: number },
              { x: number; y: number },
            ],
          )
        : null;

      screen.style.visibility = matrix ? "visible" : "hidden";
      if (matrix) screen.style.transform = matrix;
      animationFrame = window.requestAnimationFrame(updateProjection);
    };

    animationFrame = window.requestAnimationFrame(updateProjection);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [deskId, player]);

  return (
    <div
      className={`hyperliquid-terminal${interactive ? " hyperliquid-terminal--interactive" : ""}`}
      aria-label="HyperLiquid trading terminal"
    >
      <div
        ref={screenRef}
        className="hyperliquid-terminal__screen"
        style={{ width: TERMINAL_WIDTH, height: TERMINAL_HEIGHT }}
      >
        <iframe
          src={HYPERLIQUID_TRADE_URL}
          title="HyperLiquid"
          tabIndex={interactive ? 0 : -1}
          allow="clipboard-read; clipboard-write; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
        />
        <div className="hyperliquid-terminal__glass" aria-hidden="true" />
      </div>
      {interactive && (
        <button type="button" className="hyperliquid-terminal__exit" onClick={onClose}>
          Done
        </button>
      )}
    </div>
  );
}
