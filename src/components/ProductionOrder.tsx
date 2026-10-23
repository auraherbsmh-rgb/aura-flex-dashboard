"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { setProductionOrder } from "@/app/tasks/actions";
import { GROUP_WORD, movedCount, orderWhy, type Prio } from "@/lib/tasks-shared";

export type OrderItem = { taskId: string; name: string; meta: string; late: boolean };

const TONE = { 1: "t-red", 2: "t-green", 3: "t-grey", 4: "t-grey" } as const;

/**
 * Founders' production order (Editing → Pipeline and the Monday plan): the order everyone follows, set by dragging a
 * row by its grip (mouse or finger; ↑ / ↓ keys on the focused grip). Next to it the dashboard's suggestion and the
 * numbers behind it (Editing only; `compact` hides them in the Monday plan). Nothing moves by itself.
 */
export function ProductionOrder({ items, prio, version, now, compact = false }: { items: OrderItem[]; prio: Record<string, Prio> | null; version: number; now: number; compact?: boolean }) {
  if (!prio) {
    return (
      <section className="card sec" aria-labelledby="h-order">
        <h2 id="h-order" style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Production order</h2>
        <div className="formmsg err" role="alert">The production order could not be read. Reload the page.</div>
      </section>
    );
  }
  return <OrderPanel items={items} prio={prio} version={version} now={now} compact={compact} />;
}

function OrderPanel({ items, prio, version, now, compact }: { items: OrderItem[]; prio: Record<string, Prio>; version: number; now: number; compact: boolean }) {
  const fromServer = Object.keys(prio).sort((a, b) => prio[a].pos - prio[b].pos);
  const key = `${version}:${fromServer.join(",")}`;
  // Moves show at once; the server copy replaces the list when it changes (previous-value pattern).
  const [order, setOrder] = useState(fromServer);
  const [ver, setVer] = useState(version);
  const [seenKey, setSeenKey] = useState(key);
  if (seenKey !== key) { setSeenKey(key); setOrder(fromServer); setVer(version); }
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [said, setSaid] = useState("");
  const [pending, setPending] = useState(false);
  // Pointer drag: the list follows the finger / mouse; saved once on release.
  const [drag, setDrag] = useState<{ id: string; start: string[]; list: string[] } | null>(null);
  const rows = useRef(new Map<string, HTMLLIElement>());
  const grips = useRef(new Map<string, HTMLButtonElement>());
  const refocus = useRef<string | null>(null);
  useEffect(() => {
    if (!refocus.current) return;
    grips.current.get(refocus.current)?.focus();
    refocus.current = null;
  }, [order]);
  const byId = new Map(items.map((i) => [i.taskId, i]));
  const shown = drag?.list ?? order;

  const head = (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <div>
        <h2 id="h-order" style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Production order</h2>
        <div className="unit">What the agency, the editors and the copywriters do first. Drag a row by ⋮⋮ to move it.</div>
      </div>
    </div>
  );
  if (!order.length) {
    return (
      <section className={compact ? "plan-list" : "card sec"} aria-labelledby="h-order">
        {!compact && head}
        <div className="info">Nothing in production right now. A script appears here once its details are confirmed.</div>
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
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

  const onDown = (e: React.PointerEvent<HTMLButtonElement>, id: string) => {
    if (pending || e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ id, start: order, list: order });
  };
  const onMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!drag) return;
    const others = drag.list.filter((x) => x !== drag.id);
    // New place = number of other rows whose middle is above the pointer.
    let at = 0;
    for (const x of others) {
      const r = rows.current.get(x)?.getBoundingClientRect();
      if (r && e.clientY > r.top + r.height / 2) at++;
    }
    const next = [...others.slice(0, at), drag.id, ...others.slice(at)];
    if (!same(next, drag.list)) setDrag({ ...drag, list: next });
  };
  const onUp = () => {
    if (!drag) return;
    const { id, start, list } = drag;
    setDrag(null);
    if (!same(start, list)) save(list, `${nameOf(id)} moved to #${list.indexOf(id) + 1}.`);
  };
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const d = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
    const j = i + d;
    if (!d || pending || j < 0 || j >= order.length) return;
    e.preventDefault();
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    refocus.current = next[j];
    save(next, `${nameOf(next[j])} moved to #${j + 1}.`);
  };
  const suggested = [...order].sort((a, b) => prio[a].sug - prio[b].sug);
  const sugPos = new Map(suggested.map((id, i) => [id, i + 1]));
  const moved = movedCount(order, prio);

  return (
    <section className={compact ? "plan-list" : "card sec"} aria-labelledby={compact ? undefined : "h-order"} aria-label={compact ? "Production order" : undefined} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {!compact && head}
      {!compact && (moved > 0
        ? <div className="notice" role="status" style={{ background: "#fbf0d2", color: "#7a5300", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span>Your order differs from the suggestion: {moved} script{moved > 1 ? "s" : ""} would move.</span>
            <button type="button" className="btn b-ghost plan-xs" aria-disabled={pending} onClick={() => { if (!pending) save(suggested, "Suggested order applied."); }}>Use suggested order</button>
          </div>
        : <div className="unit">Your order matches the suggestion.</div>)}
      <span className="sr-only" role="status">{said}</span>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {shown.map((id, i) => {
          const it = byId.get(id);
          const p = prio[id];
          if (!p) return null;
          const sp = sugPos.get(id)!;
          const why = !compact && open === id ? orderWhy(p, now) : null;
          const name = it?.name ?? "Script";
          return (
            <li key={id} ref={(el) => { if (el) rows.current.set(id, el); else rows.current.delete(id); }} className={`order-row ${drag?.id === id ? "is-drag" : ""}`}>
              <div className="order-grid">
                <button
                  type="button"
                  className="order-grip"
                  ref={(el) => { if (el) grips.current.set(id, el); else grips.current.delete(id); }}
                  aria-label={`Move ${name} (#${i + 1}). Drag, or use the up and down arrow keys.`}
                  aria-disabled={pending}
                  onPointerDown={(e) => onDown(e, id)}
                  onPointerMove={onMove}
                  onPointerUp={onUp}
                  onPointerCancel={() => setDrag(null)}
                  onKeyDown={(e) => onKey(e, i)}
                >⋮⋮</button>
                <span className="order-n">{i + 1}</span>
                {compact ? (
                  <span className="order-name" style={{ cursor: "default" }}>
                    <span style={{ display: "block", fontSize: 15, fontWeight: 600 }}>{name}</span>
                    <span className="unit" style={{ display: "block" }}>{it?.meta ?? ""}</span>
                  </span>
                ) : (
                  <button type="button" className="order-name" onClick={() => setOpen(open === id ? null : id)} aria-expanded={open === id}>
                    <span style={{ display: "block", fontSize: 15, fontWeight: 600 }}>{name} <span className="unit" aria-hidden="true">{open === id ? "▴" : "▾"}</span></span>
                    <span className="unit" style={{ display: "block" }}>{it?.meta ?? ""}</span>
                  </button>
                )}
                {compact
                  ? (it?.late ? <span className="tag t-red order-tag"><i aria-hidden="true" />LATE</span> : <span className="order-tag" />)
                  : <span className={`tag ${TONE[p.grp]} order-tag`}><i aria-hidden="true" />{sp === i + 1 ? "✓ AS SUGGESTED" : `SUGGESTED #${sp}`} · {GROUP_WORD[p.grp].toUpperCase()}</span>}
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
