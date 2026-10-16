"use client";

import Link from "next/link";
import { useState } from "react";
import { STEP_LABELS, type EngineView } from "@/lib/engine-shared";

const SEG_COLORS = ["#2C2C2C", "#55564F", "#77776F", "#C63421", "#8C8C86", "#B9B9B3"];
const n0 = (n: number) => Math.round(n).toLocaleString("en-US");
const SPLITS = [["all", "All scripts"], ["format", "Format"], ["cw", "Copywriter"], ["ed", "Editor"], ["month", "Month"]] as const;
type Split = (typeof SPLITS)[number][0];

/** Business · Creative engine (artboard "Engine"): "Is the creative chain keeping up?" */
export function Engine({ w4, m3, hasMeta }: { w4: EngineView; m3: EngineView; hasMeta: boolean }) {
  const [period, setPeriod] = useState<"4w" | "3m">("4w");
  const [split, setSplit] = useState<Split>("all");
  const e = period === "4w" ? w4 : m3;
  const net = e.born - e.faded;
  const groups = e.speed.groups[split];
  const scale = Math.max(1, ...groups.map((g) => g.total));
  const maxLine = Math.max(1, ...e.aliveLine.map((p) => p.n));
  const px = (i: number) => 10 + (i / 11) * 330, py = (n: number) => 46 - (n / maxLine) * 36;
  const pts = e.aliveLine.map((p, i) => `${px(i)},${py(p.n)}`).join(" ");
  const first = e.aliveLine[0], lastPt = e.aliveLine[11];
  const step0 = e.chain[0].n || 1;
  return (
    <section className="engine" aria-labelledby="h-engine">
      <div>
        <div className="recess wseg" role="group" aria-label="Period" style={{ display: "inline-flex" }}>
          <button type="button" className={period === "4w" ? "seg-on" : ""} aria-pressed={period === "4w"} onClick={() => setPeriod("4w")}>Last 4 weeks</button>
          <button type="button" className={period === "3m" ? "seg-on" : ""} aria-pressed={period === "3m"} onClick={() => setPeriod("3m")}>Last 3 months</button>
        </div>
        <h2 id="h-engine" style={{ margin: "14px 0 6px", fontSize: 28, fontWeight: 600, letterSpacing: "-0.03em" }}>Is the creative chain keeping up?</h2>
        <div className="unit" style={{ fontSize: 13 }}>Revenue = profitable concepts running at once × what each can spend. This tracks how fast we make them, and where the chain gets stuck.</div>
      </div>
      {!hasMeta && <div className="info">Wins, fading and the engine&apos;s return fill in after the first Meta pull; the chain and speed already count from the dashboard.</div>}

      <section className="engine-top">
        <div className={`card engine-tile ${net > 0 ? "k-green" : net < 0 ? "k-red" : ""}`}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <div className="lbl">Winning concepts alive now</div>
            <span className={`tag ${net > 0 ? "t-green" : net < 0 ? "t-red" : "t-grey"}`}><i aria-hidden="true" />NET {net >= 0 ? "+" : "−"}{Math.abs(net)} THIS MONTH</span>
          </div>
          <div className="engine-alive">
            <div className="engine-big">{e.alive}</div>
            <div className="engine-bf"><div><div className="lbl">Born</div><b>+{e.born}</b></div><div><div className="lbl">Faded or lost</div><b>−{e.faded}</b></div></div>
            <svg viewBox="0 0 360 70" className="engine-spark" role="img" aria-label={`Winning concepts alive, last 12 weeks: ${e.aliveLine.map((p) => p.n).join(", ")}`}>
              <line x1="0" y1="69" x2="360" y2="69" stroke="#E3E3DE" />
              <polyline points={pts} fill="none" stroke="#1F8E4C" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx={px(11)} cy={py(lastPt.n)} r="5" fill="#fff" stroke="#1F8E4C" strokeWidth="3" />
              <text x="10" y="64" fontFamily="var(--mono)" fontSize="10" fill="#6B6B66">12 weeks ago · {first.n}</text>
              <text x="350" y="64" textAnchor="end" fontFamily="var(--mono)" fontSize="10" fill="#6B6B66">now · {lastPt.n}</text>
            </svg>
          </div>
          <div className="unit">If this line falls, revenue follows a few weeks later, even while this week&apos;s CPA looks fine.</div>
        </div>
        <div className="card engine-tile">
          <div className="lbl">Pace needed</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}><span className="engine-big">{e.pace.grow ?? "—"}</span><span className="unit" style={{ fontSize: 14 }}>launched / month to grow</span></div>
          <div>
            <div className="unit">To stand still · replace {e.pace.fadingPerMonth} fading a month{e.pace.winRate !== null ? ` at a ${Math.round(e.pace.winRate * 100)}% win rate` : ""}</div>
            <div className="ebar"><div className="efill" style={{ width: `${e.pace.standBar}%`, background: "#8C8C86" }} /></div>
            <div className="conv">{e.pace.standStill ?? "—"} / month</div>
          </div>
          <div>
            <div className="unit">To grow +2 winners a month</div>
            <div className="ebar"><div className="efill" style={{ width: `${e.pace.growBar}%` }} /></div>
            <div className="conv">{e.pace.grow ?? "—"} / month · {e.pace.grow !== null && e.pace.actual >= e.pace.grow ? `you're on it (${e.pace.actual} / month)` : `you launch ${e.pace.actual} / month`}</div>
          </div>
          <span className={`tag ${e.pace.word === "GROWING PACE" ? "t-green" : e.pace.word === "STANDING STILL" ? "t-amber" : e.pace.word === "FALLING BEHIND" ? "t-red" : "t-grey"}`} style={{ alignSelf: "flex-start" }}><i aria-hidden="true" />{e.pace.word}</span>
        </div>
      </section>

      <section className="tray" style={{ padding: "18px 16px 16px" }} aria-labelledby="h-chain">
        <div className="money-head" style={{ padding: "0 6px" }}><h3 id="h-chain">The chain · {period === "4w" ? "last 4 weeks" : "last 3 months"}</h3><span className="lbl">Click a step → its pipeline or the Library</span></div>
        <div className="funnel">
          {e.chain.map((s) => (
            <Link key={s.key} href={s.href} className={`estep ${s.bottleneck ? "bott" : ""}`}>
              <div className="estep-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                <span className="lbl">{s.label}</span>
                {s.bottleneck && <span className="tag t-red" style={{ fontSize: 10, padding: "5px 8px" }}><i aria-hidden="true" />BOTTLENECK</span>}
              </div>
              <div className="n" style={s.key === "won" ? { color: "#135F33" } : undefined}>{s.n}</div>
              <div className="ebar"><div className="efill" style={{ width: `${Math.min(100, (s.n / step0) * 100)}%`, ...(s.key === "won" ? { background: "#1F8E4C" } : {}) }} /></div>
              <div className="conv" style={s.bottleneck ? { color: "#A1241A" } : undefined}>
                {s.key === "won"
                  ? `${e.won.won} of ${e.won.settled} settled${e.won.settled ? ` · ${Math.round((e.won.won / e.won.settled) * 100)}%` : ""} · ${e.won.testing} still testing`
                  : `${s.conv === null ? "" : `${Math.round(s.conv * 100)}% · `}${s.daysLabel} ${s.days === null ? "—" : `${s.days} d`} median`}
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="card" style={{ padding: "22px 24px" }} aria-labelledby="h-speed">
        <div className="money-head">
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <h3 id="h-speed">Speed · idea to live ad</h3>
            <span style={{ font: "600 26px var(--font)" }}>{e.speed.median === null ? "—" : `${e.speed.median} days`}</span>
            <span className="unit">median{e.speed.before !== null ? ` · ${e.speed.beforeLabel} ${e.speed.before}` : ""}</span>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="lbl">Split by</span>
            <select className="inp" style={{ width: "auto" }} value={split} onChange={(ev) => setSplit(ev.target.value as Split)}>
              {SPLITS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
        </div>
        <div className="engine-legend">{STEP_LABELS.map((l, i) => <span key={l} className="sw"><i style={{ background: SEG_COLORS[i] }} />{l}</span>)}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
          {groups.length === 0 && <div className="info">No concept launched in this period yet.</div>}
          {groups.map((g) => (
            <div className="speed-row" key={g.name}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{g.name} <span className="unit">· {g.n}</span></span>
              <div className="speed-bar" role="img" aria-label={`${g.name}: ${STEP_LABELS.map((l, i) => `${l} ${g.segs[i]} days`).join(", ")}`}>
                {g.segs.map((d, i) => d > 0 ? <span key={i} className="seg8" style={{ width: `${(d / scale) * 100}%`, background: SEG_COLORS[i] }}>{d >= 1 ? d : ""}</span> : null)}
              </div>
              <span className="mono" style={{ textAlign: "right", fontWeight: 600 }}>{g.total} d</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
          <span className="unit">Median days per step for each group. The slowest group and its slowest step update with the split.</span>
          {e.speed.slowest[split] && <span className="tag t-red engine-wrap-tag"><i aria-hidden="true" />SLOWEST · {e.speed.slowest[split]}</span>}
        </div>
      </section>

      <section className="engine-cost">
        <div className="card engine-tile"><div className="lbl">Engine cost · month</div><div className="engine-mid">{n0(e.cost.month)} <small>TND</small></div><div className="unit">{e.cost.parts}</div></div>
        <div className="card engine-tile"><div className="lbl">Cost per launched concept</div><div className="engine-mid">{e.cost.perLaunched === null ? "—" : n0(e.cost.perLaunched)} <small>TND</small></div><div className="unit">engine cost ÷ {e.cost.launched} concepts launched</div></div>
        <div className="card engine-tile"><div className="lbl">Cost per winner</div><div className="engine-mid">{e.cost.perWinner === null ? "—" : n0(e.cost.perWinner)} <small>TND</small></div><div className="unit">engine cost ÷ {e.cost.winners} winners born</div></div>
        <div className={`card engine-tile ${e.cost.ret !== null && e.cost.ret >= 1 ? "k-green" : e.cost.ret !== null ? "k-red" : ""}`}><div className="lbl">Return of the engine</div><div className="engine-mid">{e.cost.ret === null ? "—" : `×${e.cost.ret}`}</div><div className="unit">profit earned by winning concepts after ad spend ({e.cost.winnersProfit === null ? "after the first Meta pull" : `${n0(e.cost.winnersProfit)} TND`}) ÷ engine cost</div></div>
      </section>
    </section>
  );
}
