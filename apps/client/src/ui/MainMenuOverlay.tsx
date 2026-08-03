interface MainMenuOverlayProps {
  visible: boolean;
  /** True until the game-server connection completes — surfaced as a status line, not a gate (entering doesn't require it to finish first, same as before this menu existed). */
  connecting: boolean;
  onEnter: () => void;
}

const CONTROLS = [
  { key: "WASD", label: "Move" },
  { key: "Mouse", label: "Look around" },
  { key: "E", label: "Interact" },
  { key: "Enter", label: "Chat" },
];

/**
 * The first thing a player sees. Purely an HTML/CSS overlay above the canvas
 * (like every other UI surface in this app — chat, voice, wallet, the sticky
 * note editor) rather than PlayCanvas's own in-engine Screen/Element UI,
 * which would need a loaded bitmap font asset this project doesn't have for
 * no benefit here (a flat pre-game menu doesn't need to live in 3D space).
 * Clicking anywhere dismisses it, same as the old bare "click to enter"
 * prompt this replaces — the styled button is just a clearer affordance.
 */
export function MainMenuOverlay({ visible, connecting, onEnter }: MainMenuOverlayProps) {
  if (!visible) return null;

  return (
    <div className="main-menu" onClick={onEnter}>
      <div className="main-menu__panel">
        <p className="main-menu__eyebrow">MULTIPLAYER TRADING FLOOR</p>
        <h1 className="main-menu__title">WALL STREET ONLINE</h1>

        <div className="main-menu__controls">
          {CONTROLS.map((control) => (
            <div className="main-menu__control" key={control.key}>
              <kbd>{control.key}</kbd>
              <span>{control.label}</span>
            </div>
          ))}
        </div>

        <button type="button" className="main-menu__play">
          {connecting ? "Connecting…" : "Enter the Floor"}
        </button>

        <p className="main-menu__hint">
          <span className="main-menu__hint-desktop">or click anywhere to enter</span>
          <span className="main-menu__hint-touch">or tap anywhere to enter</span>
        </p>
      </div>
    </div>
  );
}
