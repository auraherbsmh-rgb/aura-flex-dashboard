"use client";

import { startTransition, useState } from "react";
import { Modal } from "./Modal";
import { assignEdit, launchConcept, markFootage, setHold } from "@/app/tasks/actions";
import { CopyName } from "./ScriptDetails";
import { fmtDay, fmtWhen, suggestEditor, tunisDate, type EditorLoad, type LaunchNames, type ProdCard, type Production } from "@/lib/tasks-shared";

function useRun(onDone: (msg: string) => void, close: () => void) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const run = (fn: () => Promise<{ ok?: string; error?: string }>) => {
    setPending(true);
    setError("");
    startTransition(async () => {
      try {
        const res = await fn();
        if (res.ok) { onDone(res.ok); close(); }
        else setError(res.error ?? "Not saved.");
      } catch {
        setError("No connection: nothing was saved. Try again.");
      } finally {
        setPending(false);
      }
    });
  };
  return { error, setError, pending, run };
}

/** "Footage received" pop-up (Pop-ups artboard, FOOTAGE item): raw Drive link + the agency shot all hooks. */
export function FootageButton({
  card,
  current,
  label = "Footage received",
  who = "Founder 2 · FOOTAGE item",
  className = "btn b-ghost",
  startOpen = false,
  onClose,
  onDone,
}: {
  card: ProdCard;
  current?: Production;
  label?: string;
  who?: string;
  className?: string;
  /** Opened from a pipeline row: no trigger button, the pop-up shows at once. */
  startOpen?: boolean;
  onClose?: () => void;
  onDone: (msg: string) => void;
}) {
  const [open, setOpen] = useState(startOpen);
  const [url, setUrl] = useState(current?.footageUrl ?? "");
  const [all, setAll] = useState(current?.allHooksShot ?? true);
  const [gap, setGap] = useState(current?.footageGap ?? "");
  const close = () => { setOpen(false); onClose?.(); };
  const { error, setError, pending, run } = useRun(onDone, close);
  return (
    <>
      {!startOpen && <button type="button" className={className} onClick={() => { setUrl(current?.footageUrl ?? ""); setAll(current?.allHooksShot ?? true); setGap(current?.footageGap ?? ""); setError(""); setOpen(true); }}>{label}</button>}
      <Modal open={open} onClose={close} who={who} title={`Footage received · ${card.face}`}>
        <div className="sub">{card.cell} · {card.angle} · {card.format}{card.shootOn ? ` · shoot ${fmtDay(card.shootOn)}` : ""} · script by {card.copywriter}</div>
        <label className="field">
          <span className="lbl">Raw footage · Drive link</span>
          <input className="inp" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://drive.google.com/…" maxLength={1000} />
        </label>
        <label className="chk-row">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
          The agency shot all {card.hooks || ""} hooks in the script
        </label>
        {!all && (
          <label className="field">
            <span className="lbl">What is missing · one line</span>
            <input className="inp" value={gap} onChange={(e) => setGap(e.target.value)} maxLength={500} placeholder="V5 not shot; the editor covers it with B-roll" />
            <span className="unit">The editor sees this note.</span>
          </label>
        )}
        <div className="info">{current?.footageAt ? "Updates the link and note. The ASSIGN item keeps its age." : "The task becomes an ASSIGN item on Founder 2’s Home. The editor only sees it once assigned."}</div>
        <div className="acts">
          {error && <span className="formmsg err" role="alert">{error}</span>}
          <button type="button" className="btn b-ghost" onClick={close}>Cancel</button>
          <button type="button" className="btn b-primary" disabled={pending || !url.trim() || (!all && gap.trim().length < 2)} onClick={() => run(() => markFootage(card.taskId, url, all, gap))}>
            {pending ? "Saving…" : current?.footageAt ? "Save changes" : "Mark received"}
          </button>
        </div>
      </Modal>
    </>
  );
}

/** "Assign" pop-up (Pop-ups artboard, ASSIGN item): due date, reference, one-box brief, editor with queue ★. */
export function AssignButton({
  card,
  editors,
  current,
  label = "Assign",
  who = "Founder 2 · ASSIGN item",
  className = "btn b-ghost",
  startOpen = false,
  onClose,
  onDone,
}: {
  card: ProdCard;
  editors: EditorLoad[];
  current?: Production;
  label?: string;
  who?: string;
  className?: string;
  /** Opened from a pipeline row: no trigger button, the pop-up shows at once. */
  startOpen?: boolean;
  onClose?: () => void;
  onDone: (msg: string) => void;
}) {
  // The task being re-assigned is not extra work for its current editor.
  const loads = current?.assignedAt && current.editorId ? editors.map((e) => (e.id === current.editorId ? { ...e, queue: Math.max(0, e.queue - 1) } : e)) : editors;
  const star = suggestEditor(loads, card.generate);
  const start = () => ({
    due: current?.editDue && current.editDue >= tunisDate(0) ? current.editDue : tunisDate(3),
    ref: current?.reference ?? "",
    brief: current?.brief ?? "",
    editor: current?.editorId && editors.some((e) => e.id === current.editorId) ? current.editorId : star ?? "",
  });
  const [open, setOpen] = useState(startOpen);
  const [f, setF] = useState(start);
  const close = () => { setOpen(false); onClose?.(); };
  const { error, setError, pending, run } = useRun(onDone, close);
  const what = card.generate ? "full AI / 3D video" : `full video + ${card.hooks} hooks, subtitled`;
  return (
    <>
      {!startOpen && <button type="button" className={className} onClick={() => { setF(start()); setError(""); setOpen(true); }}>{label}</button>}
      <Modal open={open} onClose={close} who={who} title={`Assign · ${card.face}`}>
        <div className="sub">{card.cell} · {card.angle} · {card.format} · {what}</div>
        <div className="row2">
          <label className="field">
            <span className="lbl">Due</span>
            <input className="inp" type="date" min={tunisDate(0)} value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} />
          </label>
          <label className="field">
            <span className="lbl">Reference · optional</span>
            <input className="inp" value={f.ref} maxLength={1000} onChange={(e) => setF({ ...f, ref: e.target.value })} placeholder="link to a past ad" />
          </label>
        </div>
        <label className="field">
          <span className="lbl">Brief · one text box</span>
          <textarea className="ta" rows={3} value={f.brief} maxLength={2000} onChange={(e) => setF({ ...f, brief: e.target.value })} placeholder="Calm pace, show the stairs at work, the bottle in hand at the end." />
        </label>
        <div className="field" role="radiogroup" aria-labelledby="lbl-editor">
          <span className="lbl" id="lbl-editor">Editor · queue now</span>
          {editors.length === 0 && <div className="info">No active editor yet. Add one in Settings → People first.</div>}
          {loads.map((e) => (
            <label key={e.id} className={`pick ${f.editor === e.id ? "pick-on" : ""}`}>
              <input type="radio" name="editor" className="pick-radio" value={e.id} checked={f.editor === e.id} onChange={() => setF({ ...f, editor: e.id })} />
              <span>{e.id === star && editors.length > 1 ? "★ " : ""}{e.name}{e.doesAi ? " · full AI / 3D" : ""}</span>
              <span className="sub">{e.queue} in queue</span>
            </label>
          ))}
          {card.generate && <span className="unit">Full AI / 3D videos go to the AI / 3D editor (★).</span>}
        </div>
        <div className="acts">
          {error && <span className="formmsg err" role="alert">{error}</span>}
          <button type="button" className="btn b-ghost" onClick={close}>Cancel</button>
          <button type="button" className="btn b-primary" disabled={pending || !f.editor || f.brief.trim().length < 3 || !f.due} onClick={() => run(() => assignEdit(card.taskId, f.editor, f.due, f.brief, f.ref))}>
            {pending ? "Saving…" : current?.assignedAt ? "Save changes" : "Assign"}
          </button>
        </div>
      </Modal>
    </>
  );
}

/**
 * "Launch" pop-up (Pop-ups artboard, LAUNCH item): ad set name + every V# ad name with Copy, the final videos folder,
 * then Done (launched in Meta) or Mark live (fallback). The dashboard never touches Meta itself.
 */
export function LaunchButton({
  card,
  names,
  current,
  approvedAt,
  label = "Launch",
  who = "Founder 2 · LAUNCH item",
  className = "btn b-primary",
  onDone,
}: {
  card: ProdCard;
  names: LaunchNames | undefined;
  current?: Production;
  approvedAt?: string | null;
  label?: string;
  who?: string;
  className?: string;
  onDone: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [finalUrl, setFinalUrl] = useState("");
  const { error, setError, pending, run } = useRun(onDone, () => setOpen(false));
  // Decision Oct 16: Done needs the final videos folder.
  const noFolder = !finalUrl.trim() && !current?.finalUrl;
  const allNames = [names?.adSetName, ...(names?.ads ?? []).map((a) => a.name)].filter(Boolean).join("\n");
  return (
    <>
      <button type="button" className={className} onClick={() => { setFinalUrl(current?.finalUrl ?? ""); setError(""); setOpen(true); }}>{label}</button>
      <Modal open={open} onClose={() => setOpen(false)} who={who} title={`Launch · ${card.face}`}>
        <div className="sub">{card.cell} · {card.angle} · {card.format}{approvedAt ? ` · approved ${fmtDay(approvedAt.slice(0, 10))}` : ""}</div>
        {current?.launchedAt && (
          <span className={`tag ${current.liveAt ? "t-green" : "t-blue"}`} style={{ alignSelf: "flex-start" }}>
            <i aria-hidden="true" />{current.liveAt ? `LIVE · ${fmtWhen(current.liveAt)}` : `LAUNCHED · ${fmtWhen(current.launchedAt)}`}
          </span>
        )}
        <div className="field">
          <span className="lbl">Ad set name</span>
          {names?.adSetName ? <div className="copy"><span>{names.adSetName}</span><CopyName text={names.adSetName} /></div> : <div className="info">No ad set name: the script details were not confirmed.</div>}
        </div>
        <div className="field">
          <span className="lbl">Ad names · one per hook</span>
          {(names?.ads ?? []).map((a) => <div className="copy" key={a.v}><span>{a.name}</span><CopyName text={a.name} /></div>)}
          {allNames && <div style={{ display: "flex", justifyContent: "flex-end" }}><CopyName text={allNames} label="Copy all" /></div>}
        </div>
        <label className="field">
          <span className="lbl">Final videos · Drive folder ●</span>
          <input className="inp" type="url" value={finalUrl} onChange={(e) => setFinalUrl(e.target.value)} placeholder="https://drive.google.com/…" maxLength={1000} />
          {current?.finalUrl && <a className="tap" href={current.finalUrl} target="_blank" rel="noopener noreferrer">Open the folder ↗</a>}
        </label>
        <div className="info">
          Create the ads in Meta with exactly these names, then click <b style={{ color: "var(--ink)" }}>Done</b>. Once Meta is connected (phase 3) it turns{" "}
          <b style={{ color: "var(--ink)" }}>Live</b> by itself when the daily pull finds the names. Until then, use Mark live.
        </div>
        <div className="acts">
          {error && <span className="formmsg err" role="alert">{error}</span>}
          <button type="button" className="btn b-ghost" disabled={pending || !!current?.liveAt || noFolder} title={noFolder ? "Paste the final videos folder first" : undefined} onClick={() => run(() => launchConcept(card.taskId, finalUrl, true))}>Mark live (fallback)</button>
          <button type="button" className="btn b-primary" disabled={pending || noFolder} title={noFolder ? "Paste the final videos folder first" : undefined} onClick={() => run(() => launchConcept(card.taskId, finalUrl, false))}>{pending ? "Saving…" : current?.launchedAt ? "Save" : "Done"}</button>
        </div>
      </Modal>
    </>
  );
}

/**
 * On hold / Resume (founders): a video in production, not launched yet. While on hold its late alerts and Home items
 * stop, it sorts last, and the editor can't send a version. Founder request Oct 16.
 */
export function HoldButton({ taskId, face, current, onDone }: { taskId: string; face: string; current?: Production; onDone: (msg: string) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { error, setError, pending, run } = useRun(onDone, () => setOpen(false));
  if (current?.launchedAt) return null;
  if (current?.holdAt) {
    return (
      <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <button type="button" className="btn b-ghost" disabled={pending} onClick={() => run(() => setHold(taskId, false, ""))}>{pending ? "Saving…" : "Resume"}</button>
        {error && <span className="formmsg err" role="alert">{error}</span>}
      </span>
    );
  }
  return (
    <>
      <button type="button" className="btn b-ghost" onClick={() => { setReason(""); setError(""); setOpen(true); }}>On hold</button>
      <Modal open={open} onClose={() => setOpen(false)} who="Founders · priority" title={`Put on hold · ${face}`}>
        <label className="field">
          <span className="lbl">Reason · optional</span>
          <input className="inp" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="Another script goes first this week" />
        </label>
        <div className="info">While on hold: no late alerts, no Home items, it sorts last, and the editor can&rsquo;t send a version. Nothing else changes. Resume any time.</div>
        <div className="acts">
          {error && <span className="formmsg err" role="alert">{error}</span>}
          <button type="button" className="btn b-ghost" onClick={() => setOpen(false)}>Cancel</button>
          <button type="button" className="btn b-primary" disabled={pending} onClick={() => run(() => setHold(taskId, true, reason))}>{pending ? "Saving…" : "Put on hold"}</button>
        </div>
      </Modal>
    </>
  );
}
