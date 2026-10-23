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
  // The drag follows the pointer on the whole window (a moved row can lose the pointer), saved once on release.
  const dragRef = useRef(drag);
  const saveRef = useRef<(next: string[], moved: string) => void>(() => {});
  useEffect(() => { dragRef.current = drag; }, [drag]);
  const dragging = drag?.id ?? null;
  useEffect(() => {
    if (!dragging) return;
    // Place of the dragged row = number of other rows whose middle is above the pointer.
    const place = (d: NonNullable<typeof drag>, y: number) => {
      const others = d.list.filter((x) => x !== d.id);
      let at = 0;
      for (const x of others) {
        const r = rows.current.get(x)?.getBoundingClientRect();
        if (r && y > r.top + r.height / 2) at++;
      }
      const next = [...others.slice(0, at), d.id, ...others.slice(at)];
      return next.every((x, i) => x === d.list[i]) ? d : { ...d, list: next };
    };
    let y = -1;
    let frame = 0;
    const follow = () => setDrag((d) => (d ? place(d, y) : d));
    // Near the top or bottom of the screen the page keeps scrolling while the finger rests there (long lists on a phone).
    const edge = () => {
      const step = y < 0 ? 0 : y < 60 ? -12 : y > window.innerHeight - 60 ? 12 : 0;
      if (step) { window.scrollBy(0, step); follow(); }
      frame = requestAnimationFrame(edge);
    };
    frame = requestAnimationFrame(edge);
    const cancel = () => { y = -1; setDrag(null); };
    const move = (e: PointerEvent) => {
      // Button released where the page could not see it (outside the window): stop, save nothing.
      if (e.pointerType === "mouse" && e.buttons === 0) { cancel(); return; }
      y = e.clientY;
      follow();
    };
    const up = (e: PointerEvent) => {
      // Final place from the release point itself (a fast flick can end before the last move rendered).
      const d = dragRef.current ? place(dragRef.current, e.clientY) : null;
      y = -1;
      setDrag(null);
      if (d && !d.start.every((x, i) => x === d.list[i])) saveRef.current(d.list, d.id);
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") cancel(); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", key);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("keydown", key);
    };
  }, [dragging]);
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
  const save = (next: string[], announce: string, moved?: string) => {
    const before = order;
    setOrder(next);
    setSaid(announce);
    setPending(true);
    setMsg({});
    startTransition(async () => {
      try {
        const res = await setProductionOrder(next, ver);
        if (res.ok) { if (typeof res.version === "number") setVer(res.version); setMsg({ ok: res.ok }); }
        else { if (moved) refocus.current = moved; setOrder(before); setSaid("Not moved."); setMsg({ error: res.error ?? "Not saved." }); }
      } catch {
        if (moved) refocus.current = moved;
        setOrder(before);
        setSaid("Not moved.");
        setMsg({ error: "Not saved: the connection dropped or your session expired. Reload the page and try again." });
      } finally {
        setPending(false);
      }
    });
  };
  useEffect(() => { saveRef.current = (next, moved) => save(next, `${byId.get(moved)?.name ?? "Script"} moved to #${next.indexOf(moved) + 1}.`, moved); });
  if (!order.length) {
    return (
      <section className={compact ? "plan-list" : "card sec"} aria-labelledby="h-order">
        {!compact && head}
        <div className="info">Nothing in production right now. A script appears here once its details are confirmed.</div>
      </section>
    );
  }
  const nameOf = (id: string) => byId.get(id)?.name ?? "Script";

  const onDown = (e: React.PointerEvent<HTMLButtonElement>, id: string) => {
    if (pending || e.button !== 0) return;
    e.preventDefault();
    setDrag({ id, start: order, list: order });
  };
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const d = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
    const j = i + d;
    if (!d || pending || j < 0 || j >= order.length) return;
    e.preventDefault();
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    refocus.current = next[j];
    save(next, `${nameOf(next[j])} moved to #${j + 1}.`, next[j]);
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
