"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { Modal } from "./Modal";
import { propose, decide, type ProposeState } from "@/app/proposals/actions";
import { AWARENESS, shortAwareness, type Pickers, type Proposal } from "@/lib/proposals-shared";
import type { NeedGroup } from "@/lib/needs";

const empty: ProposeState = {};
const NEW = "__new__";

function Msg({ s }: { s: ProposeState }) {
  if (s.error) return <span className="formmsg err" role="alert">{s.error}</span>;
  if (s.ok) return <span className="formmsg ok" role="status">{s.ok}</span>;
  return null;
}

/** "+ Propose a test" → Propose pop-up (Pop-ups artboard). */
export function ProposeButton({ pickers, label = "+ Propose a test", className = "add", sendTo = "Founder 1" }: { pickers: Pickers; label?: string; className?: string; sendTo?: string }) {
  const [openedAt, setOpenedAt] = useState<number | null>(null);
  const [state, action, pending] = useActionState(propose, empty);
  const [angle, setAngle] = useState("");
  // Open until a save succeeds after it was opened (the message then shows next to the button).
  const open = openedAt !== null && !(state.ok && (state.at ?? 0) > openedAt);
  const setOpen = (v: boolean) => {
    setOpenedAt(v ? Date.now() : null);
    if (v) setAngle("");
  };
  const shownError = state.error && (state.at ?? 0) > (openedAt ?? 0) ? state : {};

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => action(fd));
  };

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>{label}</button>
      {state.ok && !open && <span className="formmsg ok" role="status" style={{ marginLeft: 12 }}>{state.ok}</span>}
      <Modal open={open} onClose={() => setOpen(false)} who={`Copywriter · “+ Propose” on the map or in a cell`} title="Propose a test">
        <form key={openedAt ?? 0} onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="row2">
            <label className="field">
              <span className="lbl">Avatar</span>
              <select className="inp" name="avatar_id" required defaultValue="">
                <option value="" disabled>Choose…</option>
                {pickers.avatars.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="lbl">Awareness</span>
              <select className="inp" name="awareness" required defaultValue="">
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
          <div className="info">Goes to {sendTo} as a DECIDE item. The answer comes back to your inbox.</div>
          <div className="acts">
            <Msg s={shownError} />
            <button type="button" className="btn b-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" className="btn b-primary" disabled={pending}>{pending ? "Sending…" : `Send to ${sendTo}`}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}

/** Decide pop-up (Pop-ups artboard, DECIDE item). */
function DecideModal({ p, open, onClose, who = "Founder 1 · DECIDE item" }: { p: Proposal; open: boolean; onClose: () => void; who?: string }) {
  const [state, action, pending] = useActionState(decide, empty);
  const [answer, setAnswer] = useState(p.answer ?? "");
  const [track, setTrack] = useState("knee");

  const send = (decision: "approved" | "on_hold" | "rejected") => {
    const fd = new FormData();
    fd.set("id", p.id);
    fd.set("decision", decision);
    fd.set("answer", answer);
    fd.set("track", track);
    startTransition(() => action(fd));
  };
  const [openedAt] = useState(() => Date.now());
  const shown = open && !(state.ok && (state.at ?? 0) > openedAt);

  const needAnswer = answer.trim().length === 0;
  return (
    <Modal open={shown} onClose={onClose} who={who} title={`Proposal from ${p.proposedBy}`}>
      <span className={`tag ${p.isNewAngle ? "t-violet" : "t-grey"}`} style={{ alignSelf: "flex-start" }}><i aria-hidden="true" />{p.isNewAngle ? "NEW ANGLE" : "TEST IN A CELL"}</span>
      <div className="row2">
        <div className="field"><span className="lbl">Cell</span><div className="inp inp-ro">{p.avatarCode} × {shortAwareness(p.awareness)}</div></div>
        <div className="field"><span className="lbl">Angle</span><div className="inp inp-ro">{p.angle}</div></div>
      </div>
      <div className="info"><b style={{ color: "var(--ink)" }}>Why (her words):</b> {p.why}</div>
      {p.isNewAngle && (
        <label className="field">
          <span className="lbl">Track for the new angle</span>
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
        <Msg s={state.error ? state : {}} />
        <button type="button" className="btn b-ghost" disabled={pending || needAnswer} title={needAnswer ? "Write an answer first" : undefined} onClick={() => send("on_hold")}>On hold</button>
        <button type="button" className="btn b-red" disabled={pending || needAnswer} title={needAnswer ? "Write an answer first" : undefined} onClick={() => send("rejected")}>Reject</button>
        <button type="button" className="btn b-primary" disabled={pending} onClick={() => send("approved")}>{pending ? "Saving…" : "Approve"}</button>
      </div>
    </Modal>
  );
}

/** Needs me list (Founder Homes): one list, most urgent first, one button per line. */
export function NeedsMe({ groups, total }: { groups: NeedGroup[]; total: number }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 18 }} aria-labelledby="h-needs">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 8px", gap: 12, flexWrap: "wrap" }}>
        <h2 id="h-needs" style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: "-.02em", display: "flex", alignItems: "center", gap: 10 }}>
          Needs me <span className={total ? "count-red" : "count-grey"}>{total}</span>
        </h2>
        <div className="lbl">Most urgent first</div>
      </div>
      {groups.length === 0 && <div className="info">Nothing needs you right now.</div>}
      {groups.map((g) => (
        <div key={g.name}>
          <div className={`lane l-${g.tone}`}><i aria-hidden="true" />{g.name}<span style={{ color: "#8c8c86", fontWeight: 500 }}>· {g.items.length}</span></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {g.items.map((it) => (
              <div className="need" key={it.key}>
                <div><span className={`tag t-${it.tagTone}`}><i aria-hidden="true" />{it.type}</span></div>
                <div style={{ minWidth: 0 }}>
                  <div className="need-title">{it.title}</div>
                  <div className="need-sub">{it.sub}</div>
                </div>
                <div className={`age a-${it.ageTone}`}>{it.age}</div>
                <button type="button" className={`btn ${it.type === "COVERING" ? "b-ghost" : "b-primary"}`} onClick={() => setOpenId(it.key)}>Approve / Reject</button>
                <DecideModal p={it.proposal} open={openId === it.key} onClose={() => setOpenId(null)} who={it.type === "COVERING" ? "Founder 2 · covering Founder 1’s DECIDE item" : "Founder 1 · DECIDE item"} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

/** Proposals list: a copywriter sees her own with the founder's answers; founders see all. */
export function ProposalList({ proposals, showAuthor }: { proposals: Proposal[]; showAuthor: boolean }) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (!proposals.length) return <div className="info">No proposals yet.</div>;
  const tone = { waiting: "t-violet", approved: "t-green", on_hold: "t-amber", rejected: "t-red" } as const;
  const word = { waiting: "WAITING", approved: "APPROVED", on_hold: "ON HOLD", rejected: "REJECTED" } as const;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {proposals.map((p) => (
        <div className="row" key={p.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span className={`tag ${tone[p.status]}`}><i aria-hidden="true" />{word[p.status]}</span>
            <b style={{ fontSize: 15 }}>{p.isNewAngle ? `New angle: ${p.angle}` : `Test: ${p.angle}`}</b>
            <span className="tag t-grey">{p.avatarCode} × {shortAwareness(p.awareness)}</span>
            {showAuthor && <span className="unit">by {p.proposedBy}</span>}
          </div>
          <div className="sub">{p.why}</div>
          {p.answer && <div className="info"><b style={{ color: "var(--ink)" }}>{p.decidedBy ?? "Founder"}:</b> {p.answer}</div>}
          {showAuthor && p.status === "on_hold" && (
            <div>
              <button type="button" className="btn b-ghost" onClick={() => setOpenId(p.id)}>Decide again</button>
              <DecideModal p={p} open={openId === p.id} onClose={() => setOpenId(null)} who="Founder · proposal on hold" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
