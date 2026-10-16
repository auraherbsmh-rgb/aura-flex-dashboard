"use client";

import Link from "next/link";
import { VRAIL, type VideoRow } from "@/lib/editing-shared";

/** Videos pipeline (Founder 2): one row per video in production, late first. Click a row → its task. */
export function VideosPipeline({
  rows,
  editors,
  ed,
  pick,
  onOpen,
}: {
  rows: VideoRow[];
  editors: [string, string][];
  /** Same Editor A · B · All choice as the queue (one switch for both views). */
  ed: string | null;
  pick: (id: string | null) => void;
  /** Opens a video that is with an editor right in the queue (no page load). */
  onOpen?: (taskId: string) => void;
}) {
  const setEd = pick;
  const shown = ed ? rows.filter((r) => r.editorId === ed) : rows;
  const late = shown.filter((r) => r.late).length;
  const onYou = shown.filter((r) => r.waitingOn === "You").length;
  const onAgency = shown.filter((r) => r.waitingOn === "Agency").length;
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 16 }} aria-labelledby="h-vpipe">
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
        <h2 id="h-vpipe" style={{ margin: 0, fontSize: 28, fontWeight: 600, letterSpacing: "-0.03em" }}>Videos in production</h2>
        {editors.length > 0 && (
          <div className="recess wseg" role="group" aria-label="Editor">
            {editors.map(([id, name]) => <button key={id} type="button" className={ed === id ? "seg-on" : ""} aria-pressed={ed === id} onClick={() => setEd(id)}>{name}</button>)}
            <button type="button" className={!ed ? "seg-on" : ""} aria-pressed={!ed} onClick={() => setEd(null)}>All</button>
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <span className="pill raise"><b>{shown.length}</b>video{shown.length === 1 ? "" : "s"}</span>
        <span className={`pill ${late ? "pill-r" : "raise"}`}><b>{late}</b>late</span>
        <span className="pill raise"><b>{onYou}</b>waiting on you</span>
        <span className="pill raise"><b>{onAgency}</b>waiting on the agency</span>
      </div>
      <div className="tray pipe">
        <div className="pipe-grid pipe-head" aria-hidden="true">
          <span className="lbl">Video · late first</span>
          <div className="rail">{VRAIL.map((s) => <span key={s} className="st">{s}</span>)}</div>
          <span className="lbl">Waiting on</span>
          <span className="lbl" style={{ textAlign: "right" }}>Due / late</span>
        </div>
        {shown.length === 0 && <div className="info">No video in production.</div>}
        {shown.map((r) => (
          <Link
            key={r.taskId}
            href={r.href}
            className={`row pipe-row ${r.late ? "row-late" : ""}`}
            onClick={(e) => {
              if (!onOpen || !r.editorId || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
              e.preventDefault();
              onOpen(r.taskId);
            }}
          >
            <div className="pipe-grid">
              <div style={{ minWidth: 0 }}>
                <div className="pipe-name">{r.name}</div>
                <div className="pipe-meta">{r.meta}</div>
                <div className="pipe-meta">{r.origin}</div>
                <span className="sr-only">
                  Steps: {VRAIL.map((s, i) => {
                    const st = r.steps[i];
                    return `${s} ${st === "todo" ? "to do" : st === "skip" ? "skipped" : st === "now" ? `now, ${r.nowLabel}` : st === "late" ? `late, ${r.nowLabel}` : st}`;
                  }).join(", ")}.
                </span>
              </div>
              <div className="rail" aria-hidden="true">
                {r.steps.map((s, i) =>
                  s === "now" || s === "late"
                    ? <span key={i} className={s === "late" ? "s-b" : "s-n"}>{r.nowLabel}</span>
                    : <span key={i} className={`s ${s === "done" ? "s-d" : s === "skip" ? "s-k" : ""}`} />,
                )}
              </div>
              <div className="rail rail-lbl" aria-hidden="true">{VRAIL.map((s) => <span key={s} className="st">{s}</span>)}</div>
              <div style={{ fontSize: 13 }}><b>{r.waitingName}</b> · {r.waitingWhat}</div>
              <div className={`due ${r.late ? "red" : ""}`}>{r.due}</div>
            </div>
          </Link>
        ))}
      </div>
      <div className="pipe-legend">
        <span>Black = step done</span><span>Outlined = where it is now, time spent there</span><span>Red = late on that step</span><span>Hatched = skipped (AI / 3D has no shoot)</span><span>Click a row → its task</span>
      </div>
      <div className="unit" style={{ padding: "0 8px" }}>
        Late rules (Settings): footage not received 2 days after the shoot date · editing due date passed or round 3 · review waiting over 48 h · launch waiting over 2 days. Each also reaches your Home as a Needs-me item.
      </div>
    </section>
  );
}
