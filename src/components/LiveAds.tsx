"use client";

import { F } from "./FounderNames";
import Link from "next/link";
import { useState } from "react";
import { Modal } from "./Modal";
import { CopyName } from "./ScriptDetails";
import { STATE_TAG, cpa as cpaOf } from "@/lib/meta-shared";
import type { LiveConcept, LiveVariation, Unmapped } from "@/lib/live-shared";

const money = (n: number | null) => (n === null ? "no sale" : `$${n < 10 ? n.toFixed(2) : Math.round(n)}`);
const pct = (n: number | null) => (n === null ? "—" : `${(n * 100).toFixed(n < 0.1 ? 1 : 0)}%`);
const GROUPS = [
  { key: "attention", label: "NEEDS ATTENTION", tone: "red", note: "kill line · fading · deteriorating · flagged variation" },
  { key: "testing", label: "TESTING", tone: "amber", note: "distance to a verdict" },
  { key: "recovering", label: "RECOVERING", tone: "blue", note: "" },
  { key: "won", label: "WON", tone: "green", note: "" },
] as const;

const FROZEN_TAG = { word: "NO VERDICT · BUDGET CHANGED", tone: "t-grey" };

/** CPA box: red over the line, green under, yellow while testing. */
function cpaBox(c: number | null, line: number, testing: boolean) {
  if (testing || c === null) return "bx-y";
  return c > line ? "bx-r" : "bx-g";
}

export type LiveProps = {
  live: LiveConcept[];
  unmapped: Unmapped[];
  frozenEntities: number;
  lastPull: string | null;
  d3Min: number;
  onTag?: (u: Unmapped) => void;
};

/** Map & performance → Live ads (founders, handoff §9 / artboard "Live ads"). Read-only: no button changes Meta. */
export function LiveAds({ live, unmapped, frozenEntities, lastPull, d3Min, onTag }: LiveProps) {
  const [track, setTrack] = useState<"knee" | "hips">("knee");
  const [fmt, setFmt] = useState<"all" | "video" | "static">("all");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [detail, setDetail] = useState<{ c: LiveConcept; v: LiveVariation } | null>(null);
  const onTrack = (t: string | null) => !t || t === "both" || t === track;
  const shown = live.filter((c) => onTrack(c.track)).filter((c) => fmt === "all" || (fmt === "static") === c.isStatic);
  const spendAll = shown.reduce((n, c) => n + c.spend7, 0);
  const spendVideo = shown.filter((c) => !c.isStatic).reduce((n, c) => n + c.spend7, 0);
  const d3 = (c: number | null, sales: number, line: number, frozen = false) =>
    frozen ? <span className="bx bx-n">{sales ? money(c) : "n=0"}</span> : sales >= d3Min ? <span className={`bx ${c !== null && c > line ? "bx-r" : "bx-g"}`}>{money(c)}</span> : <span className="bx bx-n">n={sales}</span>;
  const unmappedLive = unmapped.filter((u) => u.live && onTrack(u.campaignTrack));
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 16 }} aria-labelledby="h-live">
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2 id="h-live" style={{ margin: 0, fontSize: 28, fontWeight: 600, letterSpacing: "-0.03em" }}>Is what we launched working?</h2>
          <div className="unit" style={{ marginTop: 6, fontSize: 13 }}>
            Meta pull {lastPull ?? "—"} · yesterday still attributing{frozenEntities ? ` · ${frozenEntities} ad set${frozenEntities === 1 ? "" : "s"} / campaign${frozenEntities === 1 ? "" : "s"} had a budget change in the last 48h: no verdict yet` : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div className="recess wseg" role="group" aria-label="Track">
            {(["knee", "hips"] as const).map((t) => <button key={t} type="button" className={track === t ? "seg-on" : ""} aria-pressed={track === t} onClick={() => setTrack(t)}>{t === "knee" ? "Knee" : "Hips"}</button>)}
          </div>
          <div className="recess wseg" role="group" aria-label="Format">
            {([["all", "All formats"], ["video", "Video"], ["static", "Static"]] as const).map(([k, l]) => <button key={k} type="button" className={fmt === k ? "seg-on" : ""} aria-pressed={fmt === k} onClick={() => setFmt(k)}>{l}</button>)}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {GROUPS.map((g) => {
          const n = shown.filter((c) => c.group === g.key).length;
          return <span key={g.key} className={`pill ${g.key === "attention" && n ? "pill-r" : "raise"}`}><b>{n}</b>{g.label.toLowerCase().replace(/^./, (x) => x.toUpperCase())} concept{n === 1 ? "" : "s"}</span>;
        })}
        <span className="pill raise"><b>{spendAll ? Math.round((spendVideo / spendAll) * 100) : 0}%</b>videos · share of spend 7d</span>
      </div>

      <div className="tray pipe live-table">
        <div className="live-row live-head" aria-hidden="true">
          <span className="lbl">Concept · cell · angle · format</span><span className="lbl">Concept CPA 7d / line</span><span className="lbl">3d</span>
          <span className="lbl">Spend 7d</span><span className="lbl">Sales 7d</span><span className="lbl">Days live</span><span className="lbl">State</span>
        </div>
        {shown.length === 0 && <div className="info">No live concept on this track{fmt !== "all" ? " and format" : ""}.</div>}
        {GROUPS.map((g) => {
          const list = shown.filter((c) => c.group === g.key);
          if (!list.length) return null;
          return (
            <div key={g.key} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div className={`lane l-${g.tone}`}><i aria-hidden="true" />{g.label}<span style={{ color: "#8c8c86", fontWeight: 500 }}>· {list.length}{g.note ? ` · ${g.note}` : ""}</span></div>
              {list.map((c) => {
                const isOpen = !!open[c.key];
                const st = c.frozen ? FROZEN_TAG : STATE_TAG[c.state];
                return (
                  <div key={c.key} className="live-concept">
                    <button type="button" className="row live-row" aria-expanded={isOpen} onClick={() => setOpen({ ...open, [c.key]: !isOpen })}>
                      <span style={{ minWidth: 0 }}>
                        <b className="pipe-name"><span aria-hidden="true">{isOpen ? "▾ " : "▸ "}</span>{c.info.name} · {c.info.cell}</b>
                        {c.flag && <span className={`tag t-${c.flagTone === "orange" ? "orange" : "red"}`} style={{ marginLeft: 8 }}><i aria-hidden="true" />{c.flag}</span>}
                        <span className="pipe-meta" style={{ display: "block" }}>{c.info.angle} · {c.info.format} · {c.live.length} live variation{c.live.length === 1 ? "" : "s"}{c.kind === "old" ? " · tagged old ad" : ""}</span>
                      </span>
                      <span><span className={`bx ${c.frozen ? "bx-n" : cpaBox(c.cpa7, c.line, c.state === "testing")}`}>{money(c.cpa7)}</span> <span className="unit">/ {c.line.toFixed(2)}</span></span>
                      <span>{d3(c.cpa3, c.sales3, c.line, c.frozen)}</span>
                      <span className="mono">{money(c.spend7)}</span>
                      <span className="mono">{c.sales7}</span>
                      <span className="mono">{c.daysLive}</span>
                      <span><span className={`tag ${st.tone}`}><i aria-hidden="true" />{st.word}</span></span>
                    </button>
                    {isOpen && (
                      <div className="live-vars">
                        <div className="live-vrow live-head" aria-hidden="true">
                          <span className="lbl">Var. · hook · why here</span><span className="lbl">CPA 7d / own line</span><span className="lbl">3d</span><span className="lbl">Spend 7d</span><span className="lbl">Sales 7d</span><span className="lbl">State</span><span />
                        </div>
                        {c.live.map((v) => {
                          const vs = v.res.frozen ? FROZEN_TAG : STATE_TAG[v.res.state];
                          const killNow = v.res.flags.includes("kill");
                          return (
                            <div key={`${v.v}`} className={`live-vrow ${v.hot ? "vrow-hot" : ""}`}>
                              <span style={{ minWidth: 0 }}>
                                <b className="mono">V{v.v ?? "?"}</b>{v.type ? <span className="unit"> · {v.type}</span> : null}
                                <span className="pipe-meta" style={{ display: "block", color: v.hot ? "#a1241a" : undefined }}>{v.why}</span>
                                <span className="pipe-meta" style={{ display: "block" }}>
                                  {v.res.sides.length === 2
                                    ? v.res.sides.map((s) => `${s.side} ${v.res.t7.spend ? Math.round((s.t7.spend / v.res.t7.spend) * 100) : 0}% · ${money(cpaOf(s.t7))}`).join(" · ")
                                    : `${v.res.sides[0]?.side ?? "ABO"} only`}
                                </span>
                              </span>
                              <span><span className={`bx ${v.res.frozen ? "bx-n" : cpaBox(v.res.cpa7, v.res.line, v.res.state === "testing")}`}>{money(v.res.cpa7)}</span> <span className="unit">/ {v.res.line.toFixed(2)}</span></span>
                              <span>{d3(v.res.cpa3, v.res.t3.sales, v.res.line, v.res.frozen)}</span>
                              <span className="mono">{money(v.res.t7.spend)}</span>
                              <span className="mono">{v.res.t7.sales}</span>
                              <span><span className={`tag ${killNow ? "t-red" : vs.tone}`}><i aria-hidden="true" />{killNow ? "KILL LINE" : vs.word}</span></span>
                              <span><button type="button" className="btn b-ghost" onClick={() => setDetail({ c, v })}>Details</button></span>
                            </div>
                          );
                        })}
                        {c.paused && <div className="unit" style={{ padding: "4px 8px" }}>{c.paused} · KPIs, script and who made it → Details</div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <section className="card sec" aria-labelledby="h-unmapped">
        <div className="sh"><h2 id="h-unmapped">Unmapped</h2><span className="tag t-grey"><i aria-hidden="true" />{unmappedLive.length} LIVE</span></div>
        <div className="sub">Live ads still carrying BRD or pre-rename names: tag each to a real avatar, angle and format. Also on the Founders’ Home. Tagged old ads show in Live ads; they stay out of the map’s verdicts (start date).</div>
        {unmappedLive.length === 0 && <div className="info">Nothing to tag on this track.</div>}
        {unmappedLive.map((u) => (
          <div className="live-unm" key={u.base}>
            <span style={{ minWidth: 0 }}><span className="vname" style={{ fontSize: 13 }}>{u.example}</span><span className="unit" style={{ display: "block" }}>{u.adIds.length} ad{u.adIds.length === 1 ? "" : "s"} · {money(u.spend7)} · {u.sales7} sales in 7d</span></span>
            {onTag && <button type="button" className="btn b-ghost" onClick={() => onTag(u)}>Tag</button>}
          </div>
        ))}
      </section>
      <div className="pipe-legend">
        <span>Concept CPA = all live variations, ABO + CBO together, vs the concept’s own line</span>
        <span>Flag = one variation at the kill line, fading or split between twins: the concept moves to Needs attention</span>
        <span>3d = early signal; colored from {d3Min} sales, grey “n=” below</span>
        <span>No buttons that change Meta: <F>Founder 2</F> pauses there</span>
      </div>

      <Modal open={!!detail} onClose={() => setDetail(null)} who={detail ? `${detail.c.info.cell} · ${detail.c.info.angle} · ${detail.c.info.format} · live ${detail.c.daysLive} days` : ""} title={detail ? `${detail.c.info.name} · V${detail.v.v ?? "?"}${detail.v.type ? ` · ${detail.v.type}` : ""}` : ""} width={620}>
        {detail && (() => {
          const r = detail.v.res;
          const t = r.t7;
          const kpis: [string, string][] = [
            ["ROAS", t.spend ? (t.value / t.spend).toFixed(1) : "—"],
            ["CTR", pct(t.impressions ? t.clicks / t.impressions : null)],
            ...(detail.c.isStatic ? [] : [["Hook rate", pct(r.hookRate)], ["Hold rate", pct(r.hold)]] as [string, string][]),
            ["CPM", t.impressions ? `$${((t.spend / t.impressions) * 1000).toFixed(2)}` : "—"],
            ["Frequency", t.reach ? (t.impressions / t.reach).toFixed(1) : "—"],
          ];
          return (
            <>
              <div className="copy"><span>{detail.v.name}</span><CopyName text={detail.v.name} /></div>
              <div className="lib-facts">
                <div><span className="lbl">CPA 7d / own line</span><b>{money(r.cpa7)} / {r.line.toFixed(2)}</b></div>
                <div><span className="lbl">CPA 3d / own line</span><b>{r.t3.sales >= d3Min ? money(r.cpa3) : `n=${r.t3.sales}`} / {r.line.toFixed(2)}</b></div>
                <div><span className="lbl">Spend · sales 7d</span><b>{money(t.spend)} · {t.sales}</b></div>
                <div><span className="lbl">Since launch</span><b>{money(r.life.spend)} · {r.life.sales} sales</b></div>
              </div>
              <div className="field">
                <span className="lbl">Other KPIs · last 7 days</span>
                <div className="lib-facts">{kpis.map(([k, v]) => <div key={k}><span className="unit">{k}</span><b className="mono">{v}</b></div>)}</div>
                <span className="unit">Format bands (green inside, red below) come from File 3 once they are entered in Settings.</span>
              </div>
              {r.sides.length === 2 && (
                <div className="field">
                  <span className="lbl">Twin sides</span>
                  {r.sides.map((s) => (
                    <div key={s.side} className="live-unm">
                      <b>{s.side}</b>
                      <span className="mono">{t.spend ? Math.round((s.t7.spend / t.spend) * 100) : 0}% of spend · {money(s.t7.spend)} · {s.t7.sales} sales · {money(cpaOf(s.t7))} · 3d {s.t3.sales >= d3Min ? money(cpaOf(s.t3)) : `n=${s.t3.sales}`}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="info" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <span>
                  {detail.c.info.copywriter ? `Script ${detail.c.info.copywriter}` : detail.c.kind === "old" ? "Old ad (tagged)" : "—"}
                  {detail.c.info.editor ? ` · edit ${detail.c.info.editor}` : ""}
                  {detail.c.info.launchedAt ? ` · launched ${new Date(Date.parse(detail.c.info.launchedAt) + 36e5).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}` : ""}
                </span>
                {detail.c.info.taskId && <Link className="btn b-ghost" href={detail.c.info.format === "Testimonial" ? `/editing?task=${detail.c.info.taskId}#edit-view` : `/copywriting?task=${detail.c.info.taskId}#task-view`}>Open task</Link>}
              </div>
            </>
          );
        })()}
      </Modal>
    </section>
  );
}
