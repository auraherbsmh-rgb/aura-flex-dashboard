"use client";

import { startTransition, useState } from "react";
import { Modal } from "./Modal";
import { AssignButton } from "./Production";
import { addTestimonial, tagTestimonial, testimonialNotUsable } from "@/app/tasks/actions";
import { toConceptTag } from "@/lib/parse";
import { fmtWhen, type EditorLoad, type ProdCard, type TestimonialLite } from "@/lib/tasks-shared";
import type { Pickers } from "@/lib/proposals-shared";

const AWARENESS = ["Problem-Aware", "Solution-Aware", "Product-Aware", "Most-Aware"];

/**
 * Testimonial tag pop-up (handoff §6b, Pop-ups artboard, TESTIMONIAL item). Founder decision Oct 16: Founder 2 adds the
 * support-call recording himself. Tag it (avatar, awareness, angle, customer first name = concept tag, brief, hooks) →
 * UGC edit task with the testimonial flag, skipping script and shoot → Assign. "Not usable" discards a waiting one;
 * "Save for later" keeps a new one as a TESTIMONIAL item.
 */
export function TestimonialButton({
  pickers,
  editors,
  item,
  label = "+ Testimonial",
  className = "add",
  who = "Founder 2 · TESTIMONIAL item",
  onDone,
}: {
  pickers: Pickers;
  editors: EditorLoad[];
  /** A waiting recording (TESTIMONIAL item); none = a new one. */
  item?: TestimonialLite;
  label?: string;
  className?: string;
  who?: string;
  onDone?: (msg: string) => void;
}) {
  const blank = () => ({ url: "", note: "", avatarId: "", awareness: "", angleId: "", face: "", brief: "", hooks: 3 });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(blank);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  // After "Create edit task": the Assign pop-up opens for the new task.
  const [assign, setAssign] = useState<ProdCard | null>(null);
  const [msg, setMsg] = useState("");

  const tag = toConceptTag(f.face);
  const avatar = pickers.avatars.find((a) => a.id === f.avatarId);
  const angle = pickers.angles.find((a) => a.id === f.angleId);
  const base = `UGC_${avatar?.code ?? "Avatar"}_${f.awareness || "Awareness"}_${angle?.code ?? "Angle"}_${tag || "Name"}`;
  const missing = [
    !item && !f.url.trim() ? "recording link" : "",
    !f.avatarId ? "avatar" : "",
    !f.awareness ? "awareness" : "",
    !f.angleId ? "angle" : "",
    !tag ? "first name" : "",
    f.brief.trim().length < 3 ? "brief" : "",
  ].filter(Boolean);

  const say = (m: string) => { setMsg(m); onDone?.(m); };
  const run = (fn: () => Promise<{ ok?: string; error?: string; taskId?: string }>, after: (r: { ok?: string; taskId?: string }) => void) => {
    setPending(true);
    setError("");
    startTransition(async () => {
      try {
        const r = await fn();
        if (r.ok) after(r);
        else setError(r.error ?? "Not saved.");
      } catch {
        setError("No connection: nothing was saved. Try again.");
      } finally {
        setPending(false);
      }
    });
  };
  const create = () =>
    run(() => tagTestimonial({ id: item?.id ?? null, url: f.url, note: f.note, avatarId: f.avatarId, awareness: f.awareness, angleId: f.angleId, face: f.face, brief: f.brief, hooks: f.hooks }), (r) => {
      setOpen(false);
      say(r.ok!);
      if (r.taskId) {
        setAssign({
          taskId: r.taskId, face: f.face.trim() || tag, cell: `${avatar?.code ?? "?"} × ${f.awareness.replace("-Aware", "")}`, angle: angle?.label ?? "", format: "UGC · Testimonial",
          copywriter: "a support call", shootOn: null, generate: false, vo: false, testimonial: true, hooks: f.hooks, confirmedAt: new Date().toISOString(),
        });
      }
    });

  return (
    <>
      <button type="button" className={className} onClick={() => { setF(blank()); setError(""); setReason(""); setRejecting(false); setMsg(""); setOpen(true); }}>{label}</button>
      {msg && !item && <span className="formmsg" role="status" style={{ marginLeft: 10 }}>{msg}</span>}
      {assign && <AssignButton key={assign.taskId} startOpen card={assign} editors={editors} current={{ taskId: assign.taskId, footageUrl: null, allHooksShot: true, footageGap: null, footageAt: assign.confirmedAt, editorId: null, editorName: null, editDue: null, brief: f.brief.trim(), reference: null, assignedAt: null, editStartedAt: null, finalUrl: null, launchedAt: null, liveAt: null, liveSource: null }} who="Founder 2 · Assign" onClose={() => setAssign(null)} onDone={say} />}
      <Modal open={open} onClose={() => setOpen(false)} who={item ? who : "Founder · new testimonial"} title={item ? "Tag this testimonial" : "New testimonial"} width={620}>
        {item ? (
          <div className="copy">
            <span>▶ Support call · {fmtWhen(item.addedAt)}{item.note ? ` · ${item.note}` : ""}</span>
            <a className="tap" href={item.url} target="_blank" rel="noopener noreferrer">Listen ↗</a>
          </div>
        ) : (
          <div className="row2">
            <label className="field">
              <span className="lbl">Recording · link ●</span>
              <input className={`inp ${!f.url.trim() ? "fi-miss" : ""}`} type="url" value={f.url} maxLength={1000} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://drive.google.com/…" />
            </label>
            <label className="field">
              <span className="lbl">Note · optional</span>
              <input className="inp" value={f.note} maxLength={300} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="repeat buyer, 2 min" />
            </label>
          </div>
        )}
        <div className="row2">
          <label className="field">
            <span className="lbl">Avatar ●</span>
            <select className={`inp ${!f.avatarId ? "fi-miss" : ""}`} value={f.avatarId} onChange={(e) => setF({ ...f, avatarId: e.target.value })}>
              <option value="">Choose…</option>
              {pickers.avatars.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="lbl">Awareness ●</span>
            <select className={`inp ${!f.awareness ? "fi-miss" : ""}`} value={f.awareness} onChange={(e) => setF({ ...f, awareness: e.target.value })}>
              <option value="">Choose…</option>
              {AWARENESS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
        </div>
        <div className="row2">
          <label className="field">
            <span className="lbl">Angle ●</span>
            <select className={`inp ${!f.angleId ? "fi-miss" : ""}`} value={f.angleId} onChange={(e) => setF({ ...f, angleId: e.target.value })}>
              <option value="">Choose…</option>
              {pickers.angles.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="lbl">Concept tag · customer first name ●</span>
            <input className={`inp ${!tag ? "fi-miss" : ""}`} value={f.face} maxLength={60} onChange={(e) => setF({ ...f, face: e.target.value })} placeholder="Khadija" />
            {f.face.trim() && !tag && <span className="formmsg err">Use Latin letters or digits (it goes into ad names).</span>}
          </label>
        </div>
        <span className="tag t-grey" style={{ alignSelf: "flex-start" }}><i aria-hidden="true" />UGC + TESTIMONIAL · SKIPS SCRIPT AND SHOOT</span>
        <label className="field">
          <span className="lbl">Brief · one text box ●</span>
          <textarea className={`ta ${f.brief.trim().length < 3 ? "fi-miss" : ""}`} rows={3} value={f.brief} maxLength={2000} onChange={(e) => setF({ ...f, brief: e.target.value })} placeholder="Keep her own words; cut to the stairs moment; subtitles." />
        </label>
        <div className="field" role="radiogroup" aria-labelledby="lbl-hooks">
          <span className="lbl" id="lbl-hooks">Hooks to cut from the call</span>
          <div className="recess wseg" style={{ alignSelf: "flex-start" }}>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={f.hooks === n} className={f.hooks === n ? "seg-on" : ""} onClick={() => setF({ ...f, hooks: n })}>{n}</button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="lbl">Ad names · preview</span>
          <div className="copy"><span>{base}_V1{f.hooks > 1 ? ` … _V${f.hooks}` : ""}</span></div>
        </div>
        {missing.length > 0 && <div className="formmsg err">Missing: {missing.join(", ")}.</div>}
        {rejecting && item && (
          <label className="field">
            <span className="lbl">Why not usable · optional</span>
            <input className="inp" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="sound too low" />
          </label>
        )}
        <div className="acts">
          {error && <span className="formmsg err" role="alert">{error}</span>}
          {item ? (
            rejecting
              ? <>
                  <button type="button" className="btn b-ghost" disabled={pending} onClick={() => setRejecting(false)}>Back</button>
                  <button type="button" className="btn b-red" disabled={pending} onClick={() => run(() => testimonialNotUsable(item.id, reason), (r) => { setOpen(false); say(r.ok!); })}>{pending ? "Saving…" : "Yes, not usable"}</button>
                </>
              : <button type="button" className="btn b-ghost" disabled={pending} onClick={() => setRejecting(true)}>Not usable</button>
          ) : (
            <button type="button" className="btn b-ghost" disabled={pending || !f.url.trim()} title="Keeps it as a TESTIMONIAL item to tag later" onClick={() => run(() => addTestimonial(f.url, f.note), (r) => { setOpen(false); say(r.ok!); })}>Save for later</button>
          )}
          {!rejecting && (
            <button type="button" className="btn b-primary" disabled={pending || missing.length > 0} onClick={create}>{pending ? "Saving…" : "Create edit task → Assign"}</button>
          )}
        </div>
      </Modal>
    </>
  );
}
