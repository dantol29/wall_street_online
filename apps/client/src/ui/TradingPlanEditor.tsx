import { useEffect, useMemo, useState, type FormEvent } from "react";

const STORAGE_KEY = "trading-floor-plans-v1";

interface TradingPlan {
  id: string;
  deskId: string;
  title: string;
  symbol: string;
  bias: "Long" | "Short" | "Neutral";
  entry: string;
  stop: string;
  target: string;
  risk: string;
  thesis: string;
  createdAt: number;
}

interface TradingPlanEditorProps {
  deskId: string;
  onStand: () => void;
}

function loadPlans(): TradingPlan[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function TradingPlanEditor({ deskId, onStand }: TradingPlanEditorProps) {
  const [plans, setPlans] = useState<TradingPlan[]>(loadPlans);
  const [title, setTitle] = useState("");
  const [symbol, setSymbol] = useState("");
  const [bias, setBias] = useState<TradingPlan["bias"]>("Long");
  const [entry, setEntry] = useState("");
  const [stop, setStop] = useState("");
  const [target, setTarget] = useState("");
  const [risk, setRisk] = useState("1");
  const [thesis, setThesis] = useState("");
  const [saved, setSaved] = useState(false);

  const recentPlans = useMemo(() => plans.slice(-3).reverse(), [plans]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onStand();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onStand]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !symbol.trim() || !thesis.trim()) return;

    const next: TradingPlan = {
      id: crypto.randomUUID(),
      deskId,
      title: title.trim(),
      symbol: symbol.trim().toUpperCase().slice(0, 12),
      bias,
      entry: entry.trim(),
      stop: stop.trim(),
      target: target.trim(),
      risk: risk.trim(),
      thesis: thesis.trim(),
      createdAt: Date.now(),
    };
    const updated = [...plans, next].slice(-25);
    setPlans(updated);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  return (
    <div className="plan-editor-backdrop">
      <section className="plan-editor" role="dialog" aria-modal="true" aria-labelledby="plan-editor-title">
        <header className="plan-editor__header">
          <div>
            <p className="plan-editor__eyebrow">DESK TERMINAL · {deskId.toUpperCase()}</p>
            <h1 id="plan-editor-title">Trade plan</h1>
          </div>
          <button className="plan-editor__stand" type="button" onClick={onStand}>
            Stand up <kbd>Esc</kbd>
          </button>
        </header>

        <form className="plan-editor__form" onSubmit={handleSubmit}>
          <label className="plan-field plan-field--wide">
            <span>Plan name</span>
            <input autoFocus required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Opening drive continuation" />
          </label>
          <label className="plan-field">
            <span>Symbol</span>
            <input required value={symbol} onChange={(event) => setSymbol(event.target.value)} placeholder="IBM" maxLength={12} />
          </label>
          <label className="plan-field">
            <span>Bias</span>
            <select value={bias} onChange={(event) => setBias(event.target.value as TradingPlan["bias"])}>
              <option>Long</option>
              <option>Short</option>
              <option>Neutral</option>
            </select>
          </label>
          <label className="plan-field">
            <span>Entry</span>
            <input value={entry} onChange={(event) => setEntry(event.target.value)} placeholder="125.20" inputMode="decimal" />
          </label>
          <label className="plan-field">
            <span>Stop</span>
            <input value={stop} onChange={(event) => setStop(event.target.value)} placeholder="123.80" inputMode="decimal" />
          </label>
          <label className="plan-field">
            <span>Target</span>
            <input value={target} onChange={(event) => setTarget(event.target.value)} placeholder="129.50" inputMode="decimal" />
          </label>
          <label className="plan-field">
            <span>Risk, %</span>
            <input value={risk} onChange={(event) => setRisk(event.target.value)} placeholder="1" inputMode="decimal" />
          </label>
          <label className="plan-field plan-field--wide">
            <span>Thesis and invalidation</span>
            <textarea
              required
              value={thesis}
              onChange={(event) => setThesis(event.target.value)}
              placeholder="What must happen for this trade to work? What proves the idea wrong?"
              rows={4}
            />
          </label>

          <footer className="plan-editor__footer">
            <span className={saved ? "plan-editor__saved plan-editor__saved--visible" : "plan-editor__saved"}>
              Plan saved locally
            </span>
            <button className="plan-editor__save" type="submit">Save plan</button>
          </footer>
        </form>

        {recentPlans.length > 0 && (
          <aside className="plan-editor__recent" aria-label="Recent plans">
            <span>RECENT</span>
            {recentPlans.map((plan) => (
              <div key={plan.id}>
                <strong>{plan.symbol}</strong>
                <span>{plan.bias}</span>
                <span>{plan.title}</span>
              </div>
            ))}
          </aside>
        )}
      </section>
    </div>
  );
}
