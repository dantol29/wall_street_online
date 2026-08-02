import { useEffect, useState, type FormEvent } from "react";

export interface OfficeWatchlistItemInput {
  symbol: string;
  note: string;
}

export interface OfficeVisitorBookEntryView {
  visitorDisplayName: string;
  message: string;
  createdAt: number;
}

interface ActionResult {
  success: boolean;
  message?: string;
}

interface OfficeEditorProps {
  /** "own" shows thesis/watchlist editing; "visit" shows only a visitor-book sign form — mirrors the E-key affordance split in App.tsx (manage your own office vs. sign someone else's). */
  mode: "own" | "visit";
  ownerDisplayName: string | null;
  initialThesis: string | null;
  initialWatchlist: OfficeWatchlistItemInput[];
  visitorBook: OfficeVisitorBookEntryView[];
  onClose: () => void;
  onPublishThesis: (body: string) => Promise<ActionResult>;
  onUpdateWatchlist: (items: OfficeWatchlistItemInput[]) => Promise<ActionResult>;
  onSignVisitorBook: (message: string) => Promise<ActionResult>;
}

const MAX_WATCHLIST_ITEMS = 15;

export function OfficeEditor({
  mode,
  ownerDisplayName,
  initialThesis,
  initialWatchlist,
  visitorBook,
  onClose,
  onPublishThesis,
  onUpdateWatchlist,
  onSignVisitorBook,
}: OfficeEditorProps) {
  const [thesis, setThesis] = useState(initialThesis ?? "");
  const [watchlist, setWatchlist] = useState<OfficeWatchlistItemInput[]>(initialWatchlist);
  const [visitorMessage, setVisitorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const handlePublishThesis = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!thesis.trim() || busy) return;
    setBusy(true);
    const result = await onPublishThesis(thesis.trim());
    setBusy(false);
    setStatusMessage(result.success ? "Thesis published." : result.message || "Could not publish thesis.");
  };

  const handleWatchlistItemChange = (index: number, field: "symbol" | "note", value: string): void => {
    setWatchlist((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  };

  const handleAddWatchlistItem = (): void => {
    if (watchlist.length >= MAX_WATCHLIST_ITEMS) return;
    setWatchlist((prev) => [...prev, { symbol: "", note: "" }]);
  };

  const handleRemoveWatchlistItem = (index: number): void => {
    setWatchlist((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveWatchlist = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (busy) return;
    const cleaned = watchlist
      .map((item) => ({ symbol: item.symbol.trim(), note: item.note.trim() }))
      .filter((item) => item.symbol.length > 0);
    setBusy(true);
    const result = await onUpdateWatchlist(cleaned);
    setBusy(false);
    setStatusMessage(result.success ? "Watchlist updated." : result.message || "Could not update watchlist.");
  };

  const handleSignVisitorBook = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!visitorMessage.trim() || busy) return;
    setBusy(true);
    const result = await onSignVisitorBook(visitorMessage.trim());
    setBusy(false);
    if (result.success) setVisitorMessage("");
    setStatusMessage(result.success ? "Signed!" : result.message || "Could not sign the visitor book.");
  };

  const title = mode === "own" ? "Your office" : `${ownerDisplayName ?? "Trader"}'s office`;

  return (
    <div className="plan-editor-backdrop">
      <section className="plan-editor" role="dialog" aria-modal="true" aria-labelledby="office-editor-title">
        <header className="plan-editor__header">
          <div>
            <p className="plan-editor__eyebrow">OFFICE{mode === "visit" ? " · VISITING" : ""}</p>
            <h1 id="office-editor-title">{title}</h1>
          </div>
          <button className="plan-editor__stand" type="button" onClick={onClose}>
            Leave <kbd>Esc</kbd>
          </button>
        </header>

        {mode === "own" && (
          <>
            <form className="plan-editor__form" onSubmit={handlePublishThesis}>
              <label className="plan-field plan-field--wide">
                <span>Published thesis</span>
                <textarea
                  autoFocus
                  value={thesis}
                  onChange={(event) => setThesis(event.target.value)}
                  placeholder="What's your current market view?"
                  rows={4}
                  maxLength={2000}
                />
              </label>
              <footer className="plan-editor__footer">
                <button className="plan-editor__save" type="submit" disabled={busy}>
                  Publish thesis
                </button>
              </footer>
            </form>

            <form className="plan-editor__form" onSubmit={handleSaveWatchlist}>
              <div className="office-editor__watchlist">
                <span>Watchlist</span>
                {watchlist.map((item, index) => (
                  <div className="office-editor__watchlist-row" key={index}>
                    <input
                      value={item.symbol}
                      onChange={(event) => handleWatchlistItemChange(index, "symbol", event.target.value.toUpperCase())}
                      placeholder="BTC"
                      maxLength={20}
                    />
                    <input
                      value={item.note}
                      onChange={(event) => handleWatchlistItemChange(index, "note", event.target.value)}
                      placeholder="Note (optional)"
                      maxLength={140}
                    />
                    <button type="button" onClick={() => handleRemoveWatchlistItem(index)} aria-label="Remove symbol">
                      ×
                    </button>
                  </div>
                ))}
                {watchlist.length < MAX_WATCHLIST_ITEMS && (
                  <button type="button" className="office-editor__add-row" onClick={handleAddWatchlistItem}>
                    + Add symbol
                  </button>
                )}
              </div>
              <footer className="plan-editor__footer">
                <button className="plan-editor__save" type="submit" disabled={busy}>
                  Save watchlist
                </button>
              </footer>
            </form>
          </>
        )}

        {mode === "visit" && (
          <form className="plan-editor__form" onSubmit={handleSignVisitorBook}>
            <label className="plan-field plan-field--wide">
              <span>Leave a message</span>
              <input
                autoFocus
                value={visitorMessage}
                onChange={(event) => setVisitorMessage(event.target.value)}
                placeholder="Great macro board!"
                maxLength={200}
              />
            </label>
            <footer className="plan-editor__footer">
              <button className="plan-editor__save" type="submit" disabled={busy}>
                Sign visitor book
              </button>
            </footer>
          </form>
        )}

        {statusMessage && <p className="office-editor__status">{statusMessage}</p>}

        {visitorBook.length > 0 && (
          <aside className="plan-editor__recent office-editor__visitor-book" aria-label="Visitor book">
            <span>VISITOR BOOK</span>
            {visitorBook.map((entry, index) => (
              <div key={index}>
                <strong>{entry.visitorDisplayName}</strong>
                <span>{entry.message}</span>
              </div>
            ))}
          </aside>
        )}
      </section>
    </div>
  );
}
