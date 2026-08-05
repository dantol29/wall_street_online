import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { MAX_CHAT_LENGTH } from "@multiplayer/shared";

interface ChatProps {
  onSend: (text: string) => void;
  onFocusChange: (focused: boolean) => void;
  onHudChange: (focused: boolean, draft: string) => void;
  disabled?: boolean;
}

/**
 * Invisible text-entry bridge for the PlayCanvas chat HUD.
 *
 * Browsers require a real input element for keyboard layout, IME, accessibility,
 * and the mobile software keyboard. Nothing from this component is used to
 * render desktop chat: InGameChatHud paints messages and the draft into a
 * texture that PlayCanvas renders inside the game.
 */
export function Chat({ onSend, onFocusChange, onHudChange, disabled = false }: ChatProps) {
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    onFocusChange(focused);
    onHudChange(focused, draft);
  }, [draft, focused, onFocusChange, onHudChange]);

  useEffect(() => {
    const handleGlobalKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Enter" && !focused && !disabled) {
        event.preventDefault();
        setFocused(true);
        inputRef.current?.focus({ preventScroll: true });
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [disabled, focused]);

  useEffect(() => {
    if (!disabled) return;
    setDraft("");
    setFocused(false);
    inputRef.current?.blur();
  }, [disabled]);

  const submitDraft = (): void => {
    const trimmed = draft.trim();
    if (trimmed.length > 0) {
      onSend(trimmed.slice(0, MAX_CHAT_LENGTH));
    }
    setDraft("");
    setFocused(false);
    inputRef.current?.blur();
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      submitDraft();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setDraft("");
      setFocused(false);
      inputRef.current?.blur();
    }
  };

  const openChat = (): void => {
    setFocused(true);
    inputRef.current?.focus({ preventScroll: true });
  };

  return (
    <div className="chat-input-bridge" hidden={disabled}>
      <input
        ref={inputRef}
        className="chat-input-bridge__input"
        value={draft}
        maxLength={MAX_CHAT_LENGTH}
        enterKeyHint="send"
        aria-label="Chat message"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleInputKeyDown}
        onKeyUp={(event) => event.stopPropagation()}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      <button
        type="button"
        className="chat-input-bridge__mobile-button"
        aria-label="Open chat"
        aria-expanded={focused}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          openChat();
        }}
      >
        Chat
      </button>
    </div>
  );
}
