import { useState, type FormEvent } from "react";

export interface TokenLaunchDraft { name: string; ticker: string; imageUrl: string; soundUrl: string }

export function TokenLaunchModal({ onCancel, onLaunch }: {
  onCancel: () => void;
  onLaunch: (draft: TokenLaunchDraft) => void;
}) {
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [soundUrl, setSoundUrl] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !ticker.trim()) return;
    onLaunch({
      name: name.trim(),
      ticker: ticker.trim().toUpperCase().slice(0, 10),
      imageUrl: imageUrl.trim(),
      soundUrl: soundUrl.trim(),
    });
  };
  return (
    <div className="token-launch-modal" role="dialog" aria-modal="true" aria-labelledby="token-launch-title">
      <form className="token-launch-modal__panel" onSubmit={submit}>
        <p className="token-launch-modal__eyebrow">NEW LISTING</p>
        <h2 id="token-launch-title">Launch a token</h2>
        <label>Token name<input autoFocus value={name} maxLength={32} onChange={(e) => setName(e.target.value)} placeholder="Pepe 2.0" /></label>
        <label>Ticker<input value={ticker} maxLength={10} onChange={(e) => setTicker(e.target.value)} placeholder="PEPE2" /></label>
        <label>Image URL <span>(optional)</span><input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" /></label>
        <label>Token sound URL <span>(optional)</span><input type="url" value={soundUrl} onChange={(e) => setSoundUrl(e.target.value)} placeholder="https://…/sound.mp3" /></label>
        <div className="token-launch-modal__actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button className="token-launch-modal__launch" type="submit">Ready to launch</button>
        </div>
      </form>
    </div>
  );
}
