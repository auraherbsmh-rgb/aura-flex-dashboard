"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { setProductionOrder } from "@/app/tasks/actions";
import { GROUP_WORD, movedCount, orderWhy, type Prio } from "@/lib/tasks-shared";

export type OrderItem = { taskId: string; name: string; meta: string; late: boolean };

const TONE = { 1: "t-red", 2: "t-green", 3: "t-grey", 4: "t-grey" } as const;

/**
 * Founders' production order (Editing → Pipeline, founder decision Oct 16): the order everyone follows, set by hand with
 * ↑ / ↓, next to the dashboard's suggestion and the numbers behind it. Nothing moves by itself: when the suggestion
 * differs, a line says so and "Use suggested order" applies it in one click. Built from the order itself (every script
 * in production), so its numbers are the same as in the inbox, the Videos pipeline and the editor queue.
 */
export function ProductionOrder({ items, prio, version, now }: { items: OrderItem[]; prio: Record<string, Prio> | null; version: number; now: number }) {
  if (!prio) {
    return (
      <section className="card sec" aria-labelledby="h-order">
        <h2 id="h-order" style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Production order</h2>
        <div className="formmsg err" role="alert">The production order could not be read. Reload the page.</div>
      </section>
    );
  }
  return <OrderPanel items={items} prio={prio} version={version} now={now} />;
}

function OrderPanel({ items, prio, version, now }: { items: OrderItem[]; prio: Record<string, Prio>; version: number; now: number }) {
  const fromServer = Object.keys(prio).sort((a, b) => prio[a].pos - prio[b].pos);
  const key = `${version}:${fromServer.join(",")}`;
  // Arrows move the list at once; the server copy replaces it when it changes (previous-value pattern).
  const [order, setOrder] = useState(fromServer);
  const [ver, setVer] = useState(version);
  const [seenKey, setSeenKey] = useState(key);
  if (seenKey !== key) { setSeenKey(key); setOrder(fromServer); setVer(version); }
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [said, setSaid] = useState("");
  const [pending, setPending] = useState(false);
  // Drag a row to its new place (desktop); ↑ / ↓ stay for phones and the keyboard.
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  // Keyboard: after a move, focus returns to the same arrow on the moved row.
  const refocus = useRef<string | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  useEffect(() => {
    if (!refocus.current) return;
    buttons.current.get(refocus.current)?.focus();
    refocus.current = null;
  }, [order]);
  const byId = new Map(items.map((i) => [i.taskId, i]));

  if (!order.length) {
    return (
      <section className="card sec" aria-labelledby="h-order">
        <h2 id="h-order" style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Production order</h2>
        <div className="unit">Nothing in production right now. A script appears here at its suggested place once its details are confirmed.</div>
      </section>
    );
  }
  const save = (next: string[], announce: string) => {
    const before = order;
    setOrder(next);
    setSaid(announce);
    setPending(true);
    setMsg({});
    startTransition(async () => {
      try {
        const res = await setProductionOrder(next, ver);
        if (res.ok) { if (typeof res.version === "number") setVer(res.version); setMsg({ ok: res.ok }); }
        else { setOrder(before); setSaid("Not moved."); setMsg({ error: res.error ?? "Not saved." }); }
      } catch {
        setOrder(before);
        setSaid("Not moved.");
        setMsg({ error: "Not saved: the connection dropped or your session expired. Reload the page and try again." });
      } finally {
        setPending(false);
      }
    });
  };
  const nameOf = (id: string) => byId.get(id)?.name ?? "Script";
  const move = (i: number, d: -1 | 1, which: "up" | "down") => {
    const j = i + d;
    if (pending || j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    refocus.current = `${next[j]}:${which}`;
    save(next, `${nameOf(next[j])} moved to #${j + 1}.`);
  };
  const dropOn = (target: string) => {
    const from = dragId;
    setDragId(null);
    setOverId(null);
    if (pending || !from || from === target) return;
    const next = order.filter((x) => x !== from);
    next.splice(order.indexOf(target), 0, from);
    save(next, `${nameOf(from)} moved to #${next.indexOf(from) + 1}.`);
  };
  const suggested = [...order].sort((a, b) => prio[a].sug - prio[b].sug);
  const sugPos = new Map(suggested.map((id, i) => [id, i + 1]));
  const moved = movedCount(order, prio);

  return (
    <section className="card sec" aria-labelledby="h-order" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 id="h-order" style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Production order</h2>
          <div className="unit">The order the agency, the editors and the copywriters see. Drag a script to move it (or ↑ ↓). Click it to see why it is suggested there.</div>
        </div>
        <button type="button" className="btn b-ghost" aria-disabled={pending || moved === 0} onClick={() => { if (!pending && moved > 0) save(suggested, "Suggested order applied."); }}>✓ Use suggested order</button>
      </div>
      {moved > 0
        ? <div className="notice" role="status" style={{ background: "#fbf0d2", color: "#7a5300" }}>Your order differs from the suggestion: {moved} script{moved > 1 ? "s" : ""} would move.</div>
        : <div className="unit">Your order matches the suggestion.</div>}
      <span className="sr-only" role="status">{said}</span>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {order.map((id, i) => {
          const it = byId.get(id);
          const p = prio[id];
          if (!p) return null;
          const sp = sugPos.get(id)!;
          const why = open === id ? orderWhy(p, now) : null;
          const name = it?.name ?? "Script";
          return (
            <li
              key={id}
              className={`order-row ${dragId === id ? "is-drag" : ""} ${overId === id && dragId !== id ? "is-over" : ""}`}
              draggable={!pending}
              onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", id); setDragId(id); }}
              onDragOver={(e) => { if (dragId) { e.preventDefault(); if (overId !== id) setOverId(id); } }}
              onDrop={(e) => { e.preventDefault(); dropOn(id); }}
              onDragEnd={() => { setDragId(null); setOverId(null); }}
            >
              <div className="order-grid">
                <span className="order-n">#{i + 1}</span>
                <button type="button" className="order-name" onClick={() => setOpen(open === id ? null : id)} aria-expanded={open === id}>
                  <span style={{ display: "block", fontSize: 15, fontWeight: 600 }}>{name} <span className="unit" aria-hidden="true">{open === id ? "▴" : "▾"}</span></span>
                  <span className="unit" style={{ display: "block" }}>{it?.meta ?? ""}{it?.late ? " · late" : ""}</span>
                </button>
                <span className={`tag ${TONE[p.grp]} order-tag`}><i aria-hidden="true" />{sp === i + 1 ? "✓ AS SUGGESTED" : `SUGGESTED #${sp}`} · {GROUP_WORD[p.grp].toUpperCase()}</span>
                <span className="order-arrows">
                  <button type="button" className="btn b-ghost" ref={(el) => { if (el) buttons.current.set(`${id}:up`, el); }} aria-disabled={pending || i === 0} aria-label={`Move ${name} up`} onClick={() => move(i, -1, "up")}>↑</button>
                  <button type="button" className="btn b-ghost" ref={(el) => { if (el) buttons.current.set(`${id}:down`, el); }} aria-disabled={pending || i === order.length - 1} aria-label={`Move ${name} down`} onClick={() => move(i, 1, "down")}>↓</button>
                </span>
              </div>
              {why && (
                <div className="order-why">
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
