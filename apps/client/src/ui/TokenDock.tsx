import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { getDockIconSize } from "./dockScale";
import { getVisibleArcSlots, rotateArcIndex } from "./arcSelection";

export interface DockToken {
  id: string;
  symbol: string;
  logo: string;
}

interface TokenDockProps {
  tokens: DockToken[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  active: boolean;
  onSelect?: (token: DockToken) => void;
}

const ICON_SIZE = 64;
const ICON_MAGNIFICATION = 104;
const ICON_SPACING = 78;
const FALLOFF_DISTANCE = ICON_SPACING * 2.2;
const SPRING_TRANSITION = { type: "spring" as const, stiffness: 150, damping: 12, mass: 0.1 };
/** How many tokens show on each side of the active one — the rest scroll into view as you navigate instead of cramming the whole row on screen. */
const VISIBLE_RADIUS = 2;

/**
 * Mac-dock-style row: the standard version magnifies whichever icon the
 * mouse cursor is nearest, but the game keeps pointer lock engaged while
 * playing (mouse moves the camera, there's no free OS cursor to hover
 * with) — so the same spring-magnify curve is driven by the *selected*
 * index instead, via Left/Right or the chevrons. Only a window of tokens
 * around the active one renders at a time — the rest scroll into view as
 * you navigate. See dockScale.ts for the falloff math and arcSelection.ts
 * for the windowing/wraparound stepping.
 */
export function TokenDock({ tokens, activeIndex, onActiveIndexChange, active, onSelect }: TokenDockProps) {
  useEffect(() => {
    if (!active || tokens.length === 0) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "ArrowLeft") {
        onActiveIndexChange(rotateArcIndex(activeIndex, tokens.length, -1));
      } else if (event.code === "ArrowRight") {
        onActiveIndexChange(rotateArcIndex(activeIndex, tokens.length, 1));
      } else if (event.code === "Enter" || event.code === "NumpadEnter") {
        event.preventDefault();
        onSelect?.(tokens[activeIndex]);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, activeIndex, tokens, onActiveIndexChange, onSelect]);

  const isOpen = active && tokens.length > 0;

  return (
    <div className="token-dock-panel" aria-label="Token picker">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="token-dock-panel__inner"
            initial={{ y: 160 }}
            animate={{ y: 0, transition: { duration: 0.22, ease: "easeOut" } }}
            exit={{ y: 160, transition: { duration: 0.24, ease: "easeIn" } }}
          >
          <div className="token-dock__label">{tokens[activeIndex].symbol}</div>
          <div className="token-dock__row">
            <button
              type="button"
              className="token-dock__nav"
              onClick={() => onActiveIndexChange(rotateArcIndex(activeIndex, tokens.length, -1))}
              aria-label="Previous token"
            >
              <ChevronIcon direction="left" />
            </button>

            <div className="token-dock">
              <AnimatePresence mode="popLayout">
                {getVisibleArcSlots(tokens, activeIndex, VISIBLE_RADIUS).map((slot) => {
                  const distance = slot.offset * ICON_SPACING;
                  const dimension = getDockIconSize(distance, ICON_SIZE, ICON_MAGNIFICATION, FALLOFF_DISTANCE);
                  const isActive = slot.offset === 0;
                  return (
                    <motion.button
                      key={slot.item.id}
                      type="button"
                      layout
                      className="token-dock__icon"
                      initial={{ width: ICON_SIZE, height: ICON_SIZE, opacity: 0, scale: 0.6 }}
                      animate={{ width: dimension, height: dimension, opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.6 }}
                      transition={SPRING_TRANSITION}
                      onClick={() => onActiveIndexChange(slot.index)}
                      aria-current={isActive}
                    >
                      <img src={slot.item.logo} alt={slot.item.symbol} draggable={false} />
                    </motion.button>
                  );
                })}
              </AnimatePresence>
            </div>

            <button
              type="button"
              className="token-dock__nav"
              onClick={() => onActiveIndexChange(rotateArcIndex(activeIndex, tokens.length, 1))}
              aria-label="Next token"
            >
              <ChevronIcon direction="right" />
            </button>
          </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Thin-stroke chevron matching SF Symbols' `chevron.left`/`chevron.right`, rather than a bold monospace glyph. */
function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  const points = direction === "left" ? "14,5 7,12 14,19" : "7,5 14,12 7,19";
  return (
    <svg width="13" height="18" viewBox="0 0 20 24" fill="none" aria-hidden="true">
      <polyline
        points={points}
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
