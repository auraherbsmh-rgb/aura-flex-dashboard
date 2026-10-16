"use client";

import Link from "next/link";
import { useState } from "react";
import { RAIL, type Pipeline } from "@/lib/pipeline-shared";

/** Scripts pipeline (artboard "Scripts pipeline"): one row per script in progress, late first. Click a row → its task. */
export function ScriptsPipeline({ data, writers, forFounder }: { data: Pipeline; writers: [string, string][]; forFounder: boolean }) {
  const [cw, setCw] = useState<string | null>(null);
  const rows = cw ? data.rows.filter((r) => r.copywriterId === cw) : data.rows;
  const handed = cw ? data.handed.filter((h) => h.copywriterId === cw) : data.handed;
  const late = rows.filter((r) => r.late).length;
  const onYou = rows.filter((r) => r.onFounder).length;

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 16 }} aria-labelledby="h-pipe">
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
        <h2 id="h-pipe" style={{ margin: 0, fontSize: 28, fontWeight: 600, letterSpacing: "-0.03em" }}>{forFounder ? "Scripts in progress" : "My scripts in progress"}</h2>
        {forFounder && writers.length > 0 && (
          <div className="recess wseg" role="group" aria-label="Copywriter">
            {writers.map(([id, name]) => (
              <button key={id} type="button" className={cw === id ? "seg-on" : ""} aria-pressed={cw === id} onClick={() => setCw(id)}>{name}</button>
            ))}
            <button type="button" className={!cw ? "seg-on" : ""} aria-pressed={!cw} onClick={() => setCw(null)}>All</button>
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <span className="pill raise"><b>{rows.length}</b>script{rows.length === 1 ? "" : "s"}</span>
        <span className={`pill ${late ? "pill-r" : "raise"}`}><b>{late}</b>late</span>
        {forFounder && <span className="pill raise"><b>{onYou}</b>waiting on you</span>}
      </div>

      <div className="tray pipe">
        <div className="pipe-grid pipe-head" aria-hidden="true">
          <span className="lbl">Script · late first</span>
          <div className="rail">{RAIL.map((s) => <span key={s} className="st">{s}</span>)}</div>
          <span className="lbl">Waiting on</span>
          <span className="lbl" style={{ textAlign: "right" }}>Due / late</span>
        </div>
        {rows.length === 0 && <div className="info">No script in progress.</div>}
        {rows.map((r) => (
          <Link key={r.id} href={`/copywriting?task=${r.id}#task-view`} className={`row pipe-row ${r.late ? "row-late" : ""}`}>
            <div className="pipe-grid">
              <div style={{ minWidth: 0 }}>
                <div className="pipe-name">{r.name}</div>
                <div className="pipe-meta">{r.meta}</div>
              </div>
              <div className="rail" aria-label={`Steps: ${RAIL.map((s, i) => `${s} ${r.steps[i] === "todo" ? "to do" : r.steps[i] === "skip" ? "skipped" : r.steps[i]}`).join(", ")}`}>
                {r.steps.map((s, i) =>
                  s === "now" || s === "late"
                    ? <span key={i} className={s === "late" ? "s-b" : "s-n"}>{r.nowLabel}</span>
                    : <span key={i} className={`s ${s === "done" ? "s-d" : s === "skip" ? "s-k" : ""}`} />,
                )}
              </div>
              <div className="rail rail-lbl" aria-hidden="true">{RAIL.map((s) => <span key={s} className="st">{s}</span>)}</div>
              <div style={{ fontSize: 13 }}><b>{r.waitingOn}</b> · {r.waitingWhat}</div>
              <div className={`due ${r.late ? "red" : ""}`}>{r.due}</div>
            </div>
          </Link>
        ))}
        <div className="handed">
          <span style={{ fontSize: 14, color: "var(--ink-2)" }}>
            <b style={{ color: "var(--ink)" }}>Handed to production this week · {handed.length}</b> · details confirmed, now in production
          </span>
          <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {handed.map((h) => <Link key={h.id} href={`/copywriting?task=${h.id}#task-view`} className="pchip">{h.label}</Link>)}
          </span>
        </div>
      </div>
      <div className="pipe-legend">
        <span>Black = step done</span><span>Outlined = where it is now, time spent there</span><span>Red = late on that step</span><span>Hatched = skipped (no changes asked)</span><span>Click a row → its task</span>
      </div>
      {!forFounder && <div className="unit" style={{ padding: "0 8px" }}>Read-only: your own scripts.</div>}
    </section>
  );
}
