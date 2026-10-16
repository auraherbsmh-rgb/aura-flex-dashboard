"use client";

import Link from "next/link";
import { useState } from "react";
import type { BlockedItem, Pace, SpeedSplit, WaitingLaunch } from "@/lib/home-shared";

/** Founder Home header (artboards): date block · greeting · counts · Start with the most urgent. */
export function HomeHero({ day, weekday, month, greeting, name, total, late, today, oldest }: {
  day: string; weekday: string; month: string; greeting: string; name: string; total: number; late: number; today: number; oldest: string | null;
}) {
  const start = () => {
    // Opens the first item's action (its pop-up or task), the most urgent one.
    const btn = document.querySelector<HTMLElement>(".need .btn");
    if (!btn) return;
    btn.scrollIntoView({ behavior: "smooth", block: "center" });
    btn.focus({ preventScroll: true });
    btn.click();
  };
  return (
    <div className="home-hero">
      <div className="home-date">
        <div className="raise home-day" aria-hidden="true">{day}</div>
        <div style={{ fontSize: 15, lineHeight: 1.3 }}>{weekday},<br />{month}</div>
      </div>
      <div className="home-sep" aria-hidden="true" />
      <div style={{ flex: "1 1 460px", minWidth: 0 }}>
        <h1 className="home-greet">{greeting}, <span className="home-name">{name}</span></h1>
        <div className="home-counts">
          <span className="raise home-pill"><b>{total}</b><span>thing{total === 1 ? "" : "s"} need{total === 1 ? "s" : ""} you</span></span>
          {late > 0 && <><span className="home-dot" aria-hidden="true">·</span><span className="home-pill home-pill-red"><i aria-hidden="true" /><b>{late}</b><span>{late === 1 ? "is" : "are"} late</span></span></>}
          {today > 0 && <><span className="home-dot" aria-hidden="true">·</span><span className="home-soft"><b>{today}</b> due today</span></>}
          {oldest && <><span className="home-dot" aria-hidden="true">·</span><span className="home-soft">oldest waiting <b className="home-red">{oldest}</b></span></>}
        </div>
      </div>
      <button type="button" className="btn b-primary home-start" onClick={start} disabled={total === 0}>
        Start with the most urgent
        <span className="home-arrow" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
        </span>
      </button>
    </div>
  );
}

function Ring({ pct }: { pct: number }) {
  const c = 2 * Math.PI * 44;
  const on = (Math.min(100, Math.max(0, pct)) / 100) * c;
  return (
    <div className="ring" aria-hidden="true">
      <svg width="120" height="120" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="44" fill="none" stroke="#2E2E2E" strokeWidth="9" />
        {on > 0 && <circle cx="60" cy="60" r="44" fill="none" stroke="#35C772" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${on} ${c}`} transform="rotate(-90 60 60)" className="ring-on" />}
      </svg>
      <div className="ring-txt"><span>{pct}%</span><small>OF TARGET</small></div>
    </div>
  );
}

function PaceTile({ label, p }: { label: string; p: Pace }) {
  return (
    <div className={`card home-tile ${p.tone === "green" ? "k-green" : ""}`} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="lbl">{label}</div>
        <div className="home-big">{p.done}{p.target ? <small> / {p.target}</small> : null}</div>
        <span className={`tag t-${p.tone}`} style={{ alignSelf: "flex-start" }}><i aria-hidden="true" />{p.word}</span>
      </div>
      {p.pct !== null && <Ring pct={p.pct} />}
    </div>
  );
}

function MetaTile({ label, what }: { label: string; what: string }) {
  return (
    <div className="card home-tile">
      <div className="lbl">{label}</div>
      <div className="home-big home-muted">—</div>
      <span className="tag t-grey" style={{ alignSelf: "flex-start" }}><i aria-hidden="true" />COMES WITH META · PHASE 3</span>
      <div className="unit">{what}</div>
    </div>
  );
}

export type F1Numbers = { scripts: Pace };
export type F2Numbers = { videos: Pace; speed: SpeedSplit; waiting: WaitingLaunch[] };

function Blocked({ items }: { items: BlockedItem[] }) {
  return (
    <section className="tray home-blocked" aria-labelledby="h-blocked">
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
        <h2 id="h-blocked" style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#3A3A36" }}>Blocked</h2>
        <span className="lbl">Read-only · stuck elsewhere</span>
      </div>
      {items.length === 0 && <div className="unit" style={{ padding: "8px 0" }}>Nothing is stuck on anyone else.</div>}
      {items.map((b) => (
        <div className="home-brow" key={b.key}>
          <div style={{ fontSize: 14, color: "#2B2B28", minWidth: 0 }}>{b.what} <span style={{ color: "#77776F" }}>· waiting on {b.who}</span></div>
          <div className={`home-bage ${b.late ? "home-red" : ""}`}>{b.late ? `${b.text} · late` : b.text}</div>
        </div>
      ))}
    </section>
  );
}

/**
 * The three numbers + Blocked, for Founder 1 or Founder 2 (switch so either founder can see the other's Home numbers;
 * Needs me has its own Mine | All switch).
 */
export function FounderNumbers({ initial, f1, f2, blocked1, blocked2, children }: {
  initial: "f1" | "f2"; f1: F1Numbers; f2: F2Numbers; blocked1: BlockedItem[]; blocked2: BlockedItem[];
  /** Needs me, placed between the numbers and Blocked (artboard order). */
  children?: React.ReactNode;
}) {
  const [who, setWho] = useState(initial);
  const sp = f2.speed;
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <span className="lbl">{who === "f1" ? "Founder 1 · copywriting" : "Founder 2 · editing and launch"}</span>
        <div className="recess wseg" role="group" aria-label="Numbers of">
          <button type="button" className={who === "f1" ? "seg-on" : ""} aria-pressed={who === "f1"} onClick={() => setWho("f1")}>Founder 1</button>
          <button type="button" className={who === "f2" ? "seg-on" : ""} aria-pressed={who === "f2"} onClick={() => setWho("f2")}>Founder 2</button>
        </div>
      </div>
      <section className="home-tiles" aria-label="Three numbers">
        {who === "f1" ? (
          <>
            <PaceTile label="Scripts approved · this week" p={f1.scripts} />
            <MetaTile label="Won / settled · 3 months" what="Win rate of the concepts that reached a verdict." />
            <MetaTile label="Cells needing a successor" what="Cells whose winner is fading or deteriorating." />
          </>
        ) : (
          <>
            <PaceTile label="Videos delivered · this week" p={f2.videos} />
            <div className="card home-tile">
              <div className="lbl">Approved script → live ad</div>
              {sp ? (
                <>
                  <div className="home-big">{sp.total}<small> days</small></div>
                  <div className="recess home-bar" role="img" aria-label={`Editing ${sp.editing} days, revisions ${sp.revisions} days, waiting ${sp.waiting} days`}>
                    {sp.editing > 0 && <span style={{ flex: sp.editing, background: "linear-gradient(180deg,#444,#111)" }} />}
                    {sp.revisions > 0 && <span style={{ flex: sp.revisions, background: "linear-gradient(180deg,#8E8E88,#6B6B66)" }} />}
                    {sp.waiting > 0 && <span style={{ flex: sp.waiting, background: "linear-gradient(180deg,#F2C86A,#E0A419)" }} />}
                  </div>
                  <div className="home-legend">
                    {(() => {
                      const parts: [string, number, string][] = [["Editing", sp.editing, "#111"], ["Revisions", sp.revisions, "#6B6B66"], ["Waiting", sp.waiting, "#E0A419"]];
                      const top = Math.max(...parts.map((x) => x[1]));
                      return parts.map(([l, v, c]) => (
                        <span key={l} style={l === "Waiting" ? { color: "#7A5300" } : undefined}><i style={{ background: c }} />{l} <b>{v}</b>{v === top && v > 0 ? " · biggest part" : ""}</span>
                      ));
                    })()}
                  </div>
                  <div className="unit">Average of {sp.count} video{sp.count === 1 ? "" : "s"} launched in the last 30 days.</div>
                </>
              ) : (
                <>
                  <div className="home-big home-muted">—</div>
                  <div className="unit">No video launched in the last 30 days yet.</div>
                </>
              )}
            </div>
            <div className={`card home-tile ${f2.waiting.length ? "k-amber" : ""}`}>
              <div className="lbl">Concepts waiting to launch</div>
              <div className="home-big">{f2.waiting.length}<small> concept{f2.waiting.length === 1 ? "" : "s"}</small></div>
              {f2.waiting.slice(0, 3).map((w) => (
                <Link key={w.taskId} href={`/editing?task=${w.taskId}#edit-view`} className="raise home-wait">
                  <div style={{ minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 600 }}>{w.title}</div><div style={{ fontSize: 12, color: "#6B6B66", marginTop: 2 }}>{w.sub}</div></div>
                  <span className="tag t-amber"><i aria-hidden="true" />{w.days === 0 ? "APPROVED TODAY" : `WAITING ${w.days} DAY${w.days === 1 ? "" : "S"}`}</span>
                </Link>
              ))}
              {f2.waiting.length > 3 && <div className="unit">+{f2.waiting.length - 3} more in Editing</div>}
            </div>
          </>
        )}
      </section>
      {children}
      <Blocked items={who === "f1" ? blocked1 : blocked2} />
    </>
  );
}
