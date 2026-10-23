"use client";

import { startTransition, useState } from "react";
import { Modal } from "./Modal";
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
  log: { when: string; who: string; what: string }[];
  hasMeta: boolean;
  ok: boolean;
};

const STEPS = ["Last week's plan", "Last week's tests", "Double down", "New tests", "Production order", "Launches"];

/** Monday plan: one step at a time on the left, the week's plan on the right (always visible, updates from statuses). */
export function PlanWeek({ view, ctx, pickers, order }: {
  view: PlanView;
  ctx: CreateTaskContext;
  pickers: Pickers;
  order: { items: OrderItem[]; prio: Record<string, Prio>; version: number; now: number };
}) {
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
  const scripts = live.filter((i) => i.kind !== "launch" && !i.carry).length;
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
  const takeOut = (i: PlanItemView) => (removable(i) ? run(() => removePlanItem(i.id)) : (setDrop(i), setReason(DROP_REASONS[0]), setOther("")));

  if (!view.ok) return <div className="notice notice-red" role="alert">The week plan could not be read. Reload the page.</div>;

  const ddOf = (taskId: string) => live.filter((i) => i.kind === "double_down" && i.sourceTask === taskId && !i.carry);
  const launchOf = (taskId: string) => live.find((i) => i.kind === "launch" && i.sourceTask === taskId);

  const stepBody = [
    // 1 · Last week's plan vs what happened
    <div key="s1" className="plan-list">
      <div className="lbl">Week of {view.prevLabel} · plan vs what happened</div>
      {view.lastWeek.length === 0 && <div className="info">No plan for last week. From next Monday, this step shows what was planned and what happened to each item.</div>}
      {view.lastWeek.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <span className="pill raise"><b>{view.lastWeek.length}</b>planned</span>
          <span className="pill raise"><b>{view.lastWeek.filter((i) => i.stage === "Launched").length}</b>launched</span>
          <span className="pill raise"><b>{view.lastWeek.filter((i) => i.dropped).length}</b>dropped</span>
          <span className={`pill ${view.lastWeek.some((i) => !i.closed && !i.dropped) ? "pill-r" : "raise"}`}><b>{view.lastWeek.filter((i) => !i.closed && !i.dropped).length}</b>not finished</span>
        </div>
      )}
      {view.lastWeek.map((i) => (
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
            {!i.closed && <button type="button" className="btn b-ghost plan-xs" disabled={pending} onClick={() => (i.dropped ? run(() => dropPlanItem(i.id, false, "", i.name)) : (setDrop(i), setReason(DROP_REASONS[0]), setOther("")))}>{i.dropped ? "Undo" : "Drop"}</button>}
          </div>
        </div>
      ))}
      <div className="unit">Not finished = carried into this week automatically (tagged “From last week” in the pipelines) until it is launched or dropped.</div>
    </div>,

    // 2 · Last week's tests
    <div key="s2" className="plan-list">
      <div className="lbl">Launched since {view.prevLabel} · their Meta state</div>
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
      <div className="lbl">Converting under its own line now · how many new concepts each</div>
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
      <div className="lbl">New avatars or awareness levels to test</div>
      <form
        className="plan-form"
        onSubmit={(e) => { e.preventDefault(); setAll(false); run(async () => { const r = await addPlanItem("new_test", null, nt.avatar, nt.awareness, nt.note); if (r.ok) setNt({ avatar: "", awareness: "", note: "" }); return r; }); }}
      >
        <label className="field"><span className="lbl">Avatar</span>
          <select className="inp" required value={nt.avatar} onChange={(e) => setNt({ ...nt, avatar: e.target.value })}>
            <option value="" disabled>Choose…</option>
            {pickers.avatars.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        </label>
        <label className="field"><span className="lbl">Awareness</span>
          <select className="inp" required value={nt.awareness} onChange={(e) => setNt({ ...nt, awareness: e.target.value })}>
            <option value="" disabled>Choose…</option>
            {AWARENESS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className="field" style={{ gridColumn: "1 / -1" }}><span className="lbl">Idea · optional</span>
          <input className="inp" maxLength={300} value={nt.note} onChange={(e) => setNt({ ...nt, note: e.target.value })} placeholder="e.g. daughter worried about her mother's stairs" />
        </label>
        <button type="submit" className="btn b-primary" disabled={pending}>Add new test</button>
      </form>
      {live.filter((i) => i.kind === "new_test" && !i.carry).map((i) => (
        <div key={i.id} className="plan-row">
          <div style={{ minWidth: 0 }}><div className="plan-name">{i.name}</div><div className="unit">{i.meta}</div></div>
          <span /><span />
        </div>
      ))}
    </div>,

    // 5 · Production order
    <div key="s5" className="plan-list">
      <div className="unit">Scripts in production, in the order the agency, the editors and the copywriters follow. Drag a row (or use ↑ ↓) to change it.</div>
      <ProductionOrder items={order.items} prio={order.prio} version={order.version} now={order.now} />
    </div>,

    // 6 · Launches
    <div key="s6" className="plan-list">
      <div className="lbl">Approved videos not launched yet · tick the ones to launch this week</div>
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

  return (
    <div className="plan-grid">
      <section className="card sec" aria-labelledby="h-step">
        <nav className="plan-steps" aria-label="Steps">
          {STEPS.map((s, i) => (
            <button key={s} type="button" className={`plan-step ${i === step ? "on" : ""} ${i < step ? "past" : ""}`} aria-current={i === step ? "step" : undefined} onClick={() => setStep(i)}>
              <span className="plan-num">{i + 1}</span>{s}
            </button>
          ))}
        </nav>
        <h2 id="h-step" style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>{step + 1} · {STEPS[step]}</h2>
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
                    ? <button type="button" className="btn b-ghost plan-xs" disabled={pending} onClick={() => run(() => dropPlanItem(i.id, false, "", i.name))}>Undo</button>
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
          <button type="button" className="btn b-primary" disabled={pending || view.items.filter((i) => !i.carry && !i.dropped).length === 0} onClick={() => run(lockPlan)}>Lock the week plan</button>
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
            run(async () => { const res = await dropPlanItem(it.id, true, r, it.name); if (res.ok) setDrop(null); return res; });
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
  );
}
