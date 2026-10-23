"use client";

import { F } from "./FounderNames";
import Link from "next/link";
import { useState } from "react";
import { RAIL, type Pipeline } from "@/lib/pipeline-shared";
import { PlanFilter, PlanTagChip } from "./PlanTags";
import type { PlanTag } from "@/lib/plan-shared";

/** Scripts pipeline (artboard "Scripts pipeline"): one row per script in progress, late first. Click a row → its task. */
/** Opens a script on the Board without a page load: the Board follows ?task in the address. */
function openOnBoard(e: React.MouseEvent, id: string, copywriterId: string) {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  const q = new URLSearchParams(window.location.search);
  q.delete("view");
  q.set("task", id);
  if (q.get("cw") && q.get("cw") !== copywriterId) q.delete("cw");
  window.history.replaceState(null, "", `/copywriting?${q}`);
  // Same task as already in the address: tell the Board directly (closes an open map cell).
  window.dispatchEvent(new CustomEvent("aura:open-task", { detail: id }));
  // The Board shows once the address change has rendered: wait until the task view is visible, then scroll to it.
  let tries = 0;
  const scroll = () => {
    const el = document.getElementById("task-view");
    if (el && el.offsetParent !== null) el.scrollIntoView({ behavior: "smooth", block: "start" });
    else if (tries++ < 30) requestAnimationFrame(scroll);
  };
  requestAnimationFrame(scroll);
}

export function ScriptsPipeline({ data, writers, forFounder, initialCw = null, plan = {} }: { data: Pipeline; writers: [string, string][]; forFounder: boolean; initialCw?: string | null; plan?: Record<string, PlanTag> }) {
  const [cw, setCw] = useState<string | null>(initialCw);
  const [planOnly, setPlanOnly] = useState(false);
  const byWriter = cw ? data.rows.filter((r) => r.copywriterId === cw) : data.rows;
  const rows = planOnly ? byWriter.filter((r) => plan[r.id]) : byWriter;
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
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        {forFounder && <PlanFilter on={planOnly} set={setPlanOnly} count={byWriter.filter((r) => plan[r.id]).length} />}
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
          <Link key={r.id} href={`/copywriting?task=${r.id}#task-view`} prefetch={false} onClick={(e) => openOnBoard(e, r.id, r.copywriterId)} className={`row pipe-row ${r.late ? "row-late" : ""}`}>
            <div className="pipe-grid">
              <div style={{ minWidth: 0 }}>
                <div className="pipe-name">{r.name}<PlanTagChip tag={plan[r.id]} /></div>
                <div className="pipe-meta">{r.meta}</div>
              </div>
              <span className="sr-only">
                Steps: {RAIL.map((s, i) => {
                  const st = r.steps[i];
                  return `${s} ${st === "todo" ? "to do" : st === "skip" ? "skipped" : st === "now" ? `now, ${r.nowLabel}` : st === "late" ? `late, ${r.nowLabel}` : st}`;
                }).join(", ")}.
              </span>
              <div className="rail" aria-hidden="true">
                {r.steps.map((s, i) =>
                  s === "now" || s === "late"
                    ? <span key={i} className={s === "late" ? "s-b" : "s-n"}>{r.nowLabel}</span>
                    : <span key={i} className={`s ${s === "done" ? "s-d" : s === "skip" ? "s-k" : ""}`} />,
                )}
              </div>
              <div className="rail rail-lbl" aria-hidden="true">{RAIL.map((s) => <span key={s} className="st">{s}</span>)}</div>
              <div style={{ fontSize: 13 }}><b><F>{r.waitingOn}</F></b> · {r.waitingWhat}</div>
              <div className={`due ${r.late ? "red" : ""}`}>{r.due}</div>
            </div>
          </Link>
        ))}
        <div className="handed">
          <span style={{ fontSize: 14, color: "var(--ink-2)" }}>
            <b style={{ color: "var(--ink)" }}>Handed to production this week · {handed.length}</b> · details confirmed, now in production
          </span>
          <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {handed.map((h) => <Link key={h.id} href={`/copywriting?task=${h.id}#task-view`} prefetch={false} onClick={(e) => openOnBoard(e, h.id, h.copywriterId)} className="pchip" aria-label={`${h.name}: ${h.stage.toLowerCase()}`}><b>{h.name}</b><span className={`tag ${h.tone}`}><i aria-hidden="true" />{h.stage}</span></Link>)}
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
