"use client";

import { useState } from "react";
import { ProposeButton } from "./Proposals";
import { LEVEL_SHORT, STATE_WORD, buildMap, conceptState, groupByAngle, mapConcepts, mix, type MapCell, type MapConcept } from "@/lib/map-shared";
import type { Pickers } from "@/lib/proposals-shared";

export type MapData = { concepts: MapConcept[]; start: string | null; avatars: { id: string; code: string | null; label: string }[] };
export type CellKey = { avatarId: string; awareness: string };

const CELL_CLASS: Record<MapCell["state"], string> = { test: "s-test", production: "s-prod", writing: "s-writing", empty: "s-empty" };

/** Knee | Hips switch + the avatar × awareness grid (Copywriting artboard "Map"). Click a cell → its cell view. */
export function MapGrid({ data, track, setTrack, selected, onPick, big = false, pickers }: {
  data: MapData;
  track: "knee" | "hips";
  setTrack: (t: "knee" | "hips") => void;
  selected: CellKey | null;
  onPick: (k: CellKey) => void;
  big?: boolean;
  /** With pickers, a click on an empty cell opens the Propose pop-up for that cell at once. */
  pickers?: Pickers;
}) {
  const [propose, setPropose] = useState<CellKey | null>(null);
  const rows = buildMap(mapConcepts(data.concepts, track, data.start), data.avatars);
  const empty = rows.reduce((n, r) => n + r.cells.filter((c) => c.state === "empty").length, 0);
  return (
    <section className={`card sec map ${big ? "map-big" : ""}`} aria-labelledby="h-map">
      <div className="map-head">
        <h2 id="h-map" style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Map</h2>
        <div className="recess wseg" role="group" aria-label="Track">
          {(["knee", "hips"] as const).map((t) => (
            <button key={t} type="button" className={track === t ? "seg-on" : ""} aria-pressed={track === t} onClick={() => setTrack(t)}>{t === "knee" ? "Knee" : "Hips"}</button>
          ))}
        </div>
      </div>
      {propose && pickers && (
        <ProposeButton key={`${propose.avatarId}-${propose.awareness}`} pickers={pickers} autoOpen prefill={propose} onClose={() => setPropose(null)} />
      )}
      <div className="map-grid" role="table" aria-label={`Map · ${track}`}>
        <div className="map-row" role="row">
          <span role="columnheader" />
          {Object.values(LEVEL_SHORT).map((l) => (
            <span key={l} role="columnheader" className="lbl map-col" style={{ textAlign: "center", padding: "4px 0" }}>
              <span className="map-col-long">{l}</span><span className="map-col-short" aria-hidden="true">{l === "Product" ? "Prod" : l === "Solution" ? "Sol" : l === "Problem" ? "Prob" : "Most"}</span>
            </span>
          ))}
        </div>
        {rows.map((r) => (
          <div className="map-row" role="row" key={r.avatarId}>
            <span role="rowheader" className="map-av" title={r.label}>{r.avatarCode}</span>
            {r.cells.map((c) => {
              const on = selected?.avatarId === c.avatarId && selected.awareness === c.awareness;
              return (
                <span role="cell" key={c.awareness} style={{ display: "flex" }}>
                  <button type="button" className={`cell ${CELL_CLASS[c.state]} ${on ? "cell-on" : ""}`} aria-pressed={on}
                    aria-label={`${r.avatarCode} × ${LEVEL_SHORT[c.awareness]}: ${c.state === "empty" ? "empty, click to propose a test" : c.line}`} onClick={() => {
                      const k = { avatarId: c.avatarId, awareness: c.awareness };
                      onPick(k);
                      // A fresh pop-up every click (also after a proposal was sent for this cell).
                      if (c.state === "empty" && pickers) { setPropose(null); requestAnimationFrame(() => setPropose(k)); }
                    }}>
                    <b>{c.word}</b><span className="cell-line">{c.state === "empty" ? <><span className="map-col-long">{c.line}</span><span className="map-col-short" aria-hidden="true">+</span></> : c.line}</span>
                  </button>
                </span>
              );
            })}
          </div>
        ))}
        {rows.length === 0 && <div className="info">No avatar yet. Add them in Settings → Lists.</div>}
      </div>
      <div className="map-legend">
        <span className="part s-test">TEST</span><span className="part s-prod">IN PROD</span><span className="part s-writing">WRITING</span><span className="part s-empty">EMPTY</span>
        <span className="part s-meta">WIN · FADING · LOST → WITH META</span>
      </div>
      <div className="unit">
        Counts are concepts{data.start ? ` created from ${new Date(`${data.start}T12:00:00Z`).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })} (Settings)` : ""}. Test = launched, no verdict yet · In prod = script done, in production · Writing = a task is being written.
        {" "}{empty} empty cell{empty === 1 ? "" : "s"}: click one to propose a test. Won, fading and lost come with the Meta results.
      </div>
    </section>
  );
}

const TAG: Record<string, string> = { test: "t-amber", production: "t-grey", writing: "t-grey" };

/** Cell view (handoff §7): grouped by angle → concepts → ad variations. Results (CPA, script parts) come with Meta. */
export function CellView({ data, cell, track, pickers, onBack, backLabel }: {
  data: MapData;
  cell: CellKey;
  track: "knee" | "hips";
  pickers?: Pickers;
  onBack?: () => void;
  backLabel?: string;
}) {
  const avatar = data.avatars.find((a) => a.id === cell.avatarId);
  const concepts = mapConcepts(data.concepts, track, data.start).filter((c) => c.avatarId === cell.avatarId && c.awareness === cell.awareness);
  const groups = groupByAngle(concepts);
  const [open, setOpen] = useState<Record<string, boolean>>(() => (groups[0] ? { [groups[0].angleId]: true } : {}));
  const [openC, setOpenC] = useState<Record<string, boolean>>({});
  const counts = { test: 0, production: 0, writing: 0 };
  for (const c of concepts) counts[conceptState(c)]++;
  const title = `${avatar?.code ?? "?"} × ${cell.awareness}`;
  return (
    <section className="card sec cellv" id="cell-view" aria-labelledby="h-cell">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <div className="lbl">Cell{avatar ? ` · ${avatar.label}` : ""}</div>
          <h2 id="h-cell" style={{ margin: "8px 0 6px", fontSize: 28, fontWeight: 600, letterSpacing: "-0.03em" }}>{title}</h2>
          <div className="unit" style={{ fontSize: 14 }}>
            {groups.length} angle{groups.length === 1 ? "" : "s"} · {concepts.length} concept{concepts.length === 1 ? "" : "s"}
            {counts.test ? ` · ${counts.test} testing` : ""}{counts.production ? ` · ${counts.production} in production` : ""}{counts.writing ? ` · ${counts.writing} writing` : ""}
          </div>
        </div>
        {onBack && <button type="button" className="btn b-ghost" onClick={onBack}>{backLabel ?? "← Back"}</button>}
      </div>

      {concepts.length === 0 && (
        <div className="info" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
          <span>Nothing tested here yet.</span>
          {pickers && <ProposeButton pickers={pickers} className="btn b-primary" prefill={{ avatarId: cell.avatarId, awareness: cell.awareness }} />}
        </div>
      )}

      {groups.map((g, gi) => {
        const isOpen = !!open[g.angleId];
        return (
          <div className="cv-angle" key={g.angleId}>
            <button type="button" className="cv-angle-head" aria-expanded={isOpen} onClick={() => setOpen({ ...open, [g.angleId]: !isOpen })}>
              <span className="cv-caret" aria-hidden="true">{isOpen ? "▾" : "▸"}</span>
              <span style={{ minWidth: 0 }}>
                <span className="lbl">Angle {gi + 1}</span>
                <span className="cv-angle-name">{g.angle}</span>
              </span>
              <span className={`tag ${g.counts.test ? "t-amber" : "t-grey"}`}><i aria-hidden="true" />
                {/* Every state with its count, so a mix never reads as all testing. */}
                {[g.counts.test ? `${g.counts.test} TESTING` : "", g.counts.production ? `${g.counts.production} IN PROD` : "", g.counts.writing ? `${g.counts.writing} WRITING` : ""].filter(Boolean).join(" · ")}
              </span>
            </button>
            {isOpen && (
              <div className="cv-concepts">
                {g.concepts.map((c) => {
                  const st = conceptState(c);
                  const co = !!openC[c.taskId];
                  const kind = c.origin === "testimonial" ? "Testimonial" : c.generate ? "AI / 3D" : c.vo ? `${c.format} · VO` : c.format;
                  return (
                    <div className="cv-concept" key={c.taskId}>
                      <button type="button" className="cv-concept-head" aria-expanded={co} onClick={() => setOpenC({ ...openC, [c.taskId]: !co })}>
                        <span className="cv-caret" aria-hidden="true">{c.variations.length ? (co ? "▾" : "▸") : "·"}</span>
                        <span style={{ minWidth: 0 }}>
                          <span className="cv-name">{c.face ?? "No face yet"}</span>
                          <span className="unit"> · {kind} · {c.variations.length} variation{c.variations.length === 1 ? "" : "s"}{c.copywriter ? ` · ${c.copywriter}` : ""}</span>
                        </span>
                        <span className={`tag ${TAG[st]}`}><i aria-hidden="true" />{c.holdAt && st === "production" ? "ON HOLD" : STATE_WORD[st]}</span>
                      </button>
                      {co && c.variations.length > 0 && (
                        <div className="cv-vars">
                          {c.variations.map((v) => (
                            <div className="cv-var" key={v.v}>
                              <span className="mono" style={{ fontWeight: 600 }}>V{v.v}</span>
                              <span className="tag t-grey">{v.type ?? "Testimonial"}</span>
                              <span style={{ minWidth: 0 }}>
                                <span style={{ display: "block", fontSize: 14 }}>“{v.line}”</span>
                                <span className="vname">{v.name}</span>
                              </span>
                            </div>
                          ))}
                          <div className="unit">CPA, opening, hold and clicks per variation come with Meta.</div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {(() => {
                  // Mix per angle (artboard "Mix in this angle"): the angle is what is tested, so formats and hooks are read inside it.
                  const m = mix(g.concepts);
                  return (
                    <div className="cv-mix">
                      <div className="lbl">Mix in this angle</div>
                      <div className="cv-mix-row"><span className="unit">Video format per concept</span>{m.formats.map(([k, n]) => <span key={k} className="chip recess">{k} {n}/{g.concepts.length}</span>)}</div>
                      <div className="cv-mix-row"><span className="unit">Hook type per variation</span>{m.hooks.length ? m.hooks.map(([k, n]) => <span key={k} className="chip recess">{k} {n}</span>) : <span className="unit">none yet</span>}</div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        );
      })}
      {concepts.length > 0 && pickers && (
        <div><ProposeButton pickers={pickers} label="+ Propose a new angle in this cell" className="btn b-ghost" prefill={{ avatarId: cell.avatarId, awareness: cell.awareness }} /></div>
      )}
    </section>
  );
}

/** Map & performance tab: the map with its cell view beside it. */
export function MapPage({ data, pickers }: { data: MapData; pickers?: Pickers }) {
  const [track, setTrack] = useState<"knee" | "hips">("knee");
  const [cell, setCell] = useState<CellKey | null>(null);
  return (
    <div className="map-page">
      <MapGrid data={data} track={track} setTrack={setTrack} selected={cell} pickers={pickers} onPick={(k) => {
        setCell(k);
        if (window.innerWidth < 1000) requestAnimationFrame(() => document.getElementById("cell-view")?.scrollIntoView({ behavior: "smooth", block: "start" }));
      }} big />
      <div style={{ minWidth: 0 }}>
        {cell ? <CellView key={`${cell.avatarId}-${cell.awareness}-${track}`} data={data} cell={cell} track={track} pickers={pickers} /> : (
          <section className="card sec"><div className="info">Click a cell to see its angles, concepts and ad variations.</div></section>
        )}
      </div>
    </div>
  );
}
