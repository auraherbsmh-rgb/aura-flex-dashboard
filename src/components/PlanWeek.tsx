"use client";

import Link from "next/link";
import { startTransition, useState } from "react";
import { Modal } from "./Modal";
import { F } from "./FounderNames";
import { LinkPending, RowPending } from "./LinkPending";
import { CreateTaskButton, type TaskPrefill } from "./Tasks";
import { ProductionOrder, type OrderItem } from "./ProductionOrder";
import { addPlanItem, dropPlanItem, lockPlan, removePlanItem, setPlanCap, type PlanResult } from "@/app/plan/actions";
import { AWARENESS, type Pickers } from "@/lib/proposals-shared";
import { DROP_REASONS, type PlanKind } from "@/lib/plan-shared";
import type { CreateTaskContext, Prio } from "@/lib/tasks-shared";

export type PlanItemView = {
  id: string;
  kind: PlanKind;
  name: string;
  meta: string;
  stage: string;
  tone: string;
  closed: boolean;
  carry: boolean;
  /** Step 1: still open from a week before last week. */
  older?: boolean;
  added: string | null;
  dropped: { reason: string; by: string } | null;
  hasTask: boolean;
  sourceTask: string | null;
  prefill: (TaskPrefill & { planItem: string }) | null;
};
export type PlanView = {
  weekLabel: string;
  prevLabel: string;
  cap: number;
  locked: string | null;
  items: PlanItemView[];
  lastWeek: PlanItemView[];
  tests: { taskId: string; name: string; cell: string; launched: string; word: string; tone: string; line: string }[];
  winners: { taskId: string; name: string; cell: string; line: string }[];
  launches: { taskId: string; name: string; title: string; sub: string; days: number }[];
  /** "This week" view: one row per item from task to launch (times, lateness and who from the pipelines). */
  track: { id: string; name: string; meta: string; carry: boolean; added: string | null; kind: PlanKind; at: number; skipShoot: boolean; late: boolean; hold: boolean; time: string; who: string; what: string; due: string; href: string | null; prefill: (TaskPrefill & { planItem: string }) | null }[];
  /** Step 4: per avatar × awareness, what was tried (concepts since the map start date). */
  coverage: { id: string; code: string; label: string; cells: { awareness: string; total: number; working: number; lost: number; moving: number; planned: number }[] }[];
  log: { when: string; who: string; what: string }[];
  hasMeta: boolean;
  ok: boolean;
};

const STEPS = ["Last week's plan", "Last week's tests", "Double down", "New tests", "Production order", "Launches"];
const HELP = [
  "What was planned last week and what happened to each item. Not finished ones carry into this week.",
  "Every concept launched since last Monday, with its Meta state.",
  "Concepts converting under their own line: how many new concepts each (same core message and avatar).",
  "Pick a cell to test: what was tried there, what works, what never was.",
  "What the agency and the editors do first. Drag a row by ⋮⋮ to move it.",
  "Approved videos not launched yet: tick the ones to launch this week.",
];
const TRACK = ["Task", "Writing", "Review", "Approved", "Shoot", "Editing", "Delivered", "Launched"];
const SHORT_AW: Record<string, string> = { "Problem-Aware": "Problem", "Solution-Aware": "Solution", "Product-Aware": "Product", "Most-Aware": "Most" };

/** Monday plan: one step at a time on the left, the week's plan on the right (always visible, updates from statuses). */
export function PlanWeek({ view, ctx, pickers, order }: {
  view: PlanView;
  ctx: CreateTaskContext;
  pickers: Pickers;
  order: { items: OrderItem[]; prio: Record<string, Prio>; version: number; now: number };
}) {
  const [mode, setMode] = useState<"track" | "plan">(view.locked ? "track" : "plan");
  const [step, setStep] = useState(0);
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<PlanResult>({});
  const [drop, setDrop] = useState<PlanItemView | null>(null);
  const [reason, setReason] = useState<string>(DROP_REASONS[0]);
  const [other, setOther] = useState("");
  const [createFor, setCreateFor] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [nt, setNt] = useState({ avatar: "", awareness: "", note: "" });
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const locked = !!view.locked;
  const live = view.items.filter((i) => !i.dropped);
  // Scripts this week = new ones planned + carried ones not finished (both load the copywriters).
  const scripts = live.filter((i) => i.kind !== "launch" && (!i.carry || !i.closed)).length;
  const remaining = view.items.filter((i) => i.prefill);
  const active = all ? remaining[0] : remaining.find((i) => i.id === createFor);

  const run = (f: () => Promise<PlanResult>) => {
    if (pending) return;
    setPending(true);
    setMsg({});
    startTransition(async () => {
      try { setMsg(await f()); } catch { setMsg({ error: "Not saved: the connection dropped or your session expired. Reload the page." }); } finally { setPending(false); }
    });
  };
  const removable = (i: PlanItemView) => !i.hasTask && !i.dropped && !i.carry && (!locked || !!i.added);
  const askDrop = (i: PlanItemView) => { setMsg({}); setDrop(i); setReason(DROP_REASONS[0]); setOther(""); };
  const takeOut = (i: PlanItemView) => (removable(i) ? run(() => removePlanItem(i.id)) : askDrop(i));

  if (!view.ok) return <div className="notice notice-red" role="alert">The week plan could not be read. Reload the page.</div>;

  const ddOf = (taskId: string) => live.filter((i) => i.kind === "double_down" && i.sourceTask === taskId && !i.carry);
  const launchOf = (taskId: string) => live.find((i) => i.kind === "launch" && i.sourceTask === taskId);

  const prev = view.lastWeek.filter((i) => !i.older);
  const older = view.lastWeek.filter((i) => i.older);
  const outcome = (i: PlanItemView) => (
    <div key={i.id} className="plan-row">
      <div style={{ minWidth: 0 }}><div className="plan-name">{i.name}</div><div className="unit">{i.meta}</div></div>
      <div className="plan-state">
        {i.dropped
          ? <><span className="tag t-grey"><i aria-hidden="true" />DROPPED</span> <span className="unit">{i.dropped.reason}{i.dropped.by ? ` · ${i.dropped.by}` : ""}</span></>
          : i.closed
            ? <span className={`tag ${i.tone}`}><i aria-hidden="true" />{i.stage.toUpperCase()}</span>
            : <><span className="tag t-orange"><i aria-hidden="true" />CARRIED OVER</span> <span className="unit">now: {i.stage}</span></>}
      </div>
      <div style={{ textAlign: "right" }}>
        {!i.closed && <button type="button" className="btn b-ghost plan-xs" disabled={pending} onClick={() => (i.dropped ? run(() => dropPlanItem(i.id, false, "")) : askDrop(i))}>{i.dropped ? "Undo" : "Drop"}</button>}
      </div>
    </div>
  );

  const stepBody = [
    // 1 · Last week's plan vs what happened
    <div key="s1" className="plan-list">
      <div className="lbl">Week of {view.prevLabel} · plan vs what happened</div>
      {prev.length === 0 && <div className="info">No plan for last week. From next Monday, this step shows what was planned and what happened to each item.</div>}
      {prev.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <span className="pill raise"><b>{prev.length}</b>planned</span>
          <span className="pill raise"><b>{prev.filter((i) => i.stage === "Launched").length}</b>launched</span>
          <span className="pill raise"><b>{prev.filter((i) => i.dropped).length}</b>dropped</span>
          <span className={`pill ${prev.some((i) => !i.closed && !i.dropped) ? "pill-r" : "raise"}`}><b>{prev.filter((i) => !i.closed && !i.dropped).length}</b>not finished</span>
        </div>
      )}
      {prev.map(outcome)}
      {older.length > 0 && <div className="lbl" style={{ marginTop: 6 }}>Still open from earlier weeks · {older.length}</div>}
      {older.map(outcome)}
      <div className="unit">Not finished = carried into this week automatically (tagged “From last week” in the pipelines) until it is launched or dropped.</div>
    </div>,

    // 2 · Last week's tests
    <div key="s2" className="plan-list">
      {!view.hasMeta && <div className="info">No Meta numbers yet (Meta not connected). Launched concepts show here with their state once the daily Meta pull runs.</div>}
      {view.tests.length === 0 && view.hasMeta && <div className="info">Nothing launched since {view.prevLabel}.</div>}
      {view.tests.map((t) => (
        <div key={t.taskId} className="plan-row">
          <div style={{ minWidth: 0 }}><div className="plan-name">{t.name}</div><div className="unit">{t.cell} · launched {t.launched}</div></div>
          <div className="plan-state"><span className={`tag ${t.tone}`}><i aria-hidden="true" />{t.word}</span> <span className="unit">{t.line}</span></div>
          <span />
        </div>
      ))}
    </div>,

    // 3 · Double down
    <div key="s3" className="plan-list">
      {view.winners.length === 0 && <div className="info">{view.hasMeta ? "No concept is converting under its own line right now." : "Winners show here once Meta is connected (state Won or Recovering, still live)."} Plan new tests instead.</div>}
      {view.winners.map((w) => {
        const mine = ddOf(w.taskId);
        const canLess = mine.some((i) => removable(i));
        return (
          <div key={w.taskId} className="plan-row">
            <div style={{ minWidth: 0 }}><div className="plan-name">{w.name}</div><div className="unit">{w.cell}</div></div>
            <div className="plan-state"><span className="unit">{w.line}</span></div>
            <div className="plan-count" role="group" aria-label={`New concepts for ${w.name}`}>
              <button type="button" className="btn b-ghost plan-xs" aria-label="One less" disabled={pending || !canLess} onClick={() => { const last = [...mine].reverse().find(removable); if (last) run(() => removePlanItem(last.id)); }}>−</button>
              <b aria-live="polite">{mine.length}</b>
              <button type="button" className="btn b-ghost plan-xs" aria-label="One more" disabled={pending} onClick={() => { setAll(false); run(() => addPlanItem("double_down", w.taskId, null, null, "")); }}>+</button>
            </div>
          </div>
        );
      })}
      <div className="unit">Same core message and avatar, new concepts (each with its own hooks). Each one becomes a copywriting task.</div>
    </div>,

    // 4 · New tests
    <div key="s4" className="plan-list">
      <div className="cov-wrap">
        <table className="cov">
          <caption className="sr-only">Concepts tried per avatar and awareness level. Pick a cell to plan a new test there.</caption>
          <thead><tr><th scope="col" className="lbl">Avatar</th>{AWARENESS.map((a) => <th key={a} scope="col" className="lbl">{SHORT_AW[a]}</th>)}</tr></thead>
          <tbody>
            {view.coverage.map((r) => (
              <tr key={r.id}>
                <th scope="row" title={r.label}>{r.code}</th>
                {r.cells.map((c) => {
                  const on = nt.avatar === r.id && nt.awareness === c.awareness;
                  return (
                    <td key={c.awareness}>
                      <button type="button" className={`cov-cell ${c.total === 0 ? "never" : c.working ? "works" : c.lost === c.total ? "dead" : ""} ${on ? "on" : ""}`} aria-pressed={on}
                        aria-label={`${r.code} × ${SHORT_AW[c.awareness]}: ${c.total === 0 ? "never tried" : `${c.total} tried, ${c.working} working, ${c.lost} over the line, ${c.moving} in progress`}${c.planned ? `, ${c.planned} planned this week` : ""}`}
                        onClick={() => setNt({ ...nt, avatar: r.id, awareness: c.awareness })}>
                        {c.total === 0 ? <span className="cov-never">Never tried</span> : (
                          <>
                            <span><b>{c.total}</b> tried</span>
                            <span className="cov-bits">
                              {c.working > 0 && <span className="cov-g">{c.working} working</span>}
                              {c.lost > 0 && <span className="cov-r">{c.lost} over line</span>}
                              {c.moving > 0 && <span>{c.moving} in progress</span>}
                            </span>
                          </>
                        )}
                        {c.planned > 0 && <span className="cov-plan">+{c.planned} this week</span>}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {nt.avatar && nt.awareness ? (
        <form
          className="plan-form"
          onSubmit={(e) => { e.preventDefault(); setAll(false); run(async () => { const r = await addPlanItem("new_test", null, nt.avatar, nt.awareness, nt.note); if (r.ok) setNt({ avatar: "", awareness: "", note: "" }); return r; }); }}
        >
          <label className="field" style={{ gridColumn: "1 / 3" }}>
            <span className="lbl">{view.coverage.find((r) => r.id === nt.avatar)?.code} × {SHORT_AW[nt.awareness]} · idea, optional</span>
            <input className="inp" maxLength={300} value={nt.note} onChange={(e) => setNt({ ...nt, note: e.target.value })} placeholder="e.g. daughter worried about her mother's stairs" />
          </label>
          <button type="submit" className="btn b-primary" disabled={pending}>Add new test</button>
        </form>
      ) : <div className="unit">Counts are concepts since the map start date (Settings), both tracks. Working = live and under its own line now; over line = lost or fading; the others are in progress or paused.</div>}
    </div>,

    // 5 · Production order
    <div key="s5" className="plan-list">
      <ProductionOrder compact items={order.items} prio={order.prio} version={order.version} now={order.now} />
    </div>,

    // 6 · Launches
    <div key="s6" className="plan-list">
      {view.launches.length === 0 && <div className="info">No approved video waiting to launch.</div>}
      {view.launches.map((l) => {
        const it = launchOf(l.taskId);
        return (
          <label key={l.taskId} className="plan-row plan-check">
            <input
              type="checkbox"
              checked={!!it}
              disabled={pending}
              onChange={() => { setAll(false); if (!it) run(() => addPlanItem("launch", l.taskId, null, null, "")); else takeOut(it); }}
            />
            <div style={{ minWidth: 0 }}><div className="plan-name">{l.name}</div><div className="unit">{l.title} · {l.sub}</div></div>
            <span className="unit" style={{ textAlign: "right" }}>waiting {l.days} day{l.days === 1 ? "" : "s"}</span>
          </label>
        );
      })}
      <div className="unit">Launching itself stays where it is: the LAUNCH item on Home (ad names, final folder, Done).</div>
    </div>,
  ];

  const groups: { key: string; title: string; list: PlanItemView[] }[] = [
    { key: "carry", title: "From last week", list: view.items.filter((i) => i.carry) },
    { key: "dd", title: "Double down", list: view.items.filter((i) => !i.carry && i.kind === "double_down") },
    { key: "nt", title: "New tests", list: view.items.filter((i) => !i.carry && i.kind === "new_test") },
    { key: "ln", title: "Launches", list: view.items.filter((i) => !i.carry && i.kind === "launch") },
  ];

  const switcher = (
    <div className="recess wseg" role="group" aria-label="Week plan view" style={{ alignSelf: "flex-start" }}>
      <button type="button" className={mode === "track" ? "seg-on" : ""} aria-pressed={mode === "track"} onClick={() => setMode("track")}>This week</button>
      <button type="button" className={mode === "plan" ? "seg-on" : ""} aria-pressed={mode === "plan"} onClick={() => setMode("plan")}>{locked ? "Edit plan" : "Plan"}</button>
    </div>
  );

  if (mode === "track") {
    const tr = view.track;
    const late = tr.filter((r) => r.late);
    const live = tr.filter((r) => r.at === 7).length;
    const createFirst = tr.find((r) => r.prefill);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {switcher}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <span className="pill raise"><b>{tr.length}</b>planned</span>
          <span className="pill raise"><b>{live}</b>launched</span>
          <span className="pill raise"><b>{tr.length - live - late.length}</b>moving</span>
          <span className={`pill ${late.length ? "pill-r" : "raise"}`}><b>{late.length}</b>late</span>
          {tr.some((r) => r.carry) && <span className="pill raise"><b>{tr.filter((r) => r.carry).length}</b>from last week</span>}
        </div>
        {!locked && <div className="notice" style={{ background: "#e4ebfa", color: "#22468f" }}>Not locked yet: this is the plan so far. Lock it in Plan when both of you agree.</div>}
        {late.length > 0 && (
          <section className="trk-block" aria-labelledby="h-block">
            <h2 id="h-block" className="lbl" style={{ margin: 0, color: "var(--red-ink)" }}>Blocking the week · finish these first</h2>
            {late.map((r) => (
              <div key={r.id} className="trk-brow">
                <div style={{ minWidth: 0 }}><div className="plan-name">{r.name}</div><div className="unit">{r.meta}</div></div>
                <div style={{ fontSize: 13 }}><span className="lbl">Stuck at</span><br /><b>{TRACK[r.at]}</b> · {r.time}</div>
                <div style={{ fontSize: 13 }}><span className="lbl">Waiting on</span><br /><b><F>{r.who}</F></b> · {r.what}</div>
                {r.href ? <Link href={r.href} className="btn b-primary plan-xs"><LinkPending idle="Open" busy="Opening…" /></Link> : <span />}
              </div>
            ))}
          </section>
        )}
        <div className="tray pipe trk">
          <div className="pipe-grid pipe-head" aria-hidden="true">
            <span className="lbl">Planned item</span>
            <div className="rail">{TRACK.map((s) => <span key={s} className="st">{s}</span>)}</div>
            <span className="lbl">Waiting on</span>
            <span className="lbl" style={{ textAlign: "right" }}>Due / late</span>
          </div>
          {tr.length === 0 && <div className="info">Nothing planned for this week yet. Open Plan to add double downs, new tests and launches.</div>}
          {tr.map((r) => {
            const steps = TRACK.map((_, k) => ((r.kind === "launch" && k < 6) || (k === 4 && r.skipShoot) ? "skip" : k < r.at ? "done" : k === r.at && r.at < 7 ? (r.late ? "late" : "now") : r.at === 7 ? "done" : "todo"));
            const body = (
              <div className="pipe-grid">
                <div style={{ minWidth: 0 }}>
                  <div className="pipe-name">
                    {r.name}
                    {r.carry && <span className="tag t-orange wk-tag"><i aria-hidden="true" />FROM LAST WEEK</span>}
                    {r.added && <span className="tag t-violet wk-tag"><i aria-hidden="true" />{r.added}</span>}
                    {r.hold && <span className="tag t-hold wk-tag"><i aria-hidden="true" />ON HOLD</span>}
                  </div>
                  <div className="pipe-meta">{r.meta}</div>
                  <span className="sr-only">Now: {r.at === 7 ? "launched" : `${TRACK[r.at]}${r.time ? `, ${r.time}` : ""}${r.late ? ", late" : ""}`}.</span>
                </div>
                <div className="rail" aria-hidden="true">
                  {steps.map((s, k) => (s === "now" || s === "late" ? <span key={k} className={s === "late" ? "s-b" : "s-n"}>{r.time || "now"}</span> : <span key={k} className={`s ${s === "done" ? "s-d" : s === "skip" ? "s-k" : ""}`} />))}
                </div>
                <div className="rail rail-lbl" aria-hidden="true">{TRACK.map((s) => <span key={s} className="st">{s}</span>)}</div>
                <div style={{ fontSize: 13 }}>
                  {r.prefill
                    ? <button type="button" className="btn b-primary plan-xs" onClick={(e) => { e.preventDefault(); setAll(false); setCreateFor(r.id); }}>Create task</button>
                    : <><b><F>{r.who}</F></b> · {r.what}</>}
                </div>
                <div className={`due ${r.late ? "red" : ""}`}>{r.due}</div>
              </div>
            );
            return r.href
              ? <Link key={r.id} href={r.href} className={`row pipe-row ${r.late ? "row-late" : ""}`}>{body}<RowPending /></Link>
              : <div key={r.id} className={`row pipe-row ${r.late ? "row-late" : ""}`}>{body}</div>;
          })}
        </div>
        <div className="pipe-legend">
          <span>Black = done</span><span>Outlined = where it is now, time there</span><span>Red = late (same rules as the pipelines)</span><span>Hatched = step not needed (no shoot for AI / 3D and VO; a launch-only video starts at Delivered)</span><span>Click a row → its task or video</span>
        </div>
        {createFirst && tr.filter((r) => r.prefill).length > 1 && <button type="button" className="btn b-ghost" style={{ alignSelf: "flex-start" }} onClick={() => { setCreateFor(null); setAll(true); }}>Create all remaining tasks ({tr.filter((r) => r.prefill).length})</button>}
        {locked && (
          <section className="card sec" aria-labelledby="h-log">
            <h2 id="h-log" className="lbl" style={{ margin: 0 }}>Changes since the plan was locked ({view.locked}) · {view.log.length}</h2>
            {view.log.length === 0 && <div className="unit">No change since the lock.</div>}
            {view.log.map((l, k) => <div key={k} className="plan-log"><span className="unit">{l.when}</span><b><F>{l.who}</F></b><span>{l.what}</span></div>)}
          </section>
        )}
        {active?.prefill && (
          <CreateTaskButton key={active.id} autoOpen ctx={ctx} pickers={pickers} prefill={active.prefill} onClose={() => { setCreateFor(null); setAll(false); }} />
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
    {switcher}
    <div className="plan-grid">
      <section className="card sec" aria-labelledby="h-step">
        <nav className="recess plan-steps" aria-label="Steps">
          {STEPS.map((s, i) => (
            <button key={s} type="button" className={`plan-step ${i === step ? "on" : i < step ? "past" : ""}`} aria-current={i === step ? "step" : undefined} onClick={() => setStep(i)}>
              {i + 1} · {s}
            </button>
          ))}
        </nav>
        <div>
          <div className="lbl">Step {step + 1} of {STEPS.length}</div>
          <h2 id="h-step" style={{ margin: "6px 0 4px", fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em" }}>{STEPS[step]}</h2>
          <div className="sub" style={{ lineHeight: 1.5 }}>{HELP[step]}</div>
        </div>
        {stepBody[step]}
        {msg.error && <span className="formmsg err" role="alert">{msg.error}</span>}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
          <button type="button" className="btn b-ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>← Back</button>
          {step < STEPS.length - 1 && <button type="button" className="btn b-primary" onClick={() => setStep(step + 1)}>Next →</button>}
        </div>
      </section>

      <aside className="card sec plan-side" aria-labelledby="h-plan">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
          <div>
            <h2 id="h-plan" style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Week of {view.weekLabel}</h2>
            <div className="unit">{locked ? `Locked ${view.locked}. Changes are tagged and logged.` : "Not locked yet. Saved as you go."}</div>
          </div>
          <div className={`tag ${scripts > view.cap ? "t-red" : "t-grey"} plan-cap`}>
            <button type="button" aria-label="One script less this week" disabled={pending || view.cap <= 1} onClick={() => run(() => setPlanCap(view.cap - 1))}>−</button>
            {scripts} OF {view.cap} SCRIPTS
            <button type="button" aria-label="One script more this week" disabled={pending || view.cap >= 30} onClick={() => run(() => setPlanCap(view.cap + 1))}>+</button>
          </div>
        </div>
        {view.items.length === 0 && <div className="info">Nothing planned yet. Add double downs (step 3), new tests (step 4) and launches (step 6): they collect here.</div>}
        {groups.filter((g) => g.list.length).map((g) => (
          <div key={g.key} className="plan-group">
            <div className="lbl">{g.title} · {g.list.filter((i) => !i.dropped).length}</div>
            {g.list.map((i) => (
              <div key={i.id} className={`plan-mini ${i.dropped ? "is-dropped" : ""}`}>
                <div style={{ minWidth: 0 }}>
                  <div className="plan-name" style={{ fontSize: 14 }}>
                    {i.name}
                    {i.carry && <span className="tag t-orange plan-tag">FROM LAST WEEK</span>}
                    {i.added && <span className="tag t-violet plan-tag">{i.added}</span>}
                  </div>
                  <button type="button" className="plan-more" aria-expanded={!!open[i.id]} onClick={() => setOpen({ ...open, [i.id]: !open[i.id] })}>
                    {i.dropped ? `Dropped · ${i.dropped.reason}` : i.stage}{open[i.id] ? " ▴" : " ▾"}
                  </button>
                  {open[i.id] && <div className="unit">{i.meta}</div>}
                </div>
                <div className="plan-acts">
                  {i.prefill && <button type="button" className="btn b-primary plan-xs" disabled={pending} onClick={() => { setAll(false); setCreateFor(i.id); }}>Create task</button>}
                  {i.dropped
                    ? <button type="button" className="btn b-ghost plan-xs" disabled={pending} onClick={() => run(() => dropPlanItem(i.id, false, ""))}>Undo</button>
                    : !i.closed && (removable(i)
                      ? <button type="button" className="btn b-ghost plan-xs" aria-label={`Take out ${i.name}`} disabled={pending} onClick={() => takeOut(i)}>×</button>
                      : (locked || i.carry || i.hasTask) && <button type="button" className="btn b-ghost plan-xs" disabled={pending} onClick={() => takeOut(i)}>Drop</button>)}
                </div>
              </div>
            ))}
          </div>
        ))}
        {remaining.length > 1 && <button type="button" className="btn b-ghost" disabled={pending} onClick={() => { setCreateFor(null); setAll(true); }}>Create all remaining tasks ({remaining.length})</button>}
        {!locked && (
          <button type="button" className="btn b-primary" disabled={pending} onClick={() => run(lockPlan)}>Lock the week plan</button>
        )}
        {msg.ok && <span className="formmsg ok" role="status">{msg.ok}</span>}
        {locked && (
          <div className="plan-group">
            <div className="lbl">Changes since the lock · {view.log.length}</div>
            {view.log.map((l, k) => <div key={k} className="plan-log"><span className="unit">{l.when}</span><b>{l.who}</b><span>{l.what}</span></div>)}
          </div>
        )}
      </aside>

      {active?.prefill && (
        <CreateTaskButton key={active.id} autoOpen ctx={ctx} pickers={pickers} prefill={active.prefill} onClose={() => { setCreateFor(null); setAll(false); }} />
      )}

      <Modal open={!!drop} onClose={() => setDrop(null)} who="Founder · Week plan" title={drop ? `Drop “${drop.name}”?` : "Drop"}>
        <form
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!drop) return;
            const r = reason === "other" ? other : reason;
            const it = drop;
            run(async () => { const res = await dropPlanItem(it.id, true, r); if (res.ok) setDrop(null); return res; });
          }}
        >
          <div className="sub">It leaves the week plan. Its task and its video stay where they are.</div>
          <div role="radiogroup" aria-label="Reason" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[...DROP_REASONS, "other"].map((r) => (
              <label key={r} className={`pick ${reason === r ? "pick-on" : ""}`}>
                <input type="radio" className="pick-radio" name="reason" checked={reason === r} onChange={() => setReason(r)} />
                <span>{r === "other" ? "Other…" : r}</span>
              </label>
            ))}
          </div>
          {reason === "other" && <input className="inp" required minLength={3} maxLength={200} value={other} onChange={(e) => setOther(e.target.value)} placeholder="Why?" aria-label="Reason" />}
          {msg.error && <span className="formmsg err" role="alert">{msg.error}</span>}
          <div className="acts">
            <button type="button" className="btn b-ghost" onClick={() => setDrop(null)}>Keep it</button>
            <button type="submit" className="btn b-primary" disabled={pending}>Drop</button>
          </div>
        </form>
      </Modal>
    </div>
    </div>
  );
}
