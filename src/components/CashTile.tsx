"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";
import { addCashOut, refreshShipperCash } from "@/app/(app)/business/actions";
import type { CashView } from "@/lib/business/data";

const n0 = (n: number) => Math.round(n).toLocaleString("en-US").replace("-", "−");
const STALE = 60 * 60_000;
const tunisToday = () => new Date(Date.now() + 36e5).toISOString().slice(0, 10);
const asOf = (iso: string) => {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-GB", { timeZone: "Africa/Tunis", day: "numeric", month: "short" });
  const today = new Date().toLocaleDateString("en-GB", { timeZone: "Africa/Tunis", day: "numeric", month: "short" });
  return `${day === today ? "today" : day} ${d.toLocaleTimeString("en-GB", { timeZone: "Africa/Tunis", hour: "2-digit", minute: "2-digit" })}`;
};

/**
 * Business · Money · Cash at Shipper (founder, Oct 19): balance + delivered not paid yet. Opening Money refreshes it
 * when the last read is over an hour old; "↻" refreshes at once. Withdrawals and customer refunds are entered here
 * (Shipper's API doesn't show them); their history is in Settings → Data.
 */
export function CashTile({ cash, connected }: { cash: CashView | null; connected: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const auto = useRef(false);

  const refresh = async () => {
    setBusy(true);
    setMsg({});
    try {
      const r = await refreshShipperCash();
      if (r.error) setMsg({ error: r.error });
      else router.refresh();
    } catch {
      setMsg({ error: "Not refreshed: the connection dropped. Try again." });
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (auto.current || !connected) return;
    if (cash?.at && cash.balance !== null && Date.now() - Date.parse(cash.at) <= STALE) return;
    const t = setTimeout(() => { auto.current = true; void refresh(); }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = cash && cash.balance !== null ? cash.balance + cash.delivered : null;
  return (
    <div className="card money-tile">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div className="lbl">Cash at Shipper</div>
        {connected && <button type="button" className="btn b-ghost cash-ref" aria-label="Refresh from Shipper" title="Refresh from Shipper" aria-disabled={busy} onClick={() => { if (!busy) void refresh(); }}>{busy ? "…" : "↻"}</button>}
      </div>
      <div className={`money-big ${total === null ? "money-muted" : ""}`}>{total === null ? "—" : n0(total)} <small>TND</small></div>
      {cash ? (
        <div className="cash-rows">
          <div><span>Balance</span><b>{cash.balance === null ? "refresh to read" : n0(cash.balance)}</b></div>
          <div><span>Delivered, not paid yet <span className="unit">· {cash.deliveredCount} orders</span></span><b>{n0(cash.delivered)}</b></div>
        </div>
      ) : <div className="unit">Balance + delivered not paid yet · with Shipper</div>}
      <div className="unit" role="status">{busy ? "Reading Shipper…" : cash?.at ? `As of ${asOf(cash.at)} (Tunisia)` : ""}</div>
      {msg.error && <span className="formmsg err" role="alert">{msg.error}</span>}
      <CashOutButton onSaved={() => router.refresh()} />
    </div>
  );
}

function CashOutButton({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"withdrawal" | "refund">("withdrawal");
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [pending, start] = useTransition();
  const n = Number(amount.replace(",", "."));
  const save = () => {
    if (!(n > 0)) { setError("Enter the amount first."); return; }
    setError("");
    start(async () => {
      try {
        const r = await addCashOut(kind, n, day);
        if (r.error) { setError(r.error); return; }
        setOpen(false);
        setSaved(r.ok ?? "Saved.");
        onSaved();
      } catch {
        setError("Not saved: the connection dropped or your session expired. Reload and try again.");
      }
    });
  };
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button type="button" className="btn b-ghost" onClick={() => { setKind("withdrawal"); setAmount(""); setDay(tunisToday()); setError(""); setSaved(""); setOpen(true); }}>+ Withdrawal or refund</button>
        {saved && <span className="formmsg" role="status">{saved}</span>}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} who="Founder · Cash at Shipper" title="Money taken out of Shipper" width={440}>
        <div className="field" role="radiogroup" aria-labelledby="lbl-kind">
          <span className="lbl" id="lbl-kind">What was it</span>
          <div className="recess wseg" style={{ alignSelf: "flex-start" }}>
            <button type="button" role="radio" aria-checked={kind === "withdrawal"} className={kind === "withdrawal" ? "seg-on" : ""} onClick={() => setKind("withdrawal")}>Withdrawal</button>
            <button type="button" role="radio" aria-checked={kind === "refund"} className={kind === "refund" ? "seg-on" : ""} onClick={() => setKind("refund")}>Customer refund</button>
          </div>
        </div>
        <label className="field">
          <span className="lbl">Amount · TND ●</span>
          <input className={`inp ${!(n > 0) ? "fi-miss" : ""}`} inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); setError(""); }} placeholder="7060" autoFocus />
        </label>
        <label className="field">
          <span className="lbl">Date ●</span>
          <input className="inp" type="date" value={day} min="2026-10-19" onChange={(e) => setDay(e.target.value)} />
        </label>
        <div className="unit">It comes off the balance at once, as in Shipper (even while Shipper reviews it). Fix or delete entries in Settings → Data.</div>
        <div className="acts">
          {error && <span className="formmsg err" role="alert">{error}</span>}
          <button type="button" className="btn b-primary" disabled={pending} onClick={save}>{pending ? "Saving…" : "Save"}</button>
        </div>
      </Modal>
    </>
  );
}
