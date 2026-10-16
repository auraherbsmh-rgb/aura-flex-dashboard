"use client";

import { startTransition, useState } from "react";
import { Modal } from "./Modal";
import { saveWinner } from "@/app/tasks/actions";
import type { WinnerToNote } from "@/lib/home-shared";

/**
 * "Winner · core message" pop-up (handoff §6b, Founder 1 · WINNER): the winning variation's facts → the core message,
 * saved on the angle so it fills KEEP in every future task in that angle.
 */
export function WinnerModal({ w, current, who, onClose, onDone }: {
  w: WinnerToNote; current: string | null; who: string; onClose: () => void; onDone: (m: string) => void;
}) {
  const [text, setText] = useState(current ?? "");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const r = w.result;
  const best = r.variations.find((x) => x.v === r.bestV);
  const save = () => {
    setPending(true); setError("");
    startTransition(async () => {
      try { const res = await saveWinner(w.taskId, text); if (res.ok) { onDone(res.ok); onClose(); } else setError(res.error ?? "Not saved."); }
      catch { setError("No connection: nothing was saved. Try again."); }
      finally { setPending(false); }
    });
  };
  const ok = text.trim().length >= 5;
  return (
    <Modal open onClose={onClose} who={who} title="Winner · core message">
      <span className="tag t-green" style={{ alignSelf: "flex-start" }}><i aria-hidden="true" />WON · {w.face} · {w.cell} · {w.angle}</span>
      <div className="lib-facts">
        <div><span className="lbl">Winning variation</span><b>{r.bestV !== null ? `V${r.bestV}` : "—"}{w.hook?.type ? ` · ${w.hook.type}` : ""}</b></div>
        <div><span className="lbl">7d CPA / own line</span><b className="mono">{r.cpa7 === null ? "—" : `$${r.cpa7.toFixed(2)}`} / ${r.line.toFixed(2)}</b></div>
        <div><span className="lbl">Sales · spend 7d</span><b className="mono">{best?.sales7 ?? r.sales7} · ${Math.round(best?.spend7 ?? r.spend7)}</b></div>
      </div>
      {w.hook?.line && <div className="info">Hook: “{w.hook.line}”</div>}
      <label className="field">
        <span className="lbl">Core message of the angle ● · one sentence</span>
        <textarea className="ta" rows={3} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} placeholder="What this winner says that makes people buy" />
      </label>
      <div className="unit">Saved on the angle {w.angle}: every new task in this angle starts with it in KEEP.{current ? " It replaces the current one." : ""}</div>
      <div className="acts">
        {error && <span className="formmsg err" role="alert">{error}</span>}
        <button type="button" className="btn b-ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="btn b-primary" disabled={pending || !ok} onClick={save}>{pending ? "Saving…" : "Save core message"}</button>
      </div>
    </Modal>
  );
}
