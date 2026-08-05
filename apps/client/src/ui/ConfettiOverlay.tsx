import { useMemo } from "react";

const CONFETTI_COLORS = ["#65d88b", "#ffd76a", "#ff8c7a", "#8be8a8", "#f1e7c7"];
const PIECE_COUNT = 60;

/**
 * A cheap CSS-only confetti burst for the bell ceremony's winner reveal —
 * deliberately not a PlayCanvas particle system (no such system is used
 * anywhere else in this game yet, and a DOM overlay is enough for a
 * few-second celebratory flourish). Purely decorative: `pointer-events: none`
 * throughout, never blocks input.
 */
export function ConfettiOverlay() {
  const pieces = useMemo(
    () =>
      Array.from({ length: PIECE_COUNT }, (_, index) => ({
        id: index,
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        duration: 2.2 + Math.random() * 1.4,
        color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
        rotate: Math.random() * 360,
      })),
    [],
  );

  return (
    <div className="confetti-overlay" aria-hidden="true">
      {pieces.map((piece) => (
        <span
          key={piece.id}
          className="confetti-overlay__piece"
          style={{
            left: `${piece.left}%`,
            animationDelay: `${piece.delay}s`,
            animationDuration: `${piece.duration}s`,
            backgroundColor: piece.color,
            transform: `rotate(${piece.rotate}deg)`,
          }}
        />
      ))}
    </div>
  );
}
