"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Scorecard as Data, WLItem } from "@/lib/scorecard-shared";

const pct = (n: number | null, d = 0) => (n === null ? "—" : `${(n * 100).toFixed(d)}%`);

// The previous visit, read once per page load (switching views or a remount keeps the same answer), then this visit saved.
const visits = new Map<string, string | null>();
function visitOnce(personId: string): string | null {
  if (visits.has(personId)) return visits.get(personId) ?? null;
  const key = `aura:scorecard:${personId}`;
  let prev: string | null = null;
  try { prev = window.localStorage.getItem(key); window.localStorage.setItem(key, new Date().toISOString()); } catch { /* storage off: nothing is "new" */ }
  visits.set(personId, prev);
  return prev;
}

/**
 * Copywriter scorecard (artboard "Scorecard"): her own, private dashboard. Founders see it by picking that copywriter.
 * Read-only; results come from the daily Meta pull.
 */
export function Scorecard({ data, personId, name, forFounder, cwQuery }: { data: Data; personId: string; name: string; forFounder: boolean; cwQuery: string }) {
  const [drill, setDrill] = useState<WLItem | null>(null);
  // "New since your last visit": a per-browser convenience (her own visits only).
  const [lastVisit, setLastVisit] = useState<string | null>(null);
  useEffect(() => {
    if (forFounder) return;
    const prev = visitOnce(personId);
    const id = requestAnimationFrame(() => setLastVisit(prev));
    return () => cancelAnimationFrame(id);
  }, [forFounder, personId]);
  const isNew = (at: string) => !forFounder && !!lastVisit && Date.parse(at) > Date.parse(lastVisit);
  const latest = [...data.latest].sort((a, b) => Number(isNew(b.at)) - Number(isNew(a.at)));
  const empty = data.settledTotal === 0 && data.latest.length === 0;
  const [m0, m1, m2] = data.months;
  return (
    <section className="sc" aria-labelledby="h-sc">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h2 id="h-sc" style={{ margin: 0, fontSize: 28, fontWeight: 600, letterSpacing: "-0.03em" }}>{forFounder ? `Scorecard · ${name}` : "My scorecard"}</h2>
        <span className="lbl">{forFounder ? "Her own dashboard · private to her and the founders" : "Private: only you and the founders see it"}</span>
      </div>
      {empty && <div className="info">No concept of {forFounder ? "hers" : "yours"} is live yet. The scorecard fills itself once {forFounder ? "her" : "your"} concepts run and the daily Meta pull judges them.</div>}

      <section className="sc-tiles" aria-label="Win rate by month">
        {[m0, m1].map((m) => (
          <div className="card sc-tile" key={m.label}>
            <div className="lbl">Win rate · {m.label}</div>
            <div className="sc-big"><span>{m.won}</span><small>of {m.settled}</small></div>
            <div className="unit">settled concepts</div>
          </div>
        ))}
        <div className={`card sc-tile ${m2.improving ? "k-green" : ""}`}>
          <div className="lbl" style={m2.improving ? { color: "#135F33" } : undefined}>Win rate · {m2.label}{m2.improving ? " · improving" : ""}</div>
          <div className="sc-big"><span>{m2.won}</span><small>of {m2.settled}</small></div>
          <div className="unit">settled so far</div>
        </div>
        <div className="card sc-tile">
          <div className="lbl">Still testing</div>
          <div className="sc-big"><span>{data.testing}</span></div>
          <div className="unit">no verdict yet</div>
        </div>
      </section>

      <section className="tray" style={{ padding: "18px 16px 16px" }} aria-labelledby="h-sc-latest">
        <div className="sc-head"><h3 id="h-sc-latest">{forFounder ? "Her latest concepts" : "My latest concepts"}</h3><span className="lbl">{forFounder ? "Newest first" : "New since your last visit first"}</span></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {latest.length === 0 && <div className="info">Nothing launched yet.</div>}
          {latest.map((c) => (
            <div className="sc-latest" key={c.taskId}>
              <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flexWrap: "wrap" }}>
                <b style={{ fontSize: 15 }}>{c.name}</b><span className="unit" style={{ fontSize: 13 }}>{c.cell}</span>
                {isNew(c.at) && <span className="sc-new">NEW</span>}
              </span>
              <span className={`tag ${c.tone}`} style={{ justifyContent: "center" }}><i aria-hidden="true" />{c.state}</span>
              <span className="unit" style={{ textAlign: "right" }}>{c.when}</span>
              <Link href={`/copywriting?${cwQuery}${cwQuery ? "&" : ""}task=${c.taskId}#task-view`} className="sc-link">Open concept →</Link>
            </div>
          ))}
        </div>
      </section>

      <section className="card sc-row" aria-labelledby="h-sc-wins">
        <h3 id="h-sc-wins">{forFounder ? "Her winners live now" : "My winners live now"}</h3>
        {data.liveWins.length === 0 ? <span className="unit">None live right now.</span> : data.liveWins.map((w) => <span key={w.label} className={`tag ${w.tone}`} style={{ fontSize: 12, padding: "8px 12px" }}><i aria-hidden="true" />{w.label}</span>)}
      </section>

      <section className="sc-two">
        <div className="card" style={{ padding: "20px 22px" }}>
          <div className="sc-head" style={{ padding: "0 0 10px" }}><h3>{forFounder ? "Her script parts · last 30 days" : "My script parts · last 30 days"}</h3><span className="lbl">{forFounder ? "Her" : "My"} average vs our band</span></div>
          {data.parts.map((x) => (
            <div className="sc-part" key={x.part}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{x.part}</span>
              <span className="mono" style={{ fontSize: 18, fontWeight: 600 }}>{pct(x.value, x.part === "Clicks" ? 2 : 0)}</span>
              {x.inBand === null
                ? <span className="unit">{x.value === null ? "too early" : "no band"}</span>
                : <span className={`tag ${x.inBand ? "t-green" : "t-red"}`} style={{ justifySelf: "start" }}><i aria-hidden="true" />{x.inBand ? "IN BAND" : "BELOW BAND"} · FROM {x.low}%</span>}
            </div>
          ))}
          <div className="unit" style={{ marginTop: 8 }}>
            Video concepts launched in the last 30 days{data.partsCount ? ` (${data.partsCount})` : ""}. Clicks = link clicks. Signals only: the verdict is CPA vs own line.
          </div>
          {data.retention && (
            <div style={{ marginTop: 14 }}>
              <div className="lbl" style={{ marginBottom: 8 }}>Retention · viewers left (of 3-second plays)</div>
              <div className="sc-ret" role="img" aria-label={data.retention.map((r) => `${r.at}% of the video: ${Math.round(r.left * 100)}% left`).join(", ")}>
                {data.retention.map((r) => (
                  <span key={r.at} className="sc-ret-col">
                    <span className="sc-ret-bar"><i style={{ height: `${Math.max(2, Math.round(r.left * 100))}%` }} /></span>
                    <b className="mono">{Math.round(r.left * 100)}%</b>
                    <span className="unit">at {r.at}%</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
        {data.focus ? (
          <div className="card k-red sc-focus">
            <div className="lbl" style={{ color: "#A1241A" }}>{forFounder ? "Her focus" : "My focus"}</div>
            <div className="sc-focus-big">{data.focus.part}</div>
            <div style={{ fontSize: 14, color: "#2B2B28" }}>Below band in <b>{data.focus.below} of {forFounder ? "her" : "my"} last {data.focus.of}</b> settled concepts</div>
          </div>
        ) : (
          <div className="card sc-focus">
            <div className="lbl">{forFounder ? "Her focus" : "My focus"}</div>
            <div className="unit" style={{ fontSize: 14 }}>{data.allInBand ? "Every part in band in the last settled concepts." : "Shows the script part most often below its band, from 3 settled concepts."}</div>
          </div>
        )}
      </section>

      <section className="card" style={{ padding: "20px 22px" }} aria-labelledby="h-sc-wl">
        <div className="sc-head" style={{ padding: "0 0 8px" }}><h3 id="h-sc-wl">Where {forFounder ? "she wins and where she loses" : "I win and where I lose"}</h3><span className="lbl">Won / settled · click one to see its ads</span></div>
        <div className="sc-wl" role="table" aria-label="Best and worst">
          <span role="row" style={{ display: "contents" }}>
            <span role="columnheader" />
            <span role="columnheader" className="lbl" style={{ color: "#135F33", paddingBottom: 8 }}>Best</span>
            <span role="columnheader" className="lbl" style={{ color: "#A1241A", paddingBottom: 8 }}>Worst</span>
          </span>
          {data.wl.map((r) => (
            <span role="row" key={r.dim} style={{ display: "contents" }}>
              <span role="rowheader" className="sc-wl-c" style={{ fontWeight: 600, fontSize: 14 }}>{r.dim}</span>
              <span role="cell" className="sc-wl-c">
                {r.best ? <button type="button" className={`dr dr-g ${drill?.key === r.best.key ? "dr-on" : ""}`} aria-pressed={drill?.key === r.best.key} onClick={() => setDrill(drill?.key === r.best!.key ? null : r.best)}>{r.best.label} <b className="mono">{r.best.won}/{r.best.settled}</b> ›</button>
                  : <span className="unit">{r.note}</span>}
              </span>
              <span role="cell" className="sc-wl-c">
                {r.worst ? <button type="button" className={`dr dr-r ${drill?.key === r.worst.key ? "dr-on" : ""}`} aria-pressed={drill?.key === r.worst.key} onClick={() => setDrill(drill?.key === r.worst!.key ? null : r.worst)}>{r.worst.label} <b className="mono">{r.worst.won}/{r.worst.settled}</b> ›</button>
                  : <span className="unit">{r.note}</span>}
              </span>
            </span>
          ))}
        </div>
        <div className="unit" style={{ marginTop: 8 }}>Only items with 3 or more settled are shown. Hook type counts ad variations; the others count concepts.</div>
        {drill && (
          <div className="tray" style={{ marginTop: 14, padding: 16, borderRadius: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 4px 10px", gap: 10 }}>
              <span style={{ fontSize: 16, fontWeight: 600 }}>{drill.label} <span className="unit" style={{ fontWeight: 400, marginLeft: 8, fontSize: 13 }}>{drill.won} of {drill.settled} won · per {drill.unit === "variation" ? "ad variation" : "concept"}</span></span>
              <button type="button" className="x-btn" aria-label="Close" onClick={() => setDrill(null)}>✕</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {drill.items.slice(0, 8).map((d, i) => (
                <div className="sc-drill" key={i}>
                  <span className={`tag ${d.tone}`} style={{ justifyContent: "center" }}><i aria-hidden="true" />{d.state}</span>
                  <span style={{ fontSize: 14, fontWeight: 500, minWidth: 0 }}>“{d.line}”</span>
                  <span className="unit">{d.who}</span>
                  {d.url ? <a href={d.url} target="_blank" rel="noopener noreferrer" className="sc-link">▶ Watch</a> : <span className="unit" style={{ textAlign: "right" }}>—</span>}
                </div>
              ))}
            </div>
            {drill.items.length > 8 && <div className="unit" style={{ padding: "8px 4px 0" }}>+ {drill.items.length - 8} more</div>}
          </div>
        )}
      </section>

      <section className="card sc-row" aria-labelledby="h-sc-best">
        <h3 id="h-sc-best">{forFounder ? "Her best scripts" : "My best scripts"}</h3>
        {data.best.length === 0 ? <span className="unit">Your first winner shows here.</span> : data.best.map((b) => (
          b.url ? <a key={b.taskId} href={b.url} target="_blank" rel="noopener noreferrer" className="btn b-ghost">{b.label} ↗</a> : <span key={b.taskId} className="btn b-ghost">{b.label}</span>
        ))}
      </section>

      <section className="sc-off">
        <span style={{ fontSize: 13, color: "#55564F" }}><b>Bonus and level</b> · hidden at launch, appear once the rules are set in Settings</span>
        <span className="tag t-grey"><i aria-hidden="true" />OFF</span>
      </section>
    </section>
  );
}
