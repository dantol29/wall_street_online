interface EnterGameOverlayProps {
  visible: boolean;
  onEnter: () => void;
}

export function EnterGameOverlay({ visible, onEnter }: EnterGameOverlayProps) {
  if (!visible) return null;

  return (
    <div className="enter-overlay" onClick={onEnter}>
      <div className="enter-overlay__prompt">Click to enter</div>
    </div>
  );
}
