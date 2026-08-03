interface HyperliquidTerminalProps {
  onClose: () => void;
}

const HYPERLIQUID_TRADE_URL = "https://app.hyperliquid.xyz/trade";

/**
 * A real cross-origin HyperLiquid browser surface. It opens over the current
 * seated view without moving the in-world camera.
 */
export function HyperliquidTerminal({ onClose }: HyperliquidTerminalProps) {
  return (
    <div className="hyperliquid-terminal" role="dialog" aria-label="HyperLiquid trading terminal">
      <div className="hyperliquid-terminal__screen">
        <iframe
          src={HYPERLIQUID_TRADE_URL}
          title="HyperLiquid"
          allow="clipboard-read; clipboard-write; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
        />
        <div className="hyperliquid-terminal__glass" aria-hidden="true" />
      </div>
      <button type="button" className="hyperliquid-terminal__exit" onClick={onClose}>
        Close terminal
      </button>
    </div>
  );
}
