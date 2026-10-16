"use client";

import Link from "next/link";
import { useState } from "react";
import { TestimonialButton } from "./Testimonial";
import { AssignButton } from "./Production";
import { fmtWhen, tunisDate, type EditorLoad, type ProdCard, type Production, type TestimonialRow } from "@/lib/tasks-shared";
import type { Pickers } from "@/lib/proposals-shared";

export type TestimonialVideo = { name: string; where: string; inQueue: boolean };

type Filter = "all" | "new" | "used" | "not_usable";
const LABEL: Record<TestimonialRow["status"], { word: string; tone: string }> = {
  new: { word: "WAITING", tone: "t-grey" },
  used: { word: "USED", tone: "t-green" },
  not_usable: { word: "NOT USABLE", tone: "t-red" },
};

/**
 * Editing → Testimonials (founders): every support-call recording and what happened to it — waiting (tag it here),
 * used (its video), not usable (the reason). Founder request Oct 16: see how many calls were usable and recover mistakes.
 */
export function TestimonialsList({
  rows,
  videos,
  pickers,
  editors,
  onOpen,
}: {
  rows: TestimonialRow[];
  videos: Record<string, TestimonialVideo>;
  pickers: Pickers;
  editors: EditorLoad[];
  /** Opens a used testimonial's video in the queue (no page load). */
  onOpen: (taskId: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [msg, setMsg] = useState("");
  // Assign after tagging: held here because the row's Tag button goes away once the testimonial is used.
  const [assign, setAssign] = useState<{ card: ProdCard; current: Production } | null>(null);
  const month = tunisDate(0).slice(0, 7);
  const thisMonth = rows.filter((r) => tunisDate(0, Date.parse(r.addedAt)).slice(0, 7) === month);
  const count = (s: TestimonialRow["status"]) => thisMonth.filter((r) => r.status === s).length;
  const shown = filter === "all" ? rows : rows.filter((r) => r.status === filter);
  const tabs: [Filter, string][] = [["all", "All"], ["new", "Waiting"], ["used", "Used"], ["not_usable", "Not usable"]];
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 16 }} aria-labelledby="h-testi">
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
        <h2 id="h-testi" style={{ margin: 0, fontSize: 28, fontWeight: 600, letterSpacing: "-0.03em" }}>Testimonials</h2>
        <div className="recess wseg" role="group" aria-label="Show">
          {tabs.map(([k, l]) => <button key={k} type="button" className={filter === k ? "seg-on" : ""} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>)}
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <span className="pill raise"><b>{thisMonth.length}</b>call{thisMonth.length === 1 ? "" : "s"} this month</span>
        <span className="pill raise"><b>{count("used")}</b>used</span>
        <span className={`pill ${count("not_usable") ? "pill-r" : "raise"}`}><b>{count("not_usable")}</b>not usable</span>
        <span className="pill raise"><b>{count("new")}</b>waiting</span>
      </div>
      {msg && <div className="notice notice-green" role="status">{msg}</div>}
      {assign && <AssignButton key={assign.card.taskId} startOpen card={assign.card} editors={editors} current={assign.current} who="Founder 2 · Assign" onClose={() => setAssign(null)} onDone={setMsg} />}
      <div className="tray pipe" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {shown.length === 0 && <div className="info">{rows.length === 0 ? "No testimonial yet. Add one with + Testimonial." : "None here."}</div>}
        {shown.map((r) => {
          const v = r.taskId ? videos[r.taskId] : undefined;
          const l = LABEL[r.status];
          return (
            <div className="row testi-row" key={r.id}>
              <span className={`tag ${l.tone}`}><i aria-hidden="true" />{l.word}</span>
              <div style={{ minWidth: 0 }}>
                <div className="pipe-name">Support call · {fmtWhen(r.addedAt)}</div>
                <div className="pipe-meta">
                  {r.note ?? "No note"}
                  {r.status === "not_usable" && <> · <b>Why:</b> {r.reason ?? "no reason given"}</>}
                  {r.decidedBy && r.decidedAt && <> · {r.status === "used" ? "tagged" : "marked"} by {r.decidedBy}, {fmtWhen(r.decidedAt)}</>}
                </div>
                {v && <div className="pipe-meta">Video: <b>{v.name}</b> · {v.where}</div>}
              </div>
              <div className="testi-acts">
                <a className="btn b-ghost" href={r.url} target="_blank" rel="noopener noreferrer">Listen ↗</a>
                {r.status === "new" && (
                  <TestimonialButton item={{ id: r.id, url: r.url, note: r.note, addedAt: r.addedAt }} pickers={pickers} editors={editors} label="Tag" className="btn b-primary" onDone={setMsg} onCreated={(card, current) => setAssign({ card, current })} />
                )}
                {r.status === "used" && r.taskId && (
                  v?.inQueue
                    ? <button type="button" className="btn b-ghost" onClick={() => onOpen(r.taskId!)}>Open video</button>
                    : v?.where === "to assign" ? <Link className="btn b-ghost" href="/home">Assign on Home</Link> : null
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="unit" style={{ padding: "0 8px" }}>Not usable recordings are kept, not deleted: the link stays here in case one was marked by mistake.</div>
    </section>
  );
}
