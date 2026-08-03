import { useEffect, useState, type CSSProperties, type FormEvent } from "react";

interface ActionResult {
  success: boolean;
  message?: string;
}

interface StickyNoteAnchor {
  /** Screen-relative [0,1] position of the board spot this note is being written for — see stickyWallBoardProjection.ts. */
  xRatio: number;
  yRatio: number;
}

interface StickyNoteEditorProps {
  initialText: string;
  anchor: StickyNoteAnchor | null;
  onClose: () => void;
  onSubmit: (text: string) => Promise<ActionResult>;
  onDelete: () => Promise<ActionResult>;
}

/**
 * The writing surface is an actual sticky note you type directly onto — no
 * separate dialog chrome, no category/sentiment picker, just plain text.
 * The camera has already cut to an in-world view of the board (see App.tsx's
 * enterStickyWallCamera); this sits on top of that as the one small piece of
 * unavoidable HTML (there's no in-world virtual keyboard to type with). It
 * pops in right where the player clicked to place it (anchor), so writing
 * feels like conjuring the note into existence on the spot they chose.
 */
export function StickyNoteEditor({ initialText, anchor, onClose, onSubmit, onDelete }: StickyNoteEditorProps) {
  const [text, setText] = useState(initialText);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isEditingExisting = initialText.length > 0;

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!text.trim() || busy || deleting) return;
    setBusy(true);
    const result = await onSubmit(text.trim());
    setBusy(false);
    // On success the caller hides this editor and shows the board instead
    // (see App.tsx's handleStickyNoteSubmit) — only failures stay visible
    // here, so the note can be fixed and resubmitted in place.
    if (!result.success) {
      setStatusMessage(result.message || "Could not post your note.");
    }
  };

  const handleDelete = async (): Promise<void> => {
    if (busy || deleting) return;
    setDeleting(true);
    const result = await onDelete();
    setDeleting(false);
    // Same as a successful post — the caller hides this editor on success.
    if (!result.success) {
      setStatusMessage(result.message || "Could not delete your note.");
    }
  };

  const anchorStyle = anchor
    ? ({
        "--sticky-note-writer-x": `${anchor.xRatio * 100}%`,
        "--sticky-note-writer-y": `${anchor.yRatio * 100}%`,
      } as CSSProperties)
    : undefined;

  return (
    <div className="sticky-note-writer" style={anchorStyle}>
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
          <button className="sticky-note-writer__post" type="submit" disabled={busy || deleting}>
            {isEditingExisting ? "Update" : "Post"}
          </button>
          {isEditingExisting && (
            <button
              className="sticky-note-writer__delete"
              type="button"
              onClick={handleDelete}
              disabled={busy || deleting}
            >
              Delete
            </button>
          )}
          <button className="sticky-note-writer__close" type="button" onClick={onClose}>
            Esc
          </button>
        </div>
      </form>
      {statusMessage && <p className="sticky-note-writer__status">{statusMessage}</p>}
    </div>
  );
}
