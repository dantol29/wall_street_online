import { useEffect, useState, type FormEvent } from "react";

interface ActionResult {
  success: boolean;
  message?: string;
}

interface StickyNoteEditorProps {
  initialText: string;
  onClose: () => void;
  onSubmit: (text: string) => Promise<ActionResult>;
}

/**
 * The writing surface is an actual sticky note you type directly onto — no
 * separate dialog chrome, no category/sentiment picker, just plain text.
 * The camera has already cut to an in-world view of the board (see App.tsx's
 * enterStickyWallCamera); this sits on top of that as the one small piece of
 * unavoidable HTML (there's no in-world virtual keyboard to type with).
 */
export function StickyNoteEditor({ initialText, onClose, onSubmit }: StickyNoteEditorProps) {
  const [text, setText] = useState(initialText);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    const result = await onSubmit(text.trim());
    setBusy(false);
    setStatusMessage(result.success ? "Posted!" : result.message || "Could not post your note.");
  };

  return (
    <div className="sticky-note-writer">
      <form className="sticky-note-writer__sticker" onSubmit={handleSubmit}>
        <textarea
          autoFocus
          className="sticky-note-writer__textarea"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Write something..."
          maxLength={80}
        />
        <div className="sticky-note-writer__actions">
          <button className="sticky-note-writer__post" type="submit" disabled={busy}>
            {initialText ? "Update" : "Post"}
          </button>
          <button className="sticky-note-writer__close" type="button" onClick={onClose}>
            Esc
          </button>
        </div>
      </form>
      {statusMessage && <p className="sticky-note-writer__status">{statusMessage}</p>}
    </div>
  );
}
