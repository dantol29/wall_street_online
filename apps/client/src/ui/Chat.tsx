import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { MAX_CHAT_LENGTH, type ChatMessage } from "@multiplayer/shared";

const MAX_VISIBLE_MESSAGES = 20;

/** Muted, legible-on-black hues — avoids full-saturation colors that would clash with the terminal look. */
const USERNAME_COLORS = ["#5fd0ff", "#ff8c3a", "#5fff8f", "#ffd75f", "#c78cff", "#ff6e8c"];

/** Deterministic per-name color, so a given player's messages are always the same hue in this session. */
function colorForSender(senderId: string): string {
  let hash = 0;
  for (let i = 0; i < senderId.length; i++) {
    hash = (hash * 31 + senderId.charCodeAt(i)) | 0;
  }
  return USERNAME_COLORS[Math.abs(hash) % USERNAME_COLORS.length];
}

interface ChatProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  onFocusChange: (focused: boolean) => void;
}

export function Chat({ messages, onSend, onFocusChange }: ChatProps) {
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    onFocusChange(focused);
  }, [focused, onFocusChange]);

  useEffect(() => {
    const handleGlobalKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Enter" && !focused) {
        event.preventDefault();
        setFocused(true);
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [focused]);

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Enter") {
      event.preventDefault();
      const trimmed = draft.trim();
      if (trimmed.length > 0) {
        onSend(trimmed.slice(0, MAX_CHAT_LENGTH));
      }
      setDraft("");
      setFocused(false);
      inputRef.current?.blur();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setDraft("");
      setFocused(false);
      inputRef.current?.blur();
    }
  };

  const visibleMessages = messages.slice(-MAX_VISIBLE_MESSAGES);

  return (
    <div className="chat-overlay">
      <div className="chat-messages">
        {visibleMessages.map((message, index) => (
          <div key={`${message.senderId}-${message.timestamp}-${index}`} className="chat-message">
            <span className="chat-sender" style={{ color: colorForSender(message.senderId) }}>
              {message.displayName}:
            </span>{" "}
            {message.text}
          </div>
        ))}
      </div>
      <input
        ref={inputRef}
        className="chat-input"
        value={draft}
        maxLength={MAX_CHAT_LENGTH}
        placeholder={focused ? "" : "Press Enter to chat"}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleInputKeyDown}
        onFocus={() => setFocused(true)}
      />
    </div>
  );
}
