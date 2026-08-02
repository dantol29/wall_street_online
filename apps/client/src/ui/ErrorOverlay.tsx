interface ErrorOverlayProps {
  message: string | null;
  onRetry: () => void;
}

export function ErrorOverlay({ message, onRetry }: ErrorOverlayProps) {
  if (!message) return null;

  return (
    <div className="error-overlay">
      <div className="error-overlay__message">{message}</div>
      <button className="error-overlay__retry" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}
