import { useState, type FormEvent } from "react";

interface ActionResult {
  success: boolean;
  message?: string;
}

interface SetDisplayNameModalProps {
  onSubmit: (displayName: string) => Promise<ActionResult>;
}

/**
 * Mandatory — every trader (a wallet-linked player) has to choose a real
 * name the first time they ever link a wallet (see
 * `WalletLinkResultMessage.needsDisplayName`); guests never see this, they
 * keep their random "Trader-XXXX" tag. Deliberately has no close/skip
 * affordance: no backdrop click, no Escape handler, nothing to dismiss it
 * except a successful submit.
 */
export function SetDisplayNameModal({ onSubmit }: SetDisplayNameModalProps) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setErrorMessage(null);
    const result = await onSubmit(trimmed);
    setBusy(false);
    if (!result.success) {
      setErrorMessage(result.message || "Could not set your name.");
    }
  };

  return (
    <div className="set-name-modal">
      <form className="set-name-modal__panel" onSubmit={handleSubmit}>
        <p className="set-name-modal__eyebrow">WELCOME TO THE FLOOR</p>
        <h2 className="set-name-modal__title">Choose your trader name</h2>
        <p className="set-name-modal__hint">Other traders will see this name above your head.</p>
        <input
          autoFocus
          className="set-name-modal__input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Alex Chen"
          maxLength={24}
        />
        <button type="submit" className="set-name-modal__submit" disabled={busy || !name.trim()}>
          {busy ? "Saving…" : "Confirm"}
        </button>
        {errorMessage && <p className="set-name-modal__error">{errorMessage}</p>}
      </form>
    </div>
  );
}
