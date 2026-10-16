"use client";

import Link from "next/link";
import { startTransition, useEffect, useRef, useState } from "react";
import { NeedsChanges } from "./TaskView";
import { CopyName } from "./ScriptDetails";
import { AssignButton, LaunchButton } from "./Production";
import { reviewEdit, startEdit, submitEdit } from "@/app/tasks/actions";
import { EDIT_STEPS, EDIT_TAG, editStepNow, type EditRound, type EditState, type EditorStats, type QueueItem } from "@/lib/editing-shared";
import { fmtDay, fmtWhen, isLink, type EditorLoad, type LaunchNames, type ProdCard, type Production } from "@/lib/tasks-shared";

/** The three private tiles (Editing artboard) + the 3D tile for the AI / 3D editor. */
export function EditorTiles({ s, showAi }: { s: EditorStats; showAi: boolean }) {
  return (
    <section className="ed-tiles" aria-label="My numbers">
      <div className="card ed-tile k-green">
        <div className="lbl">Approved this month</div>
        <div className="ed-num"><span>{s.approvedMonth}</span><em>video{s.approvedMonth === 1 ? "" : "s"}{s.payPerVideo !== null ? ` = ${(s.approvedMonth * s.payPerVideo).toLocaleString("en-US")} TND` : ""}</em></div>
        <div className="unit">{s.payPerVideo !== null ? `${s.payPerVideo} TND per video, hooks and subtitles included` : "Pay per video: to fill in Settings"}</div>
      </div>
      <div className="card ed-tile">
        <div className="lbl">Revision rounds · average</div>
        <div className="ed-num"><span>{s.avgRounds ?? "—"}</span><em>{s.avgRounds3m !== null ? `last 3 months ${s.avgRounds3m}` : "no approved video yet"}</em></div>
        <div className="unit">Versions sent per approved video, last 30 days</div>
      </div>
      <div className="card ed-tile">
        <div className="lbl">On time · days per video</div>
        <div className="ed-num"><span>{s.onTime}<b>/{s.onTimeOf}</b></span><em>{s.daysPerVideo !== null ? `· ${s.daysPerVideo} days` : ""}</em></div>
        <div className="unit">Approved by the due date this month · footage → first version</div>
      </div>
      {showAi && (
        <div className="card ed-tile">
          <div className="lbl">3D generations · this month</div>
          <div className="ed-num"><span>{s.aiMonth}</span><em>{s.rate3d !== null ? `= ${(s.aiMonth * s.rate3d).toLocaleString("en-US")} TND` : "rate to fill"}</em></div>
          <div className="unit">Full AI / 3D videos approved, paid on top of the edit</div>
        </div>
      )}
    </section>
  );
}

/**
 * Tiles + queue + open task, with the founders' Editor A · B · All switch. Each editor's tiles are computed on the server,
 * so switching is instant and the numbers always match the queue shown. Queue | Pipeline switch for founders.
 */
export function EditBoard({
  statsBy,
  aiBy,
  items,
  selectedId,
  editors,
  initialEd,
  forFounder,
  views,
  isEditorId,
  editorLoads,
  createTask,
  pipeline,
}: {
  statsBy: Record<string, EditorStats>;
  aiBy: Record<string, boolean>;
  items: QueueItem[];
  selectedId: string | null;
  editors: [string, string][];
  initialEd: string | null;
  forFounder: boolean;
  /** Every video of the queue, ready to open instantly. */
  views: Record<string, EditView>;
  /** The viewer's person id when she is an editor (her own edits get the editor controls). */
  isEditorId: string | null;
  editorLoads: EditorLoad[];
  createTask?: React.ReactNode;
  pipeline?: React.ReactNode;
}) {
  const [ed, setEd] = useState<string | null>(initialEd);
  const [view, setView] = useState<"queue" | "pipeline">("queue");
  const [sel, setSel] = useState<string | null>(selectedId);
  const open = (taskId: string) => {
    setSel(taskId);
    const q = new URLSearchParams(window.location.search);
    q.set("task", taskId);
    window.history.replaceState(null, "", `/editing?${q}`);
    // On a phone the task sits under the queue: bring it into view.
    if (window.innerWidth < 1000) requestAnimationFrame(() => document.getElementById("edit-view")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const shownItems = ed ? items.filter((i) => i.editorId === ed) : items;
  const current = sel && shownItems.some((i) => i.taskId === sel) ? sel : shownItems[0]?.taskId ?? null;
  const v = current ? views[current] : undefined;
  const pick = (id: string | null) => {
    setEd(id);
    const q = new URLSearchParams(window.location.search);
    if (id) q.set("ed", id); else q.delete("ed");
    window.history.replaceState(null, "", `/editing${q.size ? `?${q}` : ""}`);
  };
  const key = ed ?? "all";
  return (
    <>
      {forFounder && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <div className="recess wseg" role="group" aria-label="View">
            <button type="button" className={view === "queue" ? "seg-on" : ""} aria-pressed={view === "queue"} onClick={() => setView("queue")}>Queue</button>
            <button type="button" className={view === "pipeline" ? "seg-on" : ""} aria-pressed={view === "pipeline"} onClick={() => setView("pipeline")}>Pipeline</button>
          </div>
          {createTask}
        </div>
      )}
      {view === "pipeline" && pipeline}
      <div hidden={view !== "queue"} style={{ display: view === "queue" ? "flex" : "none", flexDirection: "column", gap: 20 }}>
        {statsBy[key] && <EditorTiles s={statsBy[key]} showAi={!!aiBy[key]} />}
        <div className="unit" style={{ padding: "0 8px", marginTop: -8 }}>
          Private to the editor and the founders. No ad results here: performance depends on the script and the acting, not on the edit.
        </div>
        <div className="ed-layout">
          <EditQueue items={items} selectedId={current} editors={editors} ed={ed} pick={pick} forFounder={forFounder} onOpen={open} />
          <div style={{ minWidth: 0 }}>
            {v ? (
              <EditTask key={v.taskId} v={v} isFounder={forFounder} isEditor={!!isEditorId && v.production.editorId === isEditorId} editors={editorLoads} />
            ) : (
              <section className="card sec"><div className="info">{forFounder ? "Pick a video in the queue." : "Nothing assigned to you yet."}</div></section>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/** "My queue" (left): one card per video, its state, due day and its alert in red. Founders switch Editor A · B · All. */
export function EditQueue({
  items,
  selectedId,
  editors,
  ed,
  pick,
  forFounder,
  onOpen,
}: {
  items: QueueItem[];
  selectedId: string | null;
  editors: [string, string][];
  ed: string | null;
  pick: (id: string | null) => void;
  forFounder: boolean;
  /** Opens a video right here (no page load); the link still works in a new tab. */
  onOpen: (taskId: string) => void;
}) {
  const shown = ed ? items.filter((i) => i.editorId === ed) : items;
  return (
    <section className="tray ed-queue" aria-labelledby="h-queue">
      <div className="ed-qhead">
        <h2 id="h-queue">{forFounder ? "Queue" : "My queue"}</h2>
        <span className="lbl">Successors first</span>
      </div>
      {forFounder && editors.length > 0 && (
        <div className="recess wseg" role="group" aria-label="Editor" style={{ alignSelf: "flex-start" }}>
          {editors.map(([id, name]) => <button key={id} type="button" className={ed === id ? "seg-on" : ""} aria-pressed={ed === id} onClick={() => pick(id)}>{name}</button>)}
          <button type="button" className={!ed ? "seg-on" : ""} aria-pressed={!ed} onClick={() => pick(null)}>All</button>
        </div>
      )}
      {shown.length === 0 && <div className="info">{forFounder ? "No edit assigned yet. Assign one from a script in production." : "Nothing in your queue yet."}</div>}
      {shown.map((q) => (
        <Link
          key={q.taskId}
          href={`/editing?${ed ? `ed=${ed}&` : ""}task=${q.taskId}#edit-view`}
          scroll={false}
          prefetch={false}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
            e.preventDefault();
            onOpen(q.taskId);
          }}
          className={`qi ${q.taskId === selectedId ? "qi-on" : ""} ${q.dim ? "qi-dim" : ""}`}
          aria-current={q.taskId === selectedId ? "true" : undefined}
        >
          <span className="qi-top"><span className={`tag ${q.tone}`}><i aria-hidden="true" />{q.tag}</span><span className="mono unit">{q.due}</span></span>
          <span className="qi-title">{q.title}</span>
          <span className="unit">{q.sub}</span>
          {q.alert && <span className={`qi-alert ${q.alertTone === "amber" ? "qi-amber" : ""}`}><i aria-hidden="true" />{q.alert}</span>}
        </Link>
      ))}
    </section>
  );
}

export type EditView = {
  taskId: string;
  title: string; // face
  cellLine: string; // "MSB × Problem · Knee-Broad · UGC"
  state: EditState;
  rounds: EditRound[];
  production: Production;
  scriptUrl: string | null;
  hooks: { v: number; type: string; line: string; headline: string | null; name: string }[];
  generate: boolean;
  payPerVideo: number | null;
  editorName: string;
  card?: ProdCard;
  names?: LaunchNames;
};

/** Open task (right): steps, what she works from, Founder 2's changes, brief, hooks to deliver, Drive link + Submit vN. */
export function EditTask({ v, isFounder, isEditor, editors }: { v: EditView; isFounder: boolean; isEditor: boolean; editors: EditorLoad[] }) {
  const [url, setUrl] = useState("");
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pending, setPending] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // Keyboard focus follows the confirm step (the button pressed disappears).
  const backRef = useRef<HTMLButtonElement>(null);
  const approveRef = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);
  useEffect(() => {
    if (confirming) backRef.current?.focus();
    else if (wasConfirming.current) approveRef.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);
  const p = v.production;
  const last = v.rounds[v.rounds.length - 1];
  const now = v.state === "approved" && v.production.launchedAt ? 5 : editStepNow(v.state);
  const lastChanges = [...v.rounds].reverse().find((r) => r.decision === "changes");
  const nextRound = (last?.round ?? 0) + 1;
  const canSend = (isEditor || isFounder) && (v.state === "ready" || v.state === "editing" || v.state === "changes");
  const canReview = isFounder && v.state === "submitted" && !!last;
  const tag = EDIT_TAG[v.state];

  const run = (fn: () => Promise<{ ok?: string; error?: string }>) => {
    setPending(true);
    setMsg({});
    startTransition(async () => {
      try { setMsg(await fn()); } catch { setMsg({ error: "No connection: nothing was saved. Try again." }); } finally { setPending(false); }
    });
  };

  return (
    <section className="card tv" id="edit-view" aria-labelledby="ev-title">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div className="lbl">{v.cellLine}</div>
          <h2 id="ev-title" className="tv-title" style={{ margin: "8px 0 6px" }}>{v.title}</h2>
          <div className="sub">
            {v.rounds.length ? `Round ${v.state === "changes" ? nextRound : last?.round ?? 1}` : "Round 1"} · due {p.editDue ? fmtDay(p.editDue) : "—"}
            {isFounder ? ` · ${v.editorName}` : " · assigned by Founder 2"}
            {v.payPerVideo !== null && !isFounder ? ` · ${v.payPerVideo} TND when approved` : ""}
          </div>
        </div>
        <span className={`tag ${tag.tone}`}><i aria-hidden="true" />{tag.word(v.state === "changes" ? (last?.round ?? 1) : (last?.round ?? 0))}</span>
      </div>

      {msg.ok && <div className="notice notice-green" role="status">{msg.ok}</div>}

      <ol className="recess steps" aria-label="Progress">
        {EDIT_STEPS.map((s, i) => (
          <li key={s} className={`step ${i < now || (i === 3 && v.state === "submitted" && !!lastChanges) ? "st-done" : i === now ? "st-now" : ""}`} aria-current={i === now ? "step" : undefined}>
            {s === "SENT" && last ? `SENT V${v.state === "changes" ? last.round : last.round}` : s}
          </li>
        ))}
      </ol>

      <div>
        <h3 className="h3">What you work from</h3>
        <div className="tv-mat ed-mat">
          {isLink(v.scriptUrl) ? <a className="raise tv-mat-item ed-link" href={v.scriptUrl} target="_blank" rel="noopener noreferrer"><b>Script ↗</b><span className="unit">Google Doc</span></a> : <div className="raise tv-mat-item"><b>Script</b><span className="unit">no link</span></div>}
          {v.generate
            ? <div className="raise tv-mat-item"><b>AI / 3D</b><span className="unit">no footage: generate it</span></div>
            : isLink(p.footageUrl) ? <a className="raise tv-mat-item ed-link" href={p.footageUrl} target="_blank" rel="noopener noreferrer"><b>Raw footage ↗</b><span className="unit">Drive{p.footageAt ? ` · ${fmtDay(p.footageAt.slice(0, 10))}` : ""}</span></a> : <div className="raise tv-mat-item"><b>Raw footage</b><span className="unit">not in yet</span></div>}
          {last ? <a className="raise tv-mat-item ed-link" href={last.videoUrl} target="_blank" rel="noopener noreferrer"><b>{isEditor ? "My" : "Last"} v{last.round} ↗</b><span className="unit">{fmtWhen(last.submittedAt)}</span></a> : <div className="raise tv-mat-item"><b>{isEditor ? "My" : "Last"} version</b><span className="unit">none sent yet</span></div>}
        </div>
      </div>

      {v.state === "changes" && lastChanges && (
        <div className="tv-changes ed-changes">
          <div style={{ minWidth: 0 }}>
            <div className="lbl" style={{ color: "var(--red-ink)" }}>Changes for round {nextRound}</div>
            <div style={{ fontSize: 15, marginTop: 6 }}>{lastChanges.note ?? "See the Loom."}</div>
            <div className="unit" style={{ marginTop: 4 }}>{lastChanges.decidedBy ?? "Founder 2"}{lastChanges.decidedAt ? ` · ${fmtWhen(lastChanges.decidedAt)}` : ""}</div>
          </div>
          {lastChanges.loom && <a className="btn b-primary" href={lastChanges.loom} target="_blank" rel="noopener noreferrer">▶ Watch Loom</a>}
        </div>
      )}

      <div className="info" style={{ fontSize: 15 }}>
        <div className="lbl">Brief from Founder 2</div>
        <div style={{ marginTop: 6, lineHeight: 1.5, color: "var(--ink)" }}>{p.brief ?? "—"}</div>
        {p.reference && (isLink(p.reference) ? <a className="tap" href={p.reference} target="_blank" rel="noopener noreferrer">Reference ↗</a> : <div className="unit" style={{ marginTop: 6 }}>Reference: {p.reference}</div>)}
        {p.footageGap && <div className="formmsg err" style={{ marginTop: 8 }}>Missing in the footage: {p.footageGap}</div>}
        <div className="unit" style={{ marginTop: 8 }}>Gap in the footage? Find a match in the Drive or generate it with AI.</div>
      </div>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <h3 className="h3">Hooks to deliver · {v.generate ? "full AI / 3D video" : "full video"} + {v.hooks.length} hooks, subtitled</h3>
          <span className="lbl">Names ready to copy</span>
        </div>
        <div className="tray vtray">
          {v.hooks.length === 0 && <div className="tv-tried-empty">No hooks found for this script.</div>}
          {v.hooks.map((h) => (
            <div className="hk" key={h.v}>
              <span className="mono" style={{ fontWeight: 600, fontSize: 15 }}>V{h.v}</span>
              <span className="tag t-grey" style={{ justifyContent: "center" }}>{h.type}</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 14, fontWeight: 600 }}>{h.line}{h.headline ? <span className="unit"> · headline: {h.headline}</span> : null}</span>
                <span className="vname" style={{ display: "block", marginTop: 3 }}>{h.name}</span>
              </span>
              <CopyName text={h.name} />
            </div>
          ))}
        </div>
      </div>

      {isEditor && v.state === "ready" && (
        <div className="acts" style={{ justifyContent: "space-between" }}>
          <span className="unit">Tell Founder 2 you started: the task moves to Editing.</span>
          <button type="button" className="btn b-ghost" disabled={pending} onClick={() => run(() => startEdit(v.taskId))}>Start editing</button>
        </div>
      )}

      {canSend && (
        <form className="ed-send" onSubmit={(e) => { e.preventDefault(); run(() => submitEdit(v.taskId, url)); }}>
          <label className="field" style={{ flex: "1 1 320px" }}>
            <span className="lbl">Drive link to v{nextRound}</span>
            <input className="inp" type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://drive.google.com/…" maxLength={1000} />
          </label>
          <button type="submit" className="btn b-primary" style={{ height: 50, alignSelf: "flex-end" }} disabled={pending}>{pending ? "Sending…" : `Submit v${nextRound} for review`}</button>
        </form>
      )}
      {v.state === "submitted" && !isFounder && <div className="info">v{last?.round} sent {last ? fmtWhen(last.submittedAt) : ""} · waiting for Founder 2’s review.</div>}
      {v.state === "approved" && (
        <div className="notice notice-green" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span>
            Approved{last?.decidedAt ? ` ${fmtWhen(last.decidedAt)}` : ""}. Counted for payment.{" "}
            {p.liveAt ? `Live since ${fmtWhen(p.liveAt)}.` : p.launchedAt ? `Launched ${fmtWhen(p.launchedAt)}. Turns Live once Meta is connected (phase 3); use Mark live until then.` : "Launch is next."}
          </span>
          {isFounder && v.card && (
            <LaunchButton card={v.card} names={v.names} current={p} approvedAt={last?.decidedAt} label={p.launchedAt ? "Launch list" : "Launch"} who="Founder · Launch" className={p.launchedAt ? "btn b-ghost" : "btn b-primary"} onDone={(m) => setMsg({ ok: m })} />
          )}
        </div>
      )}

      {canReview && (
        <div className="ed-review">
          <div style={{ flex: "1 1 300px" }}>
            <div className="lbl">Founder · on v{last.round}</div>
            <div className="unit" style={{ marginTop: 6 }}>Approve = you upload the final to Drive; launching comes next.</div>
          </div>
          <a className="btn b-ghost" href={last.videoUrl} target="_blank" rel="noopener noreferrer">Open v{last.round} ↗</a>
          {confirming ? (
            <>
              <span className="formmsg" role="status">Approve v{last.round}? It can’t be undone and counts for payment.</span>
              <button ref={backRef} type="button" className="btn b-ghost" disabled={pending} onClick={() => setConfirming(false)}>Back</button>
              <button type="button" className="btn b-green" disabled={pending} onClick={() => run(() => reviewEdit(v.taskId, last.round, "approved", "", ""))}>{pending ? "Saving…" : "Yes, approve"}</button>
            </>
          ) : (
            <>
              <button ref={approveRef} type="button" className="btn b-green" disabled={pending} onClick={() => setConfirming(true)}>Approve</button>
              <button type="button" className="btn b-red" disabled={pending} onClick={() => setChangesOpen(true)}>Needs changes</button>
            </>
          )}
        </div>
      )}
      {isFounder && v.card && v.state !== "approved" && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <AssignButton card={v.card} editors={editors} current={p} who="Founder · Assign" label="Change assignment" className="btn b-ghost" onDone={(m) => setMsg({ ok: m })} />
        </div>
      )}
      {msg.error && <span className="formmsg err" role="alert">{msg.error}</span>}

      <div>
        <h3 className="h3">History</h3>
        <div className="hist-list">
          {[...v.rounds].reverse().map((r) => (
            <div className="hist" key={r.round}>
              <span className="mono unit">{fmtWhen(r.submittedAt)}</span>
              <span>v{r.round} sent{r.decision ? ` · ${r.decision === "approved" ? "approved" : "needs changes"}` : " · in review"}{r.note ? ` · ${r.note}` : ""}</span>
              {r.loom ? <a className="tap" href={r.loom} target="_blank" rel="noopener noreferrer">Loom ↗</a> : <span />}
            </div>
          ))}
          {p.editStartedAt && <div className="hist"><span className="mono unit">{fmtWhen(p.editStartedAt)}</span><span>Started editing</span><span /></div>}
          {p.assignedAt && <div className="hist"><span className="mono unit">{fmtWhen(p.assignedAt)}</span><span>Assigned</span><span /></div>}
          {p.footageAt && <div className="hist"><span className="mono unit">{fmtWhen(p.footageAt)}</span><span>Footage received from the agency</span><span /></div>}
        </div>
      </div>

      {canReview && (
        <NeedsChanges
          open={changesOpen}
          onClose={() => setChangesOpen(false)}
          title={`Needs changes · ${v.title} v${last.round}`}
          round={last.round}
          kind="EDIT"
          to="the editor"
          where="her queue"
          onSend={async (loom, note) => {
            const res = await reviewEdit(v.taskId, last.round, "changes", loom, note);
            if (res.ok) setMsg(res);
            return res;
          }}
        />
      )}
    </section>
  );
}
