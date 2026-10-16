"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import type { LeakRow, MoneyView, TrendPoint } from "@/lib/business-shared";

const n0 = (n: number) => Math.round(n).toLocaleString("en-US").replace("-", "−");
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
const ZONE_TAG = { green: ["t-green", "UNDER LINE"], orange: ["t-orange", "NEAR LINE"], red: ["t-red", "OVER LINE"], grey: ["t-grey", "NO DATA"] } as const;
const ZONE_CARD = { green: "k-green", orange: "k-orange", red: "k-red", grey: "" } as const;

export type MoneyProps = {
  view: MoneyView;
  line: number;
  fixed: number;
  stock: { bottles: number | null; days: number | null; perDay: number; redBelow: number | null };
  cash: { collected: number; transit: number } | null;
  shipperMissing: string | null;
  hasMeta: boolean;
  /** Last Shipper pull message (connected, but failing or waiting for the first pull). */
  shipperNote?: string | null;
};

/** Business · Money (artboard "Business"): "Are we making money?" — This week (estimate) | Last closed month (settled). */
export function Money({ view, line, fixed, stock, cash, shipperMissing, hasMeta, shipperNote = null }: MoneyProps) {
  const closed = view.closed;
  const [period, setPeriod] = useState<"week" | "month">(closed ? "month" : "week");
  const [detail, setDetail] = useState<LeakRow | null>(null);
  const isMonth = period === "month" && !!closed;
  const w = view.week;
  const zone = isMonth ? closed!.zone : w.zone;
  const cpa = isMonth ? closed!.cpa : w.cpa;
  const lineNow = isMonth ? closed!.line : line;
  const overPct = cpa !== null && lineNow ? Math.round(((cpa - lineNow) / lineNow) * 100) : null;
  return (
    <section className="money" aria-labelledby="h-money">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h2 id="h-money" style={{ margin: 0, fontSize: 28, fontWeight: 600, letterSpacing: "-0.03em" }}>Are we making money?</h2>
          <div className="unit" style={{ marginTop: 6, fontSize: 13 }}>
            {isMonth ? `${closed!.label}${closed!.provisional ? ` · PROVISIONAL: ${closed!.open} orders still open, estimated at the month's rates` : ", settled"} · compared with ${closed!.prevLabel}` : `${w.label} · Meta numbers final, delivery still settling`}
          </div>
        </div>
        <div className="recess wseg" role="group" aria-label="Period">
          <button type="button" className={!isMonth ? "seg-on" : ""} aria-pressed={!isMonth} onClick={() => setPeriod("week")}>This week · {w.label}</button>
          <button type="button" className={isMonth ? "seg-on" : ""} aria-pressed={isMonth} disabled={!closed} onClick={() => setPeriod("month")}>Last closed month{closed ? ` · ${closed.label}` : ""}</button>
        </div>
      </div>

      {shipperMissing && (
        <div className="notice" role="status" style={{ background: "#fbf0d2", color: "#7a5300" }}>
          <b>Shipper not connected yet.</b> {shipperMissing} Until then: the week is a Meta estimate; the closed month, gross sales, stock, cash and the leak finder wait for Shipper.
        </div>
      )}
      {!shipperMissing && shipperNote && <div className="notice" role="status" style={{ background: "#fbf0d2", color: "#7a5300" }}>{shipperNote}</div>}
      {isMonth && closed!.noMeta && <div className="notice" role="status" style={{ background: "#fbf0d2", color: "#7a5300" }}><b>No Meta data pulled for {closed!.label}.</b> Without ad spend there is no profit: profit, the waterfall, CPA, tracking and the leak finder wait for Meta. Gross sales, orders and stock come from Shipper.</div>}
      {!hasMeta && <div className="info">No Meta results yet: the numbers fill in after the first Meta pull.</div>}

      <section className="money-row3">
        <div className={`card money-tile ${ZONE_CARD[zone]}`}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
            <div className="lbl">{isMonth ? `Profit after all costs · ${closed!.label}` : "Profit after all costs · estimate"}</div>
            <span className={`tag ${ZONE_TAG[zone][0]}`}><i aria-hidden="true" />{ZONE_TAG[zone][1]}</span>
          </div>
          {isMonth && closed!.noMeta ? <div className="money-big money-muted">—</div> : <div className="money-big">{n0(isMonth ? closed!.profit : w.profit)} <small>TND</small></div>}
          <div className="unit">
            {isMonth ? "" : "Meta purchases × line − spend · "}CPA {cpa === null ? "—" : `$${cpa.toFixed(2)}`} vs line ${lineNow.toFixed(2)}{overPct !== null ? ` · ${Math.abs(overPct)}% ${overPct >= 0 ? "over" : "under"}` : ""}
          </div>
        </div>
        <div className="card money-tile">
          <div className="lbl">Orders</div>
          <div className="money-big">{n0((isMonth ? closed!.metaOrders + closed!.dmOrders : w.metaOrders + (w.dmOrders ?? 0)))}</div>
          <div className="unit">{n0(isMonth ? closed!.metaOrders : w.metaOrders)} Meta · {isMonth ? `${n0(closed!.dmOrders)} DM / comments` : w.dmOrders === null ? "DM / comments with Shipper" : `${n0(w.dmOrders)} DM / comments`}</div>
        </div>
        <div className="card money-tile">
          <div className="lbl">{isMonth ? `Change vs ${closed!.prevLabel}` : "Change vs last week"}</div>
          {isMonth ? (
            closed!.noMeta ? <><div className="money-big money-muted">—</div><div className="unit">waits for Meta</div></> : closed!.prevProfit === null ? <><div className="money-big money-muted">—</div><div className="unit">{closed!.prevLabel} not in the Shipper data</div></> : (
              <>
                <div className="money-big" style={{ color: closed!.profit - closed!.prevProfit < 0 ? "#A1241A" : "#135F33" }}>{signed(closed!.profit - closed!.prevProfit)}</div>
                <div className="unit">{signed(closed!.prevProfit)} → {signed(closed!.profit)} TND{(() => {
                  const ls = closed!.leaks;
                  if (!ls || !closed!.leakTotal) return "";
                  const top2 = [...ls].filter((l) => Math.sign(l.amount) === Math.sign(closed!.leakTotal!)).slice(0, 2);
                  const share = Math.round((top2.reduce((n, l) => n + l.amount, 0) / closed!.leakTotal!) * 100);
                  return top2.length ? ` · ${Math.min(100, share)}% from ${top2.map((l) => l.name.toLowerCase()).join(" and ")}` : "";
                })()}</div>
              </>
            )
          ) : (
            <>
              <div className="money-big">{signed(w.profit - w.prevProfit)}</div>
              <div className="unit">Estimate · same formula both weeks</div>
            </>
          )}
        </div>
      </section>
      <div className="unit" style={{ padding: "0 8px" }}>Profit color: green = CPA more than 5% under the line · orange = within 5% · red = more than 5% over</div>

      <section className="money-row3">
        <div className="card money-tile">
          <div className="lbl">{isMonth ? `Gross sales · ${closed!.label}` : `Gross sales · ${w.monthLabel} so far`}</div>
          {isMonth ? (
            <>
              <div className="money-big">{n0(closed!.gross)} <small>TND</small></div>
              <div className="unit">{n0(closed!.delivered)} delivered × {closed!.aov.toFixed(2)}{closed!.estimatedDelivered >= 0.5 ? ` · incl. ~${n0(closed!.estimatedDelivered)} still open, estimated` : ""}{closed!.grossPrev ? ` · ${closed!.prevLabel} ${n0(closed!.grossPrev)} (${signed(((closed!.gross - closed!.grossPrev) / closed!.grossPrev) * 100)}%)` : ""}</div>
            </>
          ) : w.grossSoFar === null ? <><div className="money-big money-muted">—</div><div className="unit">Delivered only · with Shipper</div></> : (
            <>
              <div className="money-big">{n0(w.grossSoFar)} <small>TND</small></div>
              <div className="unit">Delivered only{w.pace ? ` · pace to month end ${n0(w.pace)}` : ""}</div>
            </>
          )}
        </div>
        <div className="card money-tile">
          <div className="lbl">Stock · days left</div>
          <div className={`money-big ${stock.days === null ? "money-muted" : ""}`} style={stock.days !== null && stock.redBelow && stock.days < stock.redBelow ? { color: "#A1241A" } : undefined}>{stock.days === null ? "—" : stock.days} <small>days</small></div>
          <div className="unit">{stock.bottles === null ? "Bottles at Shipper · with Shipper" : `${n0(stock.bottles)} bottles at Shipper ÷ ${stock.perDay.toFixed(0)} shipped / day`}</div>
          {stock.redBelow
            ? <span className={`tag ${stock.days !== null && stock.days < stock.redBelow ? "t-red" : "t-grey"}`} style={{ alignSelf: "flex-start" }}><i aria-hidden="true" />RED BELOW {stock.redBelow} DAYS</span>
            : <span className="tag t-amber" style={{ alignSelf: "flex-start" }}><i aria-hidden="true" />RED LINE TO FILL · SETTINGS</span>}
        </div>
        <div className="card money-tile">
          <div className="lbl">Cash at Shipper</div>
          <div className={`money-big ${cash ? "" : "money-muted"}`}>{cash ? n0(cash.collected + cash.transit) : "—"} <small>TND</small></div>
          <div className="unit">{cash ? `Collected, not yet paid ${n0(cash.collected)} · in transit ${n0(cash.transit)}` : "Collected not paid + in transit · with Shipper"}</div>
        </div>
      </section>

      <Trend points={view.trend} />

      {closed?.noMeta ? (
        <section className="card" style={{ padding: "22px 24px" }}><h3 style={{ margin: 0 }}>Where every dinar goes · {closed.label}</h3><div className="info" style={{ marginTop: 10 }}>Waits for Meta: ad spend for {closed.label} isn&apos;t pulled.</div></section>
      ) : closed ? (
        <section className="card" style={{ padding: "22px 24px" }} aria-labelledby="h-wf">
          <div className="money-head"><h3 id="h-wf">Where every dinar goes · {closed.label}{isMonth ? "" : " (last closed)"}</h3><span className="lbl">Delivered sales only · TND</span></div>
          <div className="wf wf-head"><span /><span className="lbl">0 · TND left after each cost</span><span className="lbl" style={{ textAlign: "right" }}>TND</span><span className="lbl" style={{ textAlign: "right" }}>of gross</span></div>
          {(() => {
            // Scale from the lowest point (a loss crosses zero, as on the artboard) to gross.
            const lo = Math.min(0, ...closed.waterfall.map((r) => (r.left ?? r.amount)));
            const hi = Math.max(1, closed.gross);
            const pos = (x: number) => 2 + 96 * ((x - lo) / (hi - lo));
            return closed.waterfall.map((r, i) => {
              const first = i === 0, last = i === closed.waterfall.length - 1;
              const a = first ? 0 : last ? 0 : (r.left ?? 0) - r.amount;
              const b = first ? r.amount : last ? r.amount : (r.left ?? 0);
              const from = Math.min(a, b), to = Math.max(a, b);
              const color = first ? "linear-gradient(180deg,#2C2C2C,#111)" : last ? (r.amount < 0 ? "linear-gradient(180deg,#E25440,#C63421)" : "linear-gradient(180deg,#34A865,#1F8E4C)") : "linear-gradient(180deg,#B9B9B3,#9F9F99)";
              return (
                <div className="wf" key={r.label}>
                  <div><div style={{ fontSize: 14, fontWeight: 600 }}>{r.label}</div><div className="unit">{r.sub}</div></div>
                  <div className="wtrack" aria-hidden="true">
                    <span className="wzero" style={{ left: `${pos(0)}%` }} />
                    <span className="wbar" style={{ left: `${pos(from)}%`, width: `${Math.max(0.5, pos(to) - pos(from))}%`, background: color }} />
                    {!first && !last && r.left !== null && r.left > 0.15 * hi && <span className="wleft" style={{ left: `${pos(r.left)}%` }}>{n0(r.left)} left</span>}
                  </div>
                  <span className={`amt ${last ? (r.amount < 0 ? "a-red" : "a-green") : ""}`}>{first ? n0(r.amount) : r.amount < 0 ? n0(r.amount) : `+${n0(r.amount)}`}</span>
                  <span className="unit" style={{ textAlign: "right" }}>{Math.round(r.pct * 100)}%</span>
                </div>
              );
            });
          })()}
        </section>
      ) : null}

      <section className="tray" style={{ padding: "20px 18px" }} aria-labelledby="h-leaks">
        <div className="money-head" style={{ padding: "0 6px 12px" }}>
          <h3 id="h-leaks">Where the money went</h3>
          <span className="lbl">{isMonth && closed?.leaks ? `vs ${closed.prevLabel} · biggest first` : closed && !isMonth ? `see ${closed.label} (last closed)` : "closed months only"}</span>
        </div>
        {isMonth && closed?.leaks ? (
          <>
            <div className="leak leak-head"><span className="lbl">Stage</span><span className="lbl">{closed.prevLabel} → {closed.label}</span><span className="lbl">Size of the gap</span><span className="lbl" style={{ textAlign: "right" }}>TND</span><span /></div>
            {(() => {
              const max = Math.max(...closed.leaks.map((l) => Math.abs(l.amount)), 1);
              return closed.leaks.map((l) => (
                <div className={`leak ${l.grey ? "leak-grey" : ""}`} key={l.name}>
                  <div><div style={{ fontSize: 15, fontWeight: 600, color: l.grey ? "#77776F" : undefined }}>{l.name}</div><div className="unit">{l.what}</div></div>
                  <span className="rate">{l.rate}</span>
                  <div className="track" aria-hidden="true"><div className={`fill ${l.grey ? "f-grey" : l.amount < 0 ? "f-red" : "f-green"}`} style={{ width: `${Math.max(3, Math.round((Math.abs(l.amount) / max) * 100))}%` }} /></div>
                  <span className={`amt ${l.grey ? "a-grey" : l.amount < 0 ? "a-red" : "a-green"}`}>{signed(l.shown)}</span>
                  <span>{l.detail && <button type="button" className="btn b-ghost" aria-label={`Details: ${l.name}`} onClick={() => setDetail(l)}>Details</button>}</span>
                </div>
              ));
            })()}
            <div className="leak-total">
              <span style={{ fontWeight: 600 }}>Total · stages add up exactly</span>
              <span className="unit">{closed.prevLabel} {signed(closed.prevProfit ?? 0)} → {closed.label} {signed(closed.profit)} TND</span>
              <span className={`amt ${(closed.leakTotal ?? 0) < 0 ? "a-red" : "a-green"}`}>{signed(Math.round(closed.leakTotal ?? 0))}</span>
            </div>
          </>
        ) : (
          <div className="leak-settling">
            <span className="tag t-amber" style={{ alignSelf: "flex-start" }}><i aria-hidden="true" />{!closed ? "WAITS FOR SHIPPER" : isMonth ? "NOT ENOUGH DATA" : "SETTLING"}</span>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{!closed ? "The leak finder needs two months of Shipper orders" : isMonth ? `The leak finder ${closed.leakWhy ?? "needs two settled months"}` : "This week's orders are still being confirmed and delivered"}</div>
            <div className="unit" style={{ fontSize: 13 }}>The leak finder needs settled delivery (2–3 weeks for COD). It runs on closed months; weeks appear here once their orders settle. Nothing is guessed.</div>
          </div>
        )}
      </section>

      <section className="money-foot">
        {closed?.tracking != null && (
          <span><span className={`tag ${closed.tracking >= 0.89 && closed.tracking <= 0.95 ? "t-green" : "t-red"}`} style={{ marginRight: 8 }}><i aria-hidden="true" />{closed.tracking >= 0.89 && closed.tracking <= 0.95 ? "DATA OK" : "CHECK TRACKING"}</span>Tracking {closed.tracking.toFixed(3)} · band 0.89–0.95</span>
        )}
        {closed && <span><span className={`tag ${closed.lineStatus === "final" ? "t-green" : "t-amber"}`} style={{ marginRight: 8 }}><i aria-hidden="true" />LINE {closed.lineStatus.toUpperCase()}</span>Business line ${closed.line.toFixed(2)} · Settings → Money</span>}
        <span><b>Salaries and fixed</b> = {n0(isMonth ? closed!.fixed : fixed)} TND / month from Settings (that month&apos;s row, editor pay included)</span>
        <span>Normal = last closed month · stages switched in fixed order: ad cost → volume → tracking → confirmation → door rate → order value → delivery cost → salaries and fixed</span>
      </section>

      {detail?.detail && closed && (
        <Modal open onClose={() => setDetail(null)} who={`Details · ${closed.prevLabel} → ${closed.label}`} title={`${detail.name} · ${signed(detail.amount)} TND`}>
          <div style={{ fontSize: 15 }}>{detail.detail.head}</div>
          {detail.detail.lines.map((p) => <div className={`pline ${p.bad ? "pline-red" : ""}`} key={p.a}><span>{p.a}</span><b className="mono">{p.b}</b></div>)}
          <div className="info"><b>Where to look:</b> {detail.detail.look}</div>
        </Modal>
      )}
    </section>
  );
}

/** Profit trend · last 12 weeks: curve over zero, green / red areas, settling weeks dashed, last value labelled, two status words. */
function Trend({ points }: { points: TrendPoint[] }) {
  if (!points.length) return null;
  // Weeks with no Meta data have no profit: left out of the line and the status words.
  const have = points.map((p, i) => ({ p, i })).filter(({ p }) => !p.missing);
  const missingN = points.length - have.length;
  const vals = have.map(({ p }) => p.profit);
  const max = Math.max(1000, ...vals.map(Math.abs));
  const W = 1000, H = 220, pad = 10;
  const x = (i: number) => ((i + 0.5) * W) / points.length; // centred under each date label
  const y = (v: number) => H / 2 - (v / max) * (H / 2 - pad);
  const seg = (xs: { p: TrendPoint; i: number }[]) => xs.map(({ p, i }, k) => `${k ? "L" : "M"}${x(i).toFixed(1)},${y(p.profit).toFixed(1)}`).join(" ");
  const path = seg(have);
  const tick = Math.round(max / 2 / 100) * 100 || 500;
  const area = have.length ? `${path} L${x(have[have.length - 1].i)},${H / 2} L${x(have[0].i)},${H / 2} Z` : "";
  const firstSettling = have.findIndex(({ p }) => p.settling);
  let loss = 0; for (let i = vals.length - 1; i >= 0 && vals[i] < 0; i--) loss++;
  let gain = 0; for (let i = vals.length - 1; i >= 0 && vals[i] >= 0; i--) gain++;
  let up = 0; for (let i = vals.length - 1; i > 0 && vals[i] > vals[i - 1]; i--) up++;
  let down = 0; for (let i = vals.length - 1; i > 0 && vals[i] < vals[i - 1]; i--) down++;
  if (!have.length) return <section className="card" style={{ padding: "22px 24px" }}><h3 style={{ margin: 0 }}>Profit trend · last 12 weeks</h3><div className="info" style={{ marginTop: 10 }}>Waits for Meta: no week has ad spend pulled yet.</div></section>;
  const last = have[have.length - 1].p;
  const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return (
    <section className="card" style={{ padding: "22px 24px" }} aria-labelledby="h-trend">
      <div className="money-head">
        <div><h3 id="h-trend">Profit trend · last 12 weeks</h3><div className="unit">Are we getting better or worse? Weekly profit after all costs, TND</div></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {loss > 0 ? <span className="tag t-red"><i aria-hidden="true" />LOSS {loss} WEEK{loss > 1 ? "S" : ""}</span> : <span className="tag t-green"><i aria-hidden="true" />PROFIT {gain} WEEK{gain > 1 ? "S" : ""}</span>}
          {up > 0 ? <span className="tag t-green"><i aria-hidden="true" />IMPROVING {up} WEEK{up > 1 ? "S" : ""}</span> : down > 0 ? <span className="tag t-red"><i aria-hidden="true" />WORSE {down} WEEK{down > 1 ? "S" : ""}</span> : null}
        </div>
      </div>
      <div className="trend-wrap">
      <div className="trend-ticks" aria-hidden="true">{[tick, 0, -tick].map((t) => <span key={t} style={{ top: `${(y(t) / H) * 100}%` }}>{t > 0 ? "+" : t < 0 ? "−" : ""}{Math.abs(t).toLocaleString("en-US")}</span>)}</div>
      <div style={{ minWidth: 0 }}>
      <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="trend-svg" role="img" aria-label={`Weekly profit: ${points.map((p) => `${fmt(p.monday)} ${p.missing ? "no Meta data" : `${Math.round(p.profit)} TND${p.settling ? " (settling)" : ""}`}`).join(", ")}`}>
        <defs>
          <clipPath id="tr-up"><rect x="0" y="0" width={W} height={H / 2} /></clipPath>
          <clipPath id="tr-down"><rect x="0" y={H / 2} width={W} height={H / 2} /></clipPath>
        </defs>
        <path d={area} fill="rgba(31,142,76,0.18)" clipPath="url(#tr-up)" />
        <path d={area} fill="rgba(214,59,39,0.16)" clipPath="url(#tr-down)" />
        <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="#B9B9B3" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {/* Solid up to the last settled week; dashed from there into the settling weeks. */}
        {firstSettling !== 0 && <path d={seg(firstSettling > 0 ? have.slice(0, firstSettling) : have)} fill="none" stroke="#111" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />}
        {firstSettling >= 0 && <path d={seg(have.slice(Math.max(0, firstSettling - 1)))} fill="none" stroke="#111" strokeWidth="2.5" strokeDasharray="7 6" vectorEffect="non-scaling-stroke" />}
        
      </svg>
      <span className="trend-end" style={{ top: `${(y(last.profit) / H) * 100}%` }}>{signed(last.profit)}{last.settling ? " · settling" : ""}</span>
      </div>
      <div className="trend-axis">{points.map((p) => <span key={p.monday}>{fmt(p.monday)}</span>)}</div>
      </div>
      </div>
      <div className="unit" style={{ marginTop: 6 }}>
        {have[have.length - 1].i === points.length - 1 ? "Last week" : "Latest week with Meta data"} {signed(last.profit)} TND{last.settling ? " · settling" : ""}. Green area = profit · red area = loss · dashed = estimate while delivery settles (Meta purchases × line − spend) · weeks by order date.{missingN ? ` ${missingN} week${missingN > 1 ? "s" : ""} without Meta data left out.` : ""}
      </div>
    </section>
  );
}
