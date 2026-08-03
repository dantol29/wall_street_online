interface EnterGameOverlayProps {
  visible: boolean;
  onEnter: () => void;
}

export function EnterGameOverlay({ visible, onEnter }: EnterGameOverlayProps) {
  if (!visible) return null;

  return (
    <div className="enter-overlay" onClick={onEnter}>
      <div className="enter-overlay__prompt">
        <span className="enter-overlay__desktop-label">Click to enter</span>
        <span className="enter-overlay__touch-label">Tap to enter</span>
      </div>
    </div>
  );
}
