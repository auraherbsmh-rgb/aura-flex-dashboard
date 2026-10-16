"use client";

import { startTransition, useState } from "react";
import { setProductionOrder } from "@/app/tasks/actions";
import { GROUP_WORD, orderWhy, type Prio } from "@/lib/tasks-shared";

export type OrderItem = { taskId: string; name: string; meta: string; late: boolean };

const TONE = { 1: "t-red", 2: "t-green", 3: "t-grey", 4: "t-grey" } as const;

/**
 * Founders' production order (Editing → Pipeline, founder decision Oct 16): the order everyone follows, set by hand with
 * ↑ / ↓, next to the dashboard's suggestion and the numbers behind it. Nothing moves by itself: when the suggestion
 * differs, a line says so and "Use suggested order" applies it in one click.
 */
export function ProductionOrder({ items, prio, now }: { items: OrderItem[]; prio: Record<string, Prio>; now: number }) {
  const fromServer = items.filter((i) => prio[i.taskId]).sort((a, b) => prio[a.taskId].pos - prio[b.taskId].pos).map((i) => i.taskId);
  const key = fromServer.join(",");
  // Arrows move the list at once; the server copy replaces it when it changes (previous-value pattern).
  const [order, setOrder] = useState(fromServer);
  const [seenKey, setSeenKey] = useState(key);
  if (seenKey !== key) { setSeenKey(key); setOrder(fromServer); }
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pending, setPending] = useState(false);
  const byId = new Map(items.map((i) => [i.taskId, i]));

  if (!order.length) return null;
  const save = (next: string[]) => {
    const before = order;
    setOrder(next);
    setPending(true);
    setMsg({});
    startTransition(async () => {
      try {
        const res = await setProductionOrder(next);
        if (res.ok) setMsg({ ok: res.ok }); else { setOrder(before); setMsg({ error: res.error ?? "Not saved." }); }
      } catch {
        setOrder(before);
        setMsg({ error: "No connection: the order was not saved. Try again." });
      } finally {
        setPending(false);
      }
    });
  };
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    save(next);
  };
  const suggested = [...order].sort((a, b) => prio[a].sug - prio[b].sug);
  // Positions compared within this list (the suggestion counts the same scripts).
  const sugPos = new Map(suggested.map((id, i) => [id, i + 1]));
  const moved = order.filter((id, i) => sugPos.get(id) !== i + 1).length;

  return (
    <section className="card sec" aria-labelledby="h-order" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 id="h-order" style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Production order</h2>
          <div className="unit">The order the agency, the editors and the copywriters see. Click a script to see why it is suggested there.</div>
        </div>
        <button type="button" className="btn b-ghost" disabled={pending || moved === 0} onClick={() => save(suggested)}>✓ Use suggested order</button>
      </div>
      {moved > 0
        ? <div className="notice" role="status" style={{ background: "#fbf0d2", color: "#7a5300" }}>Your order differs from the suggestion: {moved} script{moved > 1 ? "s" : ""} would move.</div>
        : <div className="unit">Your order matches the suggestion.</div>}
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {order.map((id, i) => {
          const it = byId.get(id);
          const p = prio[id];
          if (!it || !p) return null;
          const sp = sugPos.get(id)!;
          const why = open === id ? orderWhy(p, now) : null;
          return (
            <li key={id} className="row" style={{ padding: 0 }}>
              <div style={{ display: "grid", gridTemplateColumns: "44px minmax(0, 1fr) auto auto", gap: 12, alignItems: "center", padding: "12px 14px" }}>
                <span style={{ font: "600 24px var(--font)" }}>#{i + 1}</span>
                <button type="button" onClick={() => setOpen(open === id ? null : id)} aria-expanded={open === id} style={{ all: "unset", cursor: "pointer", minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 15, fontWeight: 600 }}>{it.name} <span className="unit" aria-hidden="true">{open === id ? "▴" : "▾"}</span></span>
                  <span className="unit" style={{ display: "block" }}>{it.meta}{it.late ? " · late" : ""}</span>
                </button>
                <span className={`tag ${TONE[p.grp]}`}><i aria-hidden="true" />{sp === i + 1 ? "✓ AS SUGGESTED" : `SUGGESTED #${sp}`} · {GROUP_WORD[p.grp].toUpperCase()}</span>
                <span style={{ display: "inline-flex", gap: 4 }}>
                  <button type="button" className="btn b-ghost" style={{ width: 40, padding: 0 }} disabled={pending || i === 0} aria-label={`Move ${it.name} up`} onClick={() => move(i, -1)}>↑</button>
                  <button type="button" className="btn b-ghost" style={{ width: 40, padding: 0 }} disabled={pending || i === order.length - 1} aria-label={`Move ${it.name} down`} onClick={() => move(i, 1)}>↓</button>
                </span>
              </div>
              {why && (
                <div style={{ padding: "0 14px 14px 70px", display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ fontSize: 14 }}>{why.head}</div>
                  <div className="order-facts">
                    {why.facts.map((f) => (
                      <div key={f.k} className="order-fact"><span className="lbl">{f.k}</span><b style={f.tone ? { color: f.tone === "red" ? "#A1241A" : "#135F33" } : undefined}>{f.v}</b></div>
                    ))}
                  </div>
                  <div className="unit">{why.note}</div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {msg.ok && <span className="formmsg" role="status">{msg.ok}</span>}
      {msg.error && <span className="formmsg err" role="alert">{msg.error}</span>}
    </section>
  );
}
