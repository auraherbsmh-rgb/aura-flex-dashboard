"use client";

import { startTransition, useState } from "react";
import { Modal } from "./Modal";
import { saveScriptDetails } from "@/app/tasks/actions";
import { toConceptTag } from "@/lib/parse";
import { shortAwareness } from "@/lib/proposals-shared";
import { adSetName, missingDetails, type DetailsPickers, type ScriptDetails, type TaskRow, type Variation } from "@/lib/tasks-shared";

const blank = (): Variation => ({ hookTypeId: "", hookLine: "", headline: "" });

/** Copy button for an ad name (Launch needs them exactly as written). */
export function CopyName({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="cbtn"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(
          () => { setDone(true); setTimeout(() => setDone(false), 1500); },
          () => setDone(false),
        );
      }}
      aria-label={label === "Copy" ? `Copy ${text}` : label}
    >
      {done ? "Copied ✓" : label}
    </button>
  );
}

/**
 * "Fill script details" button + the Script details pop-up (Pop-ups artboard, handoff §7).
 * Every ● is required to confirm; "Save draft" keeps whatever is there. The line at the bottom lists exactly what is missing.
 */
export function ScriptDetailsButton({
  task,
  details,
  pickers,
  label,
  className = "btn b-primary",
  onDone,
}: {
  task: TaskRow;
  details: ScriptDetails | null;
  pickers: DetailsPickers;
  label: string;
  className?: string;
  onDone: (msg: string) => void;
}) {
  const isAI = task.formatCode === "AI";
  // Items archived in Settings since the draft was saved are cleared, so the missing line names them.
  const known = (id: string, list: { id: string }[]) => (list.some((x) => x.id === id) ? id : "");
  const start = () => ({
    face: details?.face ?? "",
    shootOn: details?.shootOn ?? "",
    generate: isAI || (details?.generate ?? false),
    mainArgumentId: known(details?.mainArgumentId ?? "", pickers.mainArguments),
    offer: details?.offer ?? null,
    variations: details?.variations.length
      ? details.variations.map((v) => ({ ...v, hookTypeId: known(v.hookTypeId, pickers.hookTypes) }))
      : [blank(), blank(), blank(), blank(), blank()],
  });
  const confirmed = !!details?.confirmedAt;
  const [open, setOpen] = useState(false);
  const [d, setD] = useState(start);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const tag = toConceptTag(d.face);
  const base = adSetName(task, tag);
  const missing = missingDetails(d, tag);
  const setVar = (i: number, patch: Partial<Variation>) => setD((o) => ({ ...o, variations: o.variations.map((v, j) => (j === i ? { ...v, ...patch } : v)) }));

  const openIt = () => { setD(start()); setError(""); setOpen(true); };
  const save = (confirm: boolean) => {
    setPending(true);
    setError("");
    startTransition(async () => {
      try {
        const res = await saveScriptDetails(task.id, d, confirm);
        if (res.ok) { onDone(res.ok); setOpen(false); }
        else setError(res.error ?? "Not saved.");
      } catch {
        setError("No connection: nothing was saved. Try again.");
      } finally {
        setPending(false);
      }
    });
  };

  const price = (n: 1 | 2 | 3) => (pickers.prices[n - 1] ? ` · ${pickers.prices[n - 1]} TND` : "");

  return (
    <>
      <button type="button" className={className} onClick={openIt}>{label}</button>
      <Modal open={open} onClose={() => setOpen(false)} who="Copywriter · after Founder 1 approves" title={`Script details · ${task.angle}`} width={780}>
        <div className="row4">
          <div className="field"><span className="lbl">Cell</span><div className="inp inp-ro">{task.avatarCode} × {shortAwareness(task.awareness)}</div></div>
          <div className="field"><span className="lbl">Angle</span><div className="inp inp-ro">{task.angle}</div></div>
          <div className="field"><span className="lbl">Format</span><div className="inp inp-ro">{task.format}</div></div>
          <div className="field"><span className="lbl">Script</span><div className="inp inp-ro" style={{ color: "#22468f" }}>Approved ✓</div></div>
        </div>

        <div className="row2">
          <label className="field">
            <span className="lbl">Face · first name ●</span>
            <input className={`inp ${!tag ? "fi-miss" : ""}`} value={d.face} maxLength={60} onChange={(e) => setD({ ...d, face: e.target.value })} placeholder="Sami" />
            {d.face.trim() && !tag && <span className="formmsg err">Start with a letter and use Latin letters (it goes into ad names).</span>}
            <span className="unit">The person in the video (creator, actor, doctor, customer). Nobody in it? One word for the idea, e.g. TalkingObjects. Goes into every ad name{tag ? <> as <b>{tag}</b></> : ""}.</span>
          </label>
          <div className="field">
            <span className="lbl">Shoot date ●</span>
            <input className={`inp ${!d.generate && !d.shootOn ? "fi-miss" : ""}`} type="date" value={d.generate ? "" : d.shootOn} disabled={d.generate} onChange={(e) => setD({ ...d, shootOn: e.target.value })} aria-label="Shoot date" />
            <label className="chk-row">
              <input type="checkbox" checked={d.generate} disabled={isAI} onChange={(e) => setD({ ...d, generate: e.target.checked })} />
              Generate with AI / 3D, no shoot{isAI ? " (AI / 3D format)" : ""}
            </label>
          </div>
          <label className="field">
            <span className="lbl">Main argument ●</span>
            <select className={`inp ${!d.mainArgumentId ? "fi-miss" : ""}`} value={d.mainArgumentId} onChange={(e) => setD({ ...d, mainArgumentId: e.target.value })}>
              <option value="">Choose…</option>
              {pickers.mainArguments.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
            <span className="unit">List editable in Settings.</span>
          </label>
          <label className="field">
            <span className="lbl">Offer pushed at the end · optional</span>
            <select className="inp" value={d.offer ?? ""} onChange={(e) => setD({ ...d, offer: e.target.value ? Number(e.target.value) : null })}>
              <option value="">None</option>
              <option value="1">1 bottle{price(1)}</option>
              <option value="2">2 bottles{price(2)}</option>
              <option value="3">3 bottles{price(3)}</option>
            </select>
          </label>
        </div>

        <div className="field">
          <span className="lbl">Ad variations · 5 to 6 · same footage, different hook</span>
          <div className="tray vtray">
            <div className="vgrid vhead" aria-hidden="true">
              <span className="lbl">Var.</span><span className="lbl">Hook type ●</span><span className="lbl">Hook line ●</span><span className="lbl">On-screen headline</span><span />
            </div>
            {d.variations.map((v, i) => (
              <div className="vgrid vrow" key={i} role="group" aria-label={`Variation V${i + 1}`}>
                <span className="vnum">V{i + 1}</span>
                <label className="vcell">
                  <span className="lbl vlbl">Hook type ●</span>
                  <select className={`inp ${!v.hookTypeId ? "fi-miss" : ""}`} aria-label={`V${i + 1} hook type`} value={v.hookTypeId} onChange={(e) => setVar(i, { hookTypeId: e.target.value })}>
                    <option value="">Hook type…</option>
                    {pickers.hookTypes.map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}
                  </select>
                </label>
                <label className="vcell">
                  <span className="lbl vlbl">Hook line ●</span>
                  <input className={`inp ${v.hookLine.trim().length < 2 ? "fi-miss" : ""}`} aria-label={`V${i + 1} hook line`} value={v.hookLine} maxLength={300} onChange={(e) => setVar(i, { hookLine: e.target.value })} placeholder="The exact first words, as said" />
                  <span className="vname">{base}_V{i + 1}</span>
                </label>
                <label className="vcell">
                  <span className="lbl vlbl">On-screen headline</span>
                  <input className="inp" aria-label={`V${i + 1} on-screen headline`} value={v.headline} maxLength={200} onChange={(e) => setVar(i, { headline: e.target.value })} placeholder="If different" />
                </label>
                <button type="button" className="x vdel" aria-label={`Delete V${i + 1}`} onClick={() => setD((o) => ({ ...o, variations: o.variations.filter((_, j) => j !== i) }))}>×</button>
              </div>
            ))}
            <button type="button" className="add" disabled={d.variations.length >= 6} onClick={() => setD((o) => ({ ...o, variations: [...o.variations, blank()] }))}>
              {d.variations.length >= 6 ? "6 variations: the maximum" : "+ Add variation (5–6)"}
            </button>
          </div>
        </div>

        <div className="acts" style={{ justifyContent: "space-between" }}>
          <span className={`formmsg ${error || missing.length ? "err" : "ok"}`} role="status" style={{ maxWidth: 440 }}>
            {error || (missing.length ? `Missing to confirm: ${missing.join(", ")}.` : confirmed ? "Everything is filled. Confirming renames the ads: do it before launch." : "Everything is filled. Confirm to create the ad names.")}
          </span>
          <span style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {confirmed
              ? <button type="button" className="btn b-ghost" disabled={pending} onClick={() => setOpen(false)}>Cancel</button>
              : <button type="button" className="btn b-ghost" disabled={pending} onClick={() => save(false)}>Save draft</button>}
            <button type="button" className="btn b-primary" disabled={pending || missing.length > 0} title={missing.length ? "Fill everything marked ● first" : undefined} onClick={() => save(true)}>
              {pending ? "Saving…" : confirmed ? "Confirm changes" : "Confirm details"}
            </button>
          </span>
        </div>
      </Modal>
    </>
  );
}
