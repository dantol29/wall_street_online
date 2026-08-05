import { useEffect, useState, type FormEvent } from "react";
import type { BellCycleSlot } from "@multiplayer/shared";

interface ActionResult {
  success: boolean;
  message?: string;
}

interface LaunchTokenModalProps {
  slots: BellCycleSlot[];
  onClose: () => void;
  onSubmit: (slotIndex: number, tokenName: string, ticker: string) => Promise<ActionResult>;
}

/**
 * Walk up to the trading pit + E opens this — pick an open slot, name your
 * token, launch it into the current Bell Podium cycle. Dismissible (unlike
 * SetDisplayNameModal): launching is optional and repeatable-by-anyone, not
 * a one-time mandatory identity step. Guests can open this to see what's
 * live, but the server rejects an actual launch attempt with a clear
 * "link a wallet" message shown inline, same as every other office/thesis
 * action in this game — no client-side wallet-linked check duplicated here.
 */
export function LaunchTokenModal({ slots, onClose, onSubmit }: LaunchTokenModalProps) {
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(null);
  const [tokenName, setTokenName] = useState("");
  const [ticker, setTicker] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (selectedSlotIndex === null || !tokenName.trim() || !ticker.trim() || busy) return;
    setBusy(true);
    setStatusMessage(null);
    const result = await onSubmit(selectedSlotIndex, tokenName.trim(), ticker.trim());
    setBusy(false);
    if (!result.success) {
      setStatusMessage(result.message || "Could not launch this token.");
    }
  };

  return (
    <div className="launch-token-modal">
      <div className="launch-token-modal__panel">
        <div className="launch-token-modal__header">
          <p className="launch-token-modal__eyebrow">THE TRADING PIT</p>
          <button className="launch-token-modal__close" type="button" onClick={onClose}>
            Esc
          </button>
        </div>
        <h2 className="launch-token-modal__title">Launch a token this cycle</h2>
        <p className="launch-token-modal__hint">
          Pick an open slot. Whoever's token has the highest simulated market cap when the bell rings gets to ring it.
        </p>

        <ul className="launch-token-modal__slots">
          {slots.map((slot) => {
            const isOpen = slot.ownerPlayerId === null;
            const isSelected = selectedSlotIndex === slot.slotIndex;
            return (
              <li key={slot.slotIndex}>
                <button
                  type="button"
                  className={`launch-token-modal__slot${isSelected ? " launch-token-modal__slot--selected" : ""}`}
                  disabled={!isOpen || busy}
                  onClick={() => setSelectedSlotIndex(slot.slotIndex)}
                >
                  {isOpen ? (
                    <span className="launch-token-modal__slot-open">Open slot #{slot.slotIndex + 1}</span>
                  ) : (
                    <span className="launch-token-modal__slot-taken">
                      ${slot.ticker} — {slot.tokenName} (by {slot.ownerDisplayName})
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        {selectedSlotIndex !== null && (
          <form className="launch-token-modal__form" onSubmit={handleSubmit}>
            <input
              autoFocus
              className="launch-token-modal__input"
              value={tokenName}
              onChange={(event) => setTokenName(event.target.value)}
              placeholder="Token name, e.g. Moon Coin"
              maxLength={24}
            />
            <input
              className="launch-token-modal__input launch-token-modal__input--ticker"
              value={ticker}
              onChange={(event) => setTicker(event.target.value.toUpperCase())}
              placeholder="MOON"
              maxLength={6}
            />
            <button
              type="submit"
              className="launch-token-modal__submit"
              disabled={busy || !tokenName.trim() || !ticker.trim()}
            >
              {busy ? "Launching…" : "Launch"}
            </button>
          </form>
        )}

        {statusMessage && <p className="launch-token-modal__error">{statusMessage}</p>}
      </div>
    </div>
  );
}
