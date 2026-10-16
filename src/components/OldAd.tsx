"use client";

import { startTransition, useState } from "react";
import { Modal } from "./Modal";
import { answerPause, tagOldAd } from "@/app/tasks/actions";
import { CopyName } from "./ScriptDetails";
import { toConceptTag } from "@/lib/parse";
import type { Pickers } from "@/lib/proposals-shared";

const AWARENESS = ["Problem-Aware", "Solution-Aware", "Product-Aware", "Most-Aware"];

function useRun(onDone: (m: string) => void, close: () => void) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const run = (fn: () => Promise<{ ok?: string; error?: string }>) => {
    setPending(true); setError("");
    startTransition(async () => {
      try { const r = await fn(); if (r.ok) { onDone(r.ok); close(); } else setError(r.error ?? "Not saved."); }
      catch { setError("No connection: nothing was saved. Try again."); }
      finally { setPending(false); }
    });
  };
  return { error, pending, run };
}

/** "Tag an old ad" pop-up (handoff §6b, UNMAPPED): old name → avatar (no BRD), awareness, angle, format, concept tag. */
export function TagOldAd({ base, example, pickers, onClose, onDone, guess }: {
  base: string; example: string; pickers: Pickers; onClose: () => void; onDone: (m: string) => void;
  /** Format guessed from the name's first part (UGC, IMG, AUTH…). */
  guess?: string;
}) {
  const guessed = pickers.formats.find((f) => f.code === guess)?.id ?? (guess === "IMG" ? pickers.formats.find((f) => f.code === "IMG")?.id : "") ?? "";
  const [f, setF] = useState({ avatar: "", awareness: AWARENESS.find((a) => example.toLowerCase().includes(a.toLowerCase())) ?? "", angle: "", format: guessed, tag: "" });
  const { error, pending, run } = useRun(onDone, onClose);
  const tag = toConceptTag(f.tag);
  const missing = [!f.avatar && "avatar", !f.awareness && "awareness", !f.angle && "angle", !f.format && "format", !tag && "concept tag"].filter(Boolean);
  return (
    <Modal open onClose={onClose} who="Founders · UNMAPPED item" title="Tag an old ad">
      <div className="copy"><span>{example}</span><CopyName text={example} /></div>
      <div className="row2">
        <label className="field"><span className="lbl">Avatar ● · no BRD</span>
          <select className="inp" value={f.avatar} onChange={(e) => setF({ ...f, avatar: e.target.value })}><option value="">Choose…</option>{pickers.avatars.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select>
        </label>
        <label className="field"><span className="lbl">Awareness ●</span>
          <select className="inp" value={f.awareness} onChange={(e) => setF({ ...f, awareness: e.target.value })}><option value="">Choose…</option>{AWARENESS.map((a) => <option key={a} value={a}>{a}</option>)}</select>
        </label>
      </div>
      <div className="row2">
        <label className="field"><span className="lbl">Angle ●</span>
          <select className="inp" value={f.angle} onChange={(e) => setF({ ...f, angle: e.target.value })}><option value="">Choose…</option>{pickers.angles.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select>
        </label>
        <label className="field"><span className="lbl">Format ●</span>
          <select className="inp" value={f.format} onChange={(e) => setF({ ...f, format: e.target.value })}><option value="">Choose…</option>{pickers.formats.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select>
        </label>
      </div>
      <label className="field"><span className="lbl">Concept tag ● · face or one word</span>
        <input className="inp" value={f.tag} maxLength={30} onChange={(e) => setF({ ...f, tag: e.target.value })} placeholder="Mervet" />
      </label>
      <div className="info">Tags every V# of this ad set (ABO and CBO). Renaming the ad in Meta is optional. Old ads stay out of the map’s verdicts (start date).</div>
      {missing.length > 0 && <div className="formmsg err">Missing: {missing.join(", ")}.</div>}
      <div className="acts">
        {error && <span className="formmsg err" role="alert">{error}</span>}
        <button type="button" className="btn b-ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="btn b-primary" disabled={pending || missing.length > 0} onClick={() => run(() => tagOldAd(base, f.avatar, f.awareness, f.angle, f.format, tag))}>{pending ? "Saving…" : "Tag"}</button>
      </div>
    </Modal>
  );
}

/** "Pause in Meta" pop-up (handoff §6b, KILL): reason, ad name + ID to copy → Done, paused in Meta / Not now (say why). */
export function PauseInMeta({ adId, name, flag, reason, onClose, onDone }: {
  adId: string; name: string; flag: string; reason: string; onClose: () => void; onDone: (m: string) => void;
}) {
  const [why, setWhy] = useState("");
  const [notNow, setNotNow] = useState(false);
  const { error, pending, run } = useRun(onDone, onClose);
  return (
    <Modal open onClose={onClose} who="Founder 2 · KILL item · act in Meta" title="Pause in Meta">
      <span className="tag t-red" style={{ alignSelf: "flex-start" }}><i aria-hidden="true" />{reason}</span>
      <div className="field"><span className="lbl">Ad name</span><div className="copy"><span>{name}</span><CopyName text={name} /></div></div>
      <div className="field"><span className="lbl">Ad ID</span><div className="copy"><span className="mono">{adId}</span><CopyName text={adId} /></div></div>
      <div className="info">Pause it in Ads Manager, then click Done. The dashboard never changes Meta; the next pull checks it is paused.</div>
      {notNow && (
        <label className="field"><span className="lbl">Why not now ●</span>
          <input className="inp" value={why} maxLength={300} onChange={(e) => setWhy(e.target.value)} placeholder="Budget just raised, wait 48h" />
        </label>
      )}
      <div className="acts">
        {error && <span className="formmsg err" role="alert">{error}</span>}
        {notNow
          ? <><button type="button" className="btn b-ghost" onClick={() => setNotNow(false)}>Back</button>
              <button type="button" className="btn b-primary" disabled={pending || why.trim().length < 3} onClick={() => run(() => answerPause(adId, flag, "not_now", why))}>{pending ? "Saving…" : "Save · not now"}</button></>
          : <><button type="button" className="btn b-ghost" onClick={() => setNotNow(true)}>Not now</button>
              <button type="button" className="btn b-primary" disabled={pending} onClick={() => run(() => answerPause(adId, flag, "paused", ""))}>{pending ? "Saving…" : "Done, paused in Meta"}</button></>}
      </div>
    </Modal>
  );
}
