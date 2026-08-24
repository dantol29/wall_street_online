import { useEffect, useRef } from "react";
import { Entity } from "@playcanvas/react";
import { Render } from "@playcanvas/react/components";
import { useApp, useMaterial } from "@playcanvas/react/hooks";
import { Vec3, type Entity as PcEntity } from "playcanvas";
import { useCoinLogoMaterial } from "../scene/TokenMonitor";

export interface PlayerTokenThrowVisual {
  id: number;
  triggeredBy: string;
  targetSessionId: string;
  ticker: string;
  logoUrl: string;
}

interface PlayerTokenProjectileProps {
  event: PlayerTokenThrowVisual | null;
  localSessionId: string | null;
}

const THROW_DURATION_MS = 560;

export function PlayerTokenProjectile({ event, localSessionId }: PlayerTokenProjectileProps) {
  const app = useApp();
  const coinRef = useRef<PcEntity | null>(null);
  const bodyMaterial = useMaterial({ diffuse: "#303234", gloss: 0.34, metalness: 0.5 });
  const logoMaterial = useCoinLogoMaterial(event?.logoUrl ?? "/assets/token-logos/hype.svg", `player-thrown-token-${event?.logoUrl ?? "hype"}`);

  useEffect(() => {
    const coin = coinRef.current;
    if (!event || !coin || !localSessionId) return;
    const entityFor = (sessionId: string) => app.root.findByName(
      sessionId === localSessionId ? "local-player" : `remote-${sessionId}`,
    ) as PcEntity | null;
    const source = entityFor(event.triggeredBy);
    const target = entityFor(event.targetSessionId);
    if (!source || !target) return;

    const start = source.getPosition().clone().add(new Vec3(0, 0.76, 0));
    const end = target.getPosition().clone().add(new Vec3(0, 0.78, 0));
    coin.enabled = true;
    coin.setPosition(start);
    coin.setLocalScale(0.72, 0.72, 0.72);
    let frame = 0;
    const startedAt = performance.now();
    const position = new Vec3();
    const tick = (now: number) => {
      const t = Math.min((now - startedAt) / THROW_DURATION_MS, 1);
      const eased = t * t * (3 - 2 * t);
      position.lerp(start, end, eased);
      position.y += Math.sin(Math.PI * t) * 0.2;
      coin.setPosition(position);
      coin.setLocalEulerAngles(0, t * 135, 0);
      const impactScale = t > 0.88 ? 1 - ((t - 0.88) / 0.12) * 0.28 : Math.min(1, 0.72 + t * 2.5);
      coin.setLocalScale(impactScale, impactScale, impactScale);
      if (t < 1) {
        frame = requestAnimationFrame(tick);
        return;
      }
      coin.enabled = false;
      const listener = app.root.findByName("local-player") as PcEntity | null;
      const distance = listener ? listener.getPosition().distance(end) : 10;
      const audio = new Audio("/assets/audio/terminal/transaction-click.wav");
      audio.volume = Math.max(0, 0.14 * (1 - distance / 14));
      if (audio.volume > 0.01) void audio.play().catch(() => undefined);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      coin.enabled = false;
    };
  }, [app, event, localSessionId]);

  return (
    <Entity ref={coinRef} enabled={false}>
      <Entity rotation={[90, 0, 0]} scale={[0.105, 0.018, 0.105]}>
        <Render type="cylinder" material={bodyMaterial} />
      </Entity>
      {logoMaterial && (
        <>
          <Entity position={[0, 0, 0.011]} rotation={[90, 0, 0]} scale={[0.092, 1, 0.092]}>
            <Render type="plane" material={logoMaterial} />
          </Entity>
          <Entity position={[0, 0, -0.011]} rotation={[-90, 0, 0]} scale={[0.092, 1, 0.092]}>
            <Render type="plane" material={logoMaterial} />
          </Entity>
        </>
      )}
    </Entity>
  );
}
