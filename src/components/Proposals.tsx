"use client";

import { F } from "./FounderNames";
import Link from "next/link";
import { startTransition, useActionState, useState, type FormEvent } from "react";
import { Modal } from "./Modal";
import { propose, decide, type ProposeState } from "@/app/proposals/actions";
import { AWARENESS, shortAwareness, type Pickers, type Proposal } from "@/lib/proposals-shared";
import type { NeedGroup, NeedItem } from "@/lib/needs";
import { PauseInMeta, TagOldAd } from "./OldAd";
import { WinnerModal } from "./Winner";
import type { EditorLoad, ProdCard, Production } from "@/lib/tasks-shared";
import { AssignButton, FootageButton, LaunchButton } from "./Production";
import type { CreateTaskContext } from "@/lib/tasks-shared";
import { CreateTaskButton } from "./Tasks";
import { TestimonialButton } from "./Testimonial";

const empty: ProposeState = {};
const NEW = "__new__";

function Msg({ s }: { s: ProposeState }) {
  if (s.error) return <span className="formmsg err" role="alert">{s.error}</span>;
  if (s.ok) return <span className="formmsg ok" role="status">{s.ok}</span>;
  return null;
}

/** "+ Propose a test" → Propose pop-up (Pop-ups artboard). */
export function ProposeButton({ pickers, label = "+ Propose a test", className = "add", sendTo = "Founder 1", prefill, autoOpen = false, onClose }: {
  pickers: Pickers; label?: string; className?: string; sendTo?: string;
  /** From a map cell: the cell's avatar and awareness are pre-picked. */
  prefill?: { avatarId: string; awareness: string };
  /** Opened by a click on an empty map cell: no trigger button, the pop-up shows at once. */
  autoOpen?: boolean;
  onClose?: () => void;
}) {
  const [openedAt, setOpenedAt] = useState<number | null>(autoOpen ? 0 : null);
  const [state, action, pending] = useActionState(propose, empty);
  const [angle, setAngle] = useState("");
  // Open until a save succeeds after it was opened (the message then shows next to the button).
  const open = openedAt !== null && !(state.ok && (state.at ?? 0) > openedAt);
  const setOpen = (v: boolean) => {
    setOpenedAt(v ? Date.now() : null);
    if (v) setAngle("");
    else onClose?.();
  };
  const shownError = state.error && (state.at ?? 0) > (openedAt ?? 0) ? state : {};

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => action(fd));
  };

  return (
    <>
      {!autoOpen && <button type="button" className={className} onClick={() => setOpen(true)}>{label}</button>}
      {state.ok && !open && <span className="formmsg ok" role="status" style={{ marginLeft: autoOpen ? 0 : 12 }}>{state.ok}</span>}
      <Modal open={open} onClose={() => setOpen(false)} who={`Copywriter · “+ Propose” on the map or in a cell`} title="Propose a test">
        <form key={openedAt ?? 0} onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="row2">
            <label className="field">
              <span className="lbl">Avatar</span>
              <select className="inp" name="avatar_id" required defaultValue={prefill && pickers.avatars.some((a) => a.id === prefill.avatarId) ? prefill.avatarId : ""}>
                <option value="" disabled>Choose…</option>
                {pickers.avatars.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="lbl">Awareness</span>
              <select className="inp" name="awareness" required defaultValue={prefill?.awareness ?? ""}>
                <option value="" disabled>Choose…</option>
                {AWARENESS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
          </div>
          <label className="field">
            <span className="lbl">Angle</span>
            <select className="inp" name="angle_id" required value={angle} onChange={(e) => setAngle(e.target.value)}>
              <option value="" disabled>Choose…</option>
              {pickers.angles.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              <option value={NEW}>+ New angle…</option>
            </select>
          </label>
          {angle === NEW && (
            <label className="field">
              <span className="lbl">New angle name</span>
              <input className="inp" name="new_angle_name" required minLength={2} maxLength={80} placeholder="e.g. Surgery date is set" />
              <span className="unit">In ad names it is written with dashes, e.g. Surgery-Date-Is-Set.</span>
            </label>
          )}
          <label className="field">
            <span className="lbl">Why · one line</span>
            <textarea className="ta" name="why" required minLength={3} maxLength={500} rows={2} />
          </label>
          <label className="field">
            <span className="lbl">Format idea · optional</span>
            <select className="inp" name="format_id" defaultValue="">
              <option value="">No idea yet</option>
              {pickers.formats.map((f) => <option key={f.id} value={f.id}>{f.code === "AI" ? "AI / 3D (Generate, no shoot)" : f.label}</option>)}
            </select>
          </label>
          <div className="info">Goes to <F>{sendTo}</F> as a DECIDE item. The answer comes back to your inbox.</div>
          <div className="acts">
            <Msg s={shownError} />
            <button type="button" className="btn b-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" className="btn b-primary" disabled={pending}>{pending ? "Sending…" : <F>{`Send to ${sendTo}`}</F>}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}

/** Decide pop-up (Pop-ups artboard, DECIDE item). Calls the server directly so it can close and confirm. */
function DecideModal({ p, open, onClose, onDone, who = "Founder 1 · DECIDE item" }: { p: Proposal; open: boolean; onClose: () => void; onDone: (msg: string) => void; who?: string }) {
  const [answer, setAnswer] = useState(p.answer ?? "");
  const [track, setTrack] = useState("knee");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const close = () => { setError(""); onClose(); };
  const send = (decision: "approved" | "on_hold" | "rejected") => {
    const fd = new FormData();
    fd.set("id", p.id);
    fd.set("decision", decision);
    fd.set("answer", answer);
    fd.set("track", track);
    fd.set("expected", p.status);
    setPending(true);
    setError("");
    startTransition(async () => {
      try {
        const res = await decide(empty, fd);
        if (res.ok) { onDone(res.ok); onClose(); }
        else setError(res.error ?? "Not saved.");
      } catch {
        setError("No connection: nothing was saved. Try again.");
      } finally {
        setPending(false);
      }
    });
  };

  const needAnswer = answer.trim().length === 0;
  return (
    <Modal open={open} onClose={close} who={who} title={`Proposal from ${p.proposedBy}`}>
      <span className={`tag ${p.isNewAngle ? "t-violet" : "t-grey"}`} style={{ alignSelf: "flex-start" }}><i aria-hidden="true" />{p.isNewAngle ? "NEW ANGLE" : "TEST IN A CELL"}</span>
      <div className="row2">
        <div className="field"><span className="lbl">Cell</span><div className="inp inp-ro">{p.avatarCode} × {shortAwareness(p.awareness)}</div></div>
        <div className="field"><span className="lbl">Angle</span><div className="inp inp-ro">{p.angle}</div></div>
      </div>
      <div className="info"><b style={{ color: "var(--ink)" }}>Why (her words):</b> {p.why}</div>
      {p.isNewAngle && (
        <label className="field">
          <span className="lbl">Track for the new angle · used if you approve</span>
          <select className="inp" value={track} onChange={(e) => setTrack(e.target.value)}>
            <option value="knee">Knee</option>
            <option value="hips">Hips</option>
            <option value="both">Both</option>
          </select>
        </label>
      )}
      {p.format && <div className="info"><b style={{ color: "var(--ink)" }}>Format idea:</b> {p.format}</div>}
      <div className="info">Cell results appear here once Meta is connected (phase 3).</div>
      <label className="field">
        <span className="lbl">Answer to her · required for on hold or reject</span>
        <textarea className="ta" rows={2} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Go ahead, use the moment as the opening." />
      </label>
      <div className="acts">
        {error && <span className="formmsg err" role="alert">{error}</span>}
        <button type="button" className="btn b-ghost" disabled={pending || needAnswer} title={needAnswer ? "Write an answer first" : undefined} onClick={() => send("on_hold")}>On hold</button>
        <button type="button" className="btn b-red" disabled={pending || needAnswer} title={needAnswer ? "Write an answer first" : undefined} onClick={() => send("rejected")}>Reject</button>
        <button type="button" className="btn b-primary" disabled={pending} onClick={() => send("approved")}>{pending ? "Saving…" : "Approve"}</button>
      </div>
    </Modal>
  );
}

/** Needs me list (Founder Homes): one list, most urgent first, one button per line. */
export function NeedsMe({
  groups: mine,
  total: mineTotal,
  editors = [],
  allGroups,
  pickers,
  tagPickers,
  createCtx,
}: {
  /** WINNER pop-up shows the angle's current core message; ALERT opens Create task. */
  createCtx?: CreateTaskContext | null;
  /** Tag an old ad (UNMAPPED): every approved format, statics included. */
  tagPickers?: Pickers;
  groups: NeedGroup[];
  total: number;
  editors?: EditorLoad[];
  /** For the Testimonial tag pop-up (avatars, angles). */
  pickers?: Pickers;
  /** Both founders' items (Mine | All switch, Founder Home artboard). */
  allGroups?: NeedGroup[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState("");
  const [showAll, setShowAll] = useState(false);
  // Assign after tagging a testimonial: held here because the TESTIMONIAL row disappears once it is used.
  const [assign, setAssign] = useState<{ card: ProdCard; current: Production } | null>(null);
  const [meta, setMeta] = useState<NeedItem | null>(null);
  const groups = showAll && allGroups ? allGroups : mine;
  // "Start with the most urgent" (Home header) opens the founder's own first item, even when All is shown.
  const mineKeys = new Set(mine.flatMap((g) => g.items.map((i) => i.key)));
  const total = showAll && allGroups ? allGroups.reduce((n, g) => n + g.items.length, 0) : mineTotal;
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 18 }} aria-labelledby="h-needs">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 8px", gap: 12, flexWrap: "wrap" }}>
        <h2 id="h-needs" style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: "-.02em", display: "flex", alignItems: "center", gap: 10 }}>
          Needs me <span className={total ? "count-red" : "count-grey"}>{total}</span>
        </h2>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          {allGroups && (
            <div className="recess wseg" role="group" aria-label="Whose items">
              <button type="button" className={!showAll ? "seg-on" : ""} aria-pressed={!showAll} onClick={() => setShowAll(false)}>Mine</button>
              <button type="button" className={showAll ? "seg-on" : ""} aria-pressed={showAll} onClick={() => setShowAll(true)}>All</button>
            </div>
          )}
          <div className="lbl">Most urgent first</div>
        </div>
      </div>
      {doneMsg && <div className="notice notice-green" role="status">{doneMsg}</div>}
      {assign && <AssignButton key={assign.card.taskId} startOpen card={assign.card} editors={editors} current={assign.current} who="Founder 2 · Assign" onClose={() => setAssign(null)} onDone={setDoneMsg} />}
      {meta?.kill && <PauseInMeta key={meta.key} adId={meta.kill.adId} name={meta.kill.name} flag={meta.kill.flag} reason={meta.kill.reason} note={meta.kill.recheck} who={meta.type === "COVERING" ? "Founder 1 · covering Founder 2’s KILL item" : "Founder 2 · KILL item · act in Meta"} onClose={() => setMeta(null)} onDone={setDoneMsg} />}
      {meta?.winner && <WinnerModal key={meta.key} w={meta.winner} current={createCtx?.angles.find((a) => a.id === meta.winner!.angleId)?.coreMessage ?? null} who={meta.type === "COVERING" ? "Founder 2 · covering Founder 1’s WINNER item" : "Founder 1 · WINNER item"} onClose={() => setMeta(null)} onDone={setDoneMsg} />}
      {meta?.unmapped && tagPickers && <TagOldAd key={meta.key} base={meta.unmapped.base} example={meta.unmapped.example} guess={meta.unmapped.formatGuess} pickers={tagPickers} onClose={() => setMeta(null)} onDone={setDoneMsg} />}
      {groups.length === 0 && <div className="info">{showAll ? "Nothing needs either founder right now." : "Nothing needs you right now."}</div>}
      {groups.map((g) => (
        <div key={g.name}>
          <div className={`lane l-${g.tone}`}><i aria-hidden="true" />{g.name}<span style={{ color: "#8c8c86", fontWeight: 500 }}>· {g.items.length}</span></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {g.items.map((it) => (
              <div className="need" key={it.key} data-mine={mineKeys.has(it.key) ? "" : undefined}>
                <div><span className={`tag t-${it.tagTone}`}><i aria-hidden="true" />{it.type}</span></div>
                <div style={{ minWidth: 0 }}>
                  <div className="need-title">{it.title}</div>
                  <div className="need-sub"><F>{it.sub}</F></div>
                </div>
                <div className={`age a-${it.ageTone}`}>{it.age}</div>
                {it.winner ? (
                  <button type="button" className={`btn ${it.type === "COVERING" ? "b-ghost" : "b-primary"}`} onClick={() => setMeta(it)}>Core message</button>
                ) : it.alert && createCtx && pickers ? (
                  <CreateTaskButton ctx={createCtx} pickers={pickers} className={`btn ${it.type === "COVERING" ? "b-ghost" : "b-primary"}`} label="Create successor"
                    prefill={{ proposalId: null, successor: true, successorOf: it.alert.taskId, avatarId: it.alert.avatarId ?? "", awareness: it.alert.awareness, angleId: it.alert.angleId, formatId: null, reference: it.alert.reference ?? it.alert.face, label: `successor · ${it.alert.avatarCode} × ${shortAwareness(it.alert.awareness)} · ${it.alert.angle}` }} />
                ) : it.kill ? (
                  <button type="button" className={`btn ${it.type === "COVERING" ? "b-ghost" : "b-primary"}`} onClick={() => setMeta(it)}>Pause in Meta</button>
                ) : it.unmapped ? (
                  tagPickers ? <button type="button" className="btn b-primary" onClick={() => setMeta(it)}>Tag</button> : null
                ) : it.prod ? (
                  it.prod.kind === "launch"
                    ? <LaunchButton card={it.prod.card} names={it.prod.names} current={it.prod.current} approvedAt={it.prod.approvedAt} label="Open launch list" who={it.type === "COVERING" ? "Founder 1 · covering Founder 2’s LAUNCH item" : "Founder 2 · LAUNCH item"} className={`btn ${it.type === "COVERING" ? "b-ghost" : "b-primary"}`} onDone={setDoneMsg} />
                    : it.prod.kind === "footage"
                    ? <FootageButton card={it.prod.card} who={it.type === "COVERING" ? "Founder 1 · covering Founder 2’s FOOTAGE item" : "Founder 2 · FOOTAGE item"} className={`btn ${it.type === "COVERING" ? "b-ghost" : "b-primary"}`} onDone={setDoneMsg} />
                    : <AssignButton card={it.prod.card} editors={editors} current={it.prod.current} who={it.type === "COVERING" ? "Founder 1 · covering Founder 2’s ASSIGN item" : "Founder 2 · ASSIGN item"} className={`btn ${it.type === "COVERING" ? "b-ghost" : "b-primary"}`} onDone={setDoneMsg} />
                ) : it.testimonial && pickers ? (
                  <TestimonialButton item={it.testimonial} pickers={pickers} editors={editors} label="Tag testimonial" who={it.type === "COVERING" ? "Founder 1 · covering Founder 2’s TESTIMONIAL item" : "Founder 2 · TESTIMONIAL item"} className={`btn ${it.type === "COVERING" ? "b-ghost" : "b-primary"}`} onDone={setDoneMsg} onCreated={(card, current) => setAssign({ card, current })} />
                ) : it.href ? (
                  <Link href={it.href} prefetch={true} className={`btn ${it.type === "COVERING" || it.type === "OVERDUE" ? "b-ghost" : "b-primary"}`}>{it.type === "OVERDUE" ? "See task" : "Open review"}</Link>
                ) : it.proposal ? (
                  <>
                    <button type="button" className={`btn ${it.type === "COVERING" ? "b-ghost" : "b-primary"}`} onClick={() => setOpenId(it.key)}>Approve / Reject</button>
                    <DecideModal p={it.proposal} open={openId === it.key} onClose={() => setOpenId(null)} onDone={setDoneMsg} who={it.type === "COVERING" ? "Founder 2 · covering Founder 1’s DECIDE item" : "Founder 1 · DECIDE item"} />
                  </>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

/** Proposals list: a copywriter sees her own with the founder's answers; founders see all. */
export function ProposalList({ proposals, showAuthor, taskCtx }: { proposals: Proposal[]; showAuthor: boolean; taskCtx?: { ctx: CreateTaskContext; pickers: Pickers } }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState("");
  if (!proposals.length) return <div className="info">No proposals yet.</div>;
  const tone = { waiting: "t-violet", approved: "t-green", on_hold: "t-amber", rejected: "t-red" } as const;
  const word = { waiting: "WAITING", approved: "APPROVED", on_hold: "ON HOLD", rejected: "REJECTED" } as const;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {doneMsg && <div className="notice notice-green" role="status">{doneMsg}</div>}
      {proposals.map((p) => (
        <div className="row" key={p.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span className={`tag ${tone[p.status]}`}><i aria-hidden="true" />{word[p.status]}</span>
            <b style={{ fontSize: 15 }}>{p.isNewAngle ? `New angle: ${p.angle}` : `Test: ${p.angle}`}</b>
            <span className="tag t-grey">{p.avatarCode} × {shortAwareness(p.awareness)}</span>
            {showAuthor && <span className="unit">by {p.proposedBy}</span>}
            {p.status === "approved" && p.hasTask && <span className="tag t-blue"><i aria-hidden="true" />TASK CREATED</span>}
          </div>
          <div className="sub">{p.why}</div>
          {p.answer && <div className="info"><b style={{ color: "var(--ink)" }}>{p.decidedBy ?? "Founder"}:</b> {p.answer}</div>}
          {taskCtx && p.status === "approved" && !p.hasTask && p.angleId && (
            <div>
              <CreateTaskButton
                ctx={taskCtx.ctx}
                pickers={taskCtx.pickers}
                className="btn b-primary"
                label="Create task"
                prefill={{ proposalId: p.id, avatarId: p.avatarId, awareness: p.awareness, angleId: p.angleId, formatId: p.formatId, label: `${p.angle} · ${p.avatarCode} × ${shortAwareness(p.awareness)}` }}
              />
            </div>
          )}
          {showAuthor && p.status === "on_hold" && (
            <div>
              <button type="button" className="btn b-ghost" onClick={() => setOpenId(p.id)}>Decide again</button>
              <DecideModal p={p} open={openId === p.id} onClose={() => setOpenId(null)} onDone={setDoneMsg} who="Founder · proposal on hold" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
