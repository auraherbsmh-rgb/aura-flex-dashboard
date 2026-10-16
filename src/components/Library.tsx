"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { CopyName } from "./ScriptDetails";
import { LIB_STATE, NO_FILTER, STEP_NAMES, filterLibrary, type LibFilter, type LibRow } from "@/lib/library-shared";

const STEP_COLORS = ["#2C2C2C", "#55564F", "#77776F", "#C63421", "#8C8C86", "#B9B9B3"];
const AWARENESS = ["Problem-Aware", "Solution-Aware", "Product-Aware", "Most-Aware"];
const fmt = (iso: string | null) => (iso ? new Date(Date.parse(iso) + 36e5).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "—");

type Opt = { id: string; label: string };

function Sel({ label, value, onChange, opts }: { label: string; value: string; onChange: (v: string) => void; opts: Opt[] }) {
  return (
    <label className="lib-f">
      <span className="lbl">{label}</span>
      <select className="inp" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All</option>
        {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </label>
  );
}

/** Copywriting → Library (founders): every script with its details; filters, search, and a record per script. */
export function Library({ rows, avatars, angles, formats, hookTypes, mainArguments }: {
  rows: LibRow[];
  avatars: string[];
  angles: Opt[];
  formats: string[];
  hookTypes: string[];
  mainArguments: Opt[];
}) {
  const [f, setF] = useState<LibFilter>(NO_FILTER);
  const [sel, setSel] = useState<string | null>(null);
  const shown = filterLibrary(rows, f);
  const rec = rows.find((r) => r.taskId === sel) ?? null;
  const argLabel = (id: string) => mainArguments.find((a) => a.id === id)?.label ?? "—";
  const count = (s: string) => rows.filter((r) => r.state === s).length;
  const set = (k: keyof LibFilter) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const active = Object.entries(f).some(([, v]) => v);
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 16 }} aria-labelledby="h-lib">
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "baseline", justifyContent: "space-between" }}>
        <h2 id="h-lib" style={{ margin: 0, fontSize: 28, fontWeight: 600, letterSpacing: "-0.03em" }}>Every script, with its details</h2>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <span className="pill raise"><b>{rows.length}</b>script{rows.length === 1 ? "" : "s"}</span>
        <span className="pill raise"><b>{count("testing")}</b>testing</span>
        <span className="pill raise"><b>{count("production")}</b>in production</span>
        {count("hold") > 0 && <span className="pill raise"><b>{count("hold")}</b>on hold</span>}
        <span className="pill raise" style={{ color: "#8c8c86" }}>won / lost · with Meta</span>
      </div>
      <div className="tray lib-filters">
        <label className="lib-f lib-q">
          <span className="lbl">Search hook lines, headlines, faces</span>
          <input className="inp" type="search" value={f.q} onChange={set("q")} placeholder="e.g. mosque, stairs, Sami" />
        </label>
        <Sel value={f.avatar} onChange={(v) => setF({ ...f, avatar: v })} label="Avatar" opts={avatars.map((a) => ({ id: a, label: a }))} />
        <Sel value={f.awareness} onChange={(v) => setF({ ...f, awareness: v })} label="Awareness" opts={AWARENESS.map((a) => ({ id: a, label: a.replace("-Aware", "") }))} />
        <Sel value={f.angle} onChange={(v) => setF({ ...f, angle: v })} label="Angle" opts={angles} />
        <Sel value={f.format} onChange={(v) => setF({ ...f, format: v })} label="Format" opts={formats.map((x) => ({ id: x, label: x }))} />
        <Sel value={f.hook} onChange={(v) => setF({ ...f, hook: v })} label="Hook type" opts={hookTypes.map((x) => ({ id: x, label: x }))} />
        <Sel value={f.arg} onChange={(v) => setF({ ...f, arg: v })} label="Main argument" opts={mainArguments} />
        <Sel value={f.state} onChange={(v) => setF({ ...f, state: v })} label="State" opts={(["production", "hold", "testing"] as const).map((s) => ({ id: s, label: LIB_STATE[s].word.toLowerCase().replace(/^./, (c) => c.toUpperCase()) }))} />
        {active && <button type="button" className="btn b-ghost" style={{ alignSelf: "flex-end" }} onClick={() => setF(NO_FILTER)}>Clear</button>}
      </div>
      <div className="tray pipe lib-table" role="table" aria-label="Scripts">
        <div className="lib-row lib-head" role="row">
          <span className="lbl" role="columnheader">Script · newest first</span>
          <span className="lbl" role="columnheader">Format</span>
          <span className="lbl" role="columnheader">Main argument</span>
          <span className="lbl" role="columnheader">Copywriter</span>
          <span className="lbl" role="columnheader">Approved → live</span>
          <span className="lbl" role="columnheader">State</span>
          <span className="lbl" role="columnheader" style={{ textAlign: "right" }}>Best CPA / line</span>
        </div>
        {shown.length === 0 && <div className="info">{rows.length ? "No script matches these filters." : "No script has reached production yet."}</div>}
        {shown.map((r) => (
          <button type="button" key={r.taskId} className="row lib-row" role="row" onClick={() => setSel(r.taskId)} aria-label={`${r.name}, ${r.cell}, ${r.angle}: open its record`}>
            <span role="cell" style={{ minWidth: 0 }}><b className="pipe-name">{r.name}</b><span className="pipe-meta" style={{ display: "block" }}>{r.cell} · {r.angle}</span></span>
            <span role="cell" className="lib-c">{r.format}</span>
            <span role="cell" className="lib-c">{argLabel(r.mainArgumentId)}</span>
            <span role="cell" className="lib-c">{r.copywriter}</span>
            <span role="cell" className="lib-c mono">{fmt(r.approvedAt)} → {r.launchedAt ? fmt(r.launchedAt) : "—"}</span>
            <span role="cell"><span className={`tag ${LIB_STATE[r.state].tone}`}><i aria-hidden="true" />{LIB_STATE[r.state].word}</span></span>
            <span role="cell" className="lib-c mono" style={{ textAlign: "right", color: "#8c8c86" }}>—</span>
          </button>
        ))}
      </div>
      <div className="unit" style={{ padding: "0 8px" }}>Showing {shown.length} of {rows.length} · click a script to open its record. Results (won, lost, CPA, script parts) come with Meta.</div>

      <Modal open={!!rec} onClose={() => setSel(null)} who={rec ? `${rec.cell} · ${rec.angle} · ${rec.format}` : ""} title={rec?.name ?? ""} width={760}>
        {rec && (() => {
          const total = rec.days.reduce((a, b) => a + b, 0);
          return (
            <>
              <span className={`tag ${LIB_STATE[rec.state].tone}`} style={{ alignSelf: "flex-start" }}><i aria-hidden="true" />{LIB_STATE[rec.state].word}</span>
              <div className="lib-facts">
                <div><span className="lbl">Face</span><b>{rec.name}</b></div>
                <div><span className="lbl">Main argument</span><b>{argLabel(rec.mainArgumentId)}</b></div>
                <div><span className="lbl">Offer</span><b>{rec.offer ? `${rec.offer} bottle${rec.offer > 1 ? "s" : ""}` : "None"}</b></div>
                <div><span className="lbl">Made by</span><b>{rec.copywriter}{rec.editor ? ` · ${rec.editor}` : ""}</b></div>
              </div>
              <div className="field">
                <span className="lbl">Days per step · {Math.round(total * 10) / 10} d {rec.done ? "to launch" : "so far"}</span>
                <div className="recess lib-steps" role="img" aria-label={STEP_NAMES.map((s, i) => `${s} ${rec.days[i]} days`).join(", ")}>
                  {rec.days.map((x, i) => x > 0 ? <span key={i} style={{ flex: x, background: STEP_COLORS[i] }} title={`${STEP_NAMES[i]} ${x} d`}>{x >= 1 ? `${x} d` : ""}</span> : null)}
                </div>
                <div className="lib-legend">{STEP_NAMES.map((s, i) => <span key={s}><i style={{ background: STEP_COLORS[i] }} />{s} <b>{rec.days[i]}</b></span>)}</div>
              </div>
              <div className="field">
                <span className="lbl">Hooks · {rec.hooks.length}</span>
                {rec.hooks.map((h) => (
                  <div className="lib-hook" key={h.v}>
                    <span className="mono" style={{ fontWeight: 600 }}>V{h.v}</span>
                    <span className="tag t-grey" style={{ justifySelf: "start" }}>{h.type || "Testimonial"}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 14 }}>“{h.line}”{h.headline ? <span className="unit"> · on screen: {h.headline}</span> : null}</span>
                      <span className="copy" style={{ marginTop: 4 }}><span>{h.name}</span><CopyName text={h.name} /></span>
                    </span>
                  </div>
                ))}
                <div className="unit">Opening, hold, clicks and 7-day CPA per hook come with Meta.</div>
              </div>
              {(rec.looms.length > 0 || rec.links.length > 0) && (
                <div className="lib-links">
                  {rec.looms.map((l) => <a key={l.url + l.label} className="btn b-ghost" href={l.url} target="_blank" rel="noopener noreferrer">Loom · {l.label} ↗</a>)}
                  {rec.links.map((l) => <a key={l.label} className="btn b-ghost" href={l.url} target="_blank" rel="noopener noreferrer">{l.label}</a>)}
                </div>
              )}
            </>
          );
        })()}
      </Modal>
    </section>
  );
}
