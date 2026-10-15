"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { Modal } from "./Modal";
import { createTask, type TaskState } from "@/app/tasks/actions";
import { AWARENESS, shortAwareness, type Pickers } from "@/lib/proposals-shared";
import { changeFacts, suggestCopywriter, tunisDate, TASK_STATUS, type CreateTaskContext, type TaskRow } from "@/lib/tasks-shared";

const empty: TaskState = {};
const NEW = "__new__";

export type TaskPrefill = {
  proposalId: string;
  avatarId: string;
  awareness: string;
  angleId: string | null;
  formatId: string | null;
  label: string; // "Test: Knee-Broad · FSS × Most" — shown in the pop-up header
};

const formatName = (f: { code: string | null; label: string }) => (f.code === "AI" ? "AI / 3D (Generate, no shoot)" : f.label);

/** "+ Create task" → New script task pop-up (Pop-ups artboard, Create task). Founders only. */
export function CreateTaskButton({
  ctx,
  pickers,
  prefill,
  label = "+ Create task",
  className = "add",
}: {
  ctx: CreateTaskContext;
  pickers: Pickers;
  prefill?: TaskPrefill;
  label?: string;
  className?: string;
}) {
  const [openedAt, setOpenedAt] = useState<number | null>(null);
  const [state, action, pending] = useActionState(createTask, empty);
  const start = () => ({
    avatar: prefill?.avatarId ?? "",
    awareness: prefill?.awareness ?? "",
    angle: prefill?.angleId ?? "",
    format: prefill?.formatId ?? "",
    writer: suggestCopywriter(ctx.copywriters) ?? "",
  });
  const [f, setF] = useState(start);
  const set = (k: keyof ReturnType<typeof start>) => (v: string) => setF((o) => ({ ...o, [k]: v }));

  const open = openedAt !== null && !(state.ok && (state.at ?? 0) > openedAt);
  const setOpen = (v: boolean) => {
    setOpenedAt(v ? Date.now() : null);
    if (v) setF(start());
  };
  const shownError = state.error && (state.at ?? 0) > (openedAt ?? 0) ? state.error : "";

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => action(fd));
  };

  const angle = ctx.angles.find((a) => a.id === f.angle);
  const cellReady = f.avatar && f.awareness && f.angle && f.angle !== NEW;
  const facts = cellReady ? changeFacts(ctx.tasks, { avatarId: f.avatar, awareness: f.awareness, angleId: f.angle }, pickers.formats) : null;
  const star = suggestCopywriter(ctx.copywriters);
  const noWriters = ctx.copywriters.length === 0;

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>{label}</button>
      {state.ok && !open && <span className="formmsg ok" role="status" style={{ marginLeft: 12 }}>{state.ok}</span>}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        who={prefill ? `Founder · from an approved proposal · ${prefill.label}` : "Founder · Create task"}
        title="New script task"
      >
        <form key={openedAt ?? 0} onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {prefill && <input type="hidden" name="proposal_id" value={prefill.proposalId} />}
          <div className="row2">
            <label className="field">
              <span className="lbl">Avatar</span>
              <select className="inp" name="avatar_id" required value={f.avatar} onChange={(e) => set("avatar")(e.target.value)}>
                <option value="" disabled>Choose…</option>
                {pickers.avatars.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="lbl">Awareness</span>
              <select className="inp" name="awareness" required value={f.awareness} onChange={(e) => set("awareness")(e.target.value)}>
                <option value="" disabled>Choose…</option>
                {AWARENESS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="lbl">Angle</span>
              <select className="inp" name="angle_id" required value={f.angle} onChange={(e) => set("angle")(e.target.value)}>
                <option value="" disabled>Choose…</option>
                {ctx.angles.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                <option value={NEW}>+ New angle…</option>
              </select>
            </label>
            <label className="field">
              <span className="lbl">Format</span>
              <select className="inp" name="format_id" required value={f.format} onChange={(e) => set("format")(e.target.value)}>
                <option value="" disabled>Choose…</option>
                {pickers.formats.map((x) => <option key={x.id} value={x.id}>{formatName(x)}</option>)}
              </select>
            </label>
          </div>
          {f.angle === NEW && (
            <div className="row2">
              <label className="field">
                <span className="lbl">New angle name</span>
                <input className="inp" name="new_angle_name" required minLength={2} maxLength={80} placeholder="e.g. Surgery date is set" />
                <span className="unit">Written with dashes in ad names, e.g. Surgery-Date-Is-Set. Added to Settings · Lists as approved.</span>
              </label>
              <label className="field">
                <span className="lbl">Track</span>
                <select className="inp" name="track" defaultValue="knee">
                  <option value="knee">Knee</option>
                  <option value="hips">Hips</option>
                  <option value="both">Both</option>
                </select>
              </label>
            </div>
          )}
          <div className="row2">
            <label className="field">
              <span className="lbl">Due</span>
              <input className="inp" type="date" name="due_on" required min={tunisDate(0)} defaultValue={tunisDate(7)} />
            </label>
            <label className="field">
              <span className="lbl">Reference ad · optional</span>
              <input className="inp" name="reference" maxLength={500} placeholder="ad name or link" />
            </label>
          </div>

          <div className="keep">
            <b>KEEP</b> ·{" "}
            {f.angle === NEW
              ? "new angle: no core message yet. It is written when a concept in it wins."
              : angle?.coreMessage
                ? <>from the angle&apos;s core message: “{angle.coreMessage}”</>
                : angle
                  ? "no core message yet for this angle. It is written when a concept in it wins."
                  : "pick the angle to see its core message."}
          </div>
          <div className="chg">
            <b>CHANGE · facts only</b>
            {!facts ? (
              <span>{f.angle === NEW ? "New angle: nothing tried here yet." : "Pick avatar, awareness and angle to see what was tried in this cell."}</span>
            ) : (
              <>
                <span className="chg-row">
                  So far here{" "}
                  {facts.used.length ? facts.used.map((u) => <span key={u.label} className="ch-used">{u.label} {u.count}</span>) : <span>nothing yet</span>}
                </span>
                <span className="chg-row">
                  Untried{" "}
                  {facts.untried.length ? facts.untried.map((u) => <span key={u} className="ch-un">{u}</span>) : <span>every format tried</span>}
                </span>
              </>
            )}
          </div>

          <label className="field">
            <span className="lbl">Founder note · optional</span>
            <textarea className="ta" name="founder_note" maxLength={1000} rows={2} placeholder="new face, a doctor's voice" />
          </label>

          <div className="field" role="radiogroup" aria-label="Copywriter">
            <span className="lbl">Copywriter · load this week</span>
            <input type="hidden" name="copywriter_id" value={f.writer} />
            {noWriters && <div className="info">No active copywriter yet. Add one in Settings → People first.</div>}
            {ctx.copywriters.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={f.writer === c.id}
                className={`pick ${f.writer === c.id ? "pick-on" : ""}`}
                onClick={() => set("writer")(c.id)}
              >
                <span>{c.id === star && ctx.copywriters.length > 1 ? "★ " : ""}{c.name}</span>
                <span className="sub">
                  {c.target ? `${c.approvedThisWeek} of ${c.target} scripts` : `${c.approvedThisWeek} scripts approved`} · {c.openTasks} open task{c.openTasks === 1 ? "" : "s"}
                </span>
              </button>
            ))}
          </div>

          <div className="acts">
            {shownError && <span className="formmsg err" role="alert">{shownError}</span>}
            <button type="button" className="btn b-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" className="btn b-primary" disabled={pending || noWriters}>{pending ? "Creating…" : "Create task"}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}

/** Task list on the Copywriting tab: founders see all, a copywriter her own. Open tasks first, then by due date. */
export function TaskList({ tasks, showWriter }: { tasks: TaskRow[]; showWriter: boolean }) {
  if (!tasks.length) return <div className="info">No tasks yet.</div>;
  const today = tunisDate(0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {tasks.map((t) => {
        const st = TASK_STATUS[t.status] ?? { word: t.status.toUpperCase(), tone: "t-grey" };
        const late = ["writing", "changes"].includes(t.status) && t.dueOn < today;
        return (
          <div className="row task" key={t.id}>
            <div className="task-top">
              <span className={`tag ${st.tone}`}><i aria-hidden="true" />{st.word}</span>
              <b style={{ fontSize: 15 }}>{t.angle}</b>
              <span className="tag t-grey">{t.avatarCode} × {shortAwareness(t.awareness)}</span>
              <span className="unit">{t.format}</span>
              {showWriter && <span className="unit">· {t.copywriter}</span>}
              <span className="unit" style={{ marginLeft: "auto", color: late ? "var(--red-ink)" : undefined, fontWeight: late ? 600 : undefined }}>
                {late ? "LATE · " : ""}due {fmtDate(t.dueOn)}
              </span>
            </div>
            {t.keep && <div className="sub"><b>Keep:</b> {t.keep}</div>}
            {t.note && <div className="sub"><b>Note:</b> {t.note}</div>}
            {t.reference && <div className="sub"><b>Reference:</b> {t.reference}</div>}
          </div>
        );
      })}
    </div>
  );
}

function fmtDate(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}
