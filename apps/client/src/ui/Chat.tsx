import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { MAX_CHAT_LENGTH, type ChatMessage } from "@multiplayer/shared";

interface ChatProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  onFocusChange: (focused: boolean) => void;
  onHudChange: (focused: boolean, draft: string) => void;
  disabled?: boolean;
}

/**
 * Browser-overlay chat. Keeping this in the DOM makes text, scrolling, IME,
 * keyboard focus and responsive layout native instead of painting UI into a
 * PlayCanvas texture attached to the camera.
 */
export function Chat({ messages, onSend, onFocusChange, onHudChange, disabled = false }: ChatProps) {
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    onFocusChange(focused);
    onHudChange(focused, draft);
  }, [draft, focused, onFocusChange, onHudChange]);

  useEffect(() => {
    const handleGlobalKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.key === "/" || event.key === "Enter") && !focused && !disabled) {
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

  useEffect(() => {
    const element = messagesRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages, focused]);

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

  const visibleMessages = messages.slice(-12);

  return (
    <div className={focused ? "chat-overlay chat-overlay--focused" : "chat-overlay"} hidden={disabled}>
      <div className="chat-wire">
        <div className="chat-messages" ref={messagesRef} aria-live="polite">
          {visibleMessages.length === 0 && <div className="chat-empty">No messages yet</div>}
          {visibleMessages.map((message) => (
            <div className="chat-message" key={`${message.senderId}-${message.timestamp}`}>
              <span className="chat-sender">{message.displayName}:</span>{" "}
              <span className="chat-message__text">{message.text}</span>
            </div>
          ))}
        </div>
        <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); submitDraft(); }}>
          <input
            ref={inputRef}
            className="chat-input"
            value={draft}
            maxLength={MAX_CHAT_LENGTH}
            enterKeyHint="send"
            placeholder="Press / to chat"
            aria-label="Chat message"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleInputKeyDown}
            onKeyUp={(event) => event.stopPropagation()}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          />
        </form>
      </div>
      <button type="button" className="chat-mobile-toggle" onClick={openChat}>Chat</button>
    </div>
  );
}
