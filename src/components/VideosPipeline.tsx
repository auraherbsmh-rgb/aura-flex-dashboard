"use client";

import { F } from "./FounderNames";
import Link from "next/link";
import { useState } from "react";
import { VRAIL, type VideoRow } from "@/lib/editing-shared";
import type { EditorLoad, ProdCard, Production } from "@/lib/tasks-shared";
import { AssignButton, FootageButton } from "./Production";
import { PlanFilter, PlanTagChip } from "./PlanTags";
import type { PlanTag } from "@/lib/plan-shared";

/** Videos pipeline (Founder 2): one row per video in production, late first. Click a row → its task. */
export function VideosPipeline({
  rows,
  editors,
  ed,
  pick,
  onOpen,
  cards = {},
  current = {},
  editorLoads = [],
  onTestimonials,
  plan = {},
}: {
  /** Monday plan tags (taskId → this week / from last week). */
  plan?: Record<string, PlanTag>;
  rows: VideoRow[];
  /** For rows not with an editor yet: what the Footage received / Assign pop-ups show. */
  cards?: Record<string, ProdCard>;
  current?: Record<string, Production>;
  editorLoads?: EditorLoad[];
  editors: [string, string][];
  /** Same Editor A · B · All choice as the queue (one switch for both views). */
  ed: string | null;
  pick: (id: string | null) => void;
  /** Opens a video that is with an editor right in the queue (no page load). */
  onOpen?: (taskId: string) => void;
  /** Editing → Testimonials: switches the view in place (a same-route Link keeps the board's state). */
  onTestimonials?: () => void;
}) {
  const setEd = pick;
  const [act, setAct] = useState<{ id: string; kind: "footage" | "assign" } | null>(null);
  const [msg, setMsg] = useState("");
  const [planOnly, setPlanOnly] = useState(false);
  const byEditor = ed ? rows.filter((r) => r.editorId === ed) : rows;
  const shown = planOnly ? byEditor.filter((r) => plan[r.taskId]) : byEditor;
  const moving = shown.filter((r) => !r.hold);
  const late = moving.filter((r) => r.late).length;
  const onYou = moving.filter((r) => r.waitingOn === "You").length;
  const onAgency = moving.filter((r) => r.waitingOn === "Agency").length;
  const onHold = shown.length - moving.length;
  const actCard = act ? cards[act.id] : undefined;
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
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <PlanFilter on={planOnly} set={setPlanOnly} count={byEditor.filter((r) => plan[r.taskId]).length} />
        <span className="pill raise"><b>{shown.length}</b>video{shown.length === 1 ? "" : "s"}</span>
        <span className={`pill ${late ? "pill-r" : "raise"}`}><b>{late}</b>late</span>
        <span className="pill raise"><b>{onYou}</b>waiting on you</span>
        <span className="pill raise"><b>{onAgency}</b>waiting on the agency</span>
        {onHold > 0 && <span className="pill raise"><b>{onHold}</b>on hold</span>}
      </div>
      {msg && <div className="notice notice-green" role="status">{msg}</div>}
      {act && actCard && act.kind === "footage" && (
        <FootageButton key={act.id} startOpen card={actCard} current={current[act.id]} who="Founder 2 · Footage received" onClose={() => setAct(null)} onDone={setMsg} />
      )}
      {act && actCard && act.kind === "assign" && (
        <AssignButton key={act.id} startOpen card={actCard} editors={editorLoads} current={current[act.id]} who="Founder 2 · Assign" onClose={() => setAct(null)} onDone={setMsg} />
      )}
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
            className={`row pipe-row ${r.late ? "row-late" : ""} ${r.hold ? "row-hold" : ""}`}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
              // Not with an editor yet: open Footage received / Assign right here (founder choice Oct 16).
              if (r.action && cards[r.taskId]) { e.preventDefault(); setMsg(""); setAct({ id: r.taskId, kind: r.action }); return; }
              if (onTestimonials && r.href.startsWith("/editing?view=testimonials")) { e.preventDefault(); onTestimonials(); return; }
              if (!onOpen || !r.editorId) return;
              e.preventDefault();
              onOpen(r.taskId);
            }}
          >
            <div className="pipe-grid">
              <div style={{ minWidth: 0 }}>
                <div className="pipe-name">{r.name}<PlanTagChip tag={plan[r.taskId]} />{r.hold && <> <span className="tag t-hold" style={{ verticalAlign: "middle", marginLeft: 6 }}><i aria-hidden="true" />ON HOLD</span></>}</div>
                <div className="pipe-meta">{r.meta}</div>
                {r.hold?.reason && <div className="pipe-meta">On hold: {r.hold.reason}</div>}
                <div className="pipe-meta">{r.origin}</div>
                <span className="sr-only">
                  {r.hold ? "On hold. " : ""}{r.action && cards[r.taskId] ? `Opens ${r.action === "footage" ? (r.waitingWhat === "VO recording" ? "VO received" : "Footage received") : "Assign"}. ` : ""}Steps: {VRAIL.map((s, i) => {
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
              <div style={{ fontSize: 13 }}><b><F>{r.waitingName}</F></b> · {r.waitingWhat}</div>
              <div className={`due ${r.late ? "red" : ""}`}>{r.due}</div>
            </div>
          </Link>
        ))}
      </div>
      <div className="pipe-legend">
        <span>Black = step done</span><span>Outlined = where it is now, time spent there</span><span>Red = late on that step</span><span>Hatched = skipped (AI / 3D, VO and testimonials have no shoot)</span><span>Click a row → Footage / VO received, Assign, or the video</span><span>Striped = on hold (no alerts)</span>
      </div>
      <div className="unit" style={{ padding: "0 8px" }}>
        Late rules (Settings): footage not received 2 days after the shoot date (VO: 2 days after the details are confirmed) · editing due date passed or round 3 · review waiting over 48 h · launch waiting over 2 days. Videos on hold skip these until resumed. Each also reaches your Home as a Needs-me item.
      </div>
    </section>
  );
}
