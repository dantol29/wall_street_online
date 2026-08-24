import { useEffect, useState, type FormEvent } from "react";

export interface TokenLaunchDraft { name: string; ticker: string; description: string; seedSizeUsdc: number; imageUrl: string; soundUrl: string }

function readUpload(file: File | undefined, onRead: (value: string) => void): void {
  if (!file) {
    onRead("");
    return;
  }
  const reader = new FileReader();
  reader.addEventListener("load", () => onRead(typeof reader.result === "string" ? reader.result : ""), { once: true });
  reader.readAsDataURL(file);
}

export function TokenLaunchModal({ onCancel, onLaunch }: {
  onCancel: () => void;
  onLaunch: (draft: TokenLaunchDraft) => void;
}) {
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [description, setDescription] = useState("");
  const [seedSizeUsdc, setSeedSizeUsdc] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [soundUrl, setSoundUrl] = useState("");
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !ticker.trim()) return;
    onLaunch({
      name: name.trim(),
      ticker: ticker.trim().toUpperCase().slice(0, 10),
      description: description.trim(),
      seedSizeUsdc: Number(seedSizeUsdc),
      imageUrl: imageUrl.trim(),
      soundUrl: soundUrl.trim(),
    });
  };
  return (
    <div className="token-launch-modal" role="dialog" aria-modal="true" aria-labelledby="token-launch-title">
      <form className="token-launch-modal__panel" onSubmit={submit}>
        <span className="token-launch-modal__binding" aria-hidden="true" />
        <h2 id="token-launch-title">Launch a token</h2>
        <div className="token-launch-modal__fields">
          <div className="token-launch-modal__identity-row">
            <label>Token name<input autoFocus value={name} maxLength={32} onChange={(e) => setName(e.target.value)} placeholder="Pepe 2.0" /></label>
            <label>Ticker<input value={ticker} maxLength={10} onChange={(e) => setTicker(e.target.value)} placeholder="PEPE2" /></label>
          </div>
          <label className="token-launch-modal__seed-size">Seed size<div className="token-launch-modal__usdc-input"><img src="/assets/ui/usdc.svg" alt="" /><input required type="number" min="1" step="1" inputMode="decimal" value={seedSizeUsdc} onChange={(e) => setSeedSizeUsdc(e.target.value)} placeholder="100" /><span>USDC</span></div></label>
          <label>Description<textarea required value={description} maxLength={240} onChange={(e) => setDescription(e.target.value)} placeholder="What is this token?" /></label>
          <div className="token-launch-modal__upload-row">
            <label>Token image<input required type="file" accept="image/*" onChange={(e) => readUpload(e.target.files?.[0], setImageUrl)} /></label>
            <label>Token sound<input required type="file" accept="audio/*" onChange={(e) => readUpload(e.target.files?.[0], setSoundUrl)} /></label>
          </div>
        </div>
      </form>
      <div className="token-launch-modal__actions">
        <span className="game-instruction"><kbd>ESC</kbd> Cancel</span>
        <span className="game-instruction"><kbd>ENTER</kbd> Ready to launch</span>
      </div>
    </div>
  );
}
