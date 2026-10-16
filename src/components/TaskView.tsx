"use client";

import Link from "next/link";
import { startTransition, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Modal } from "./Modal";
import { CopyName, ScriptDetailsButton } from "./ScriptDetails";
import { AssignButton, FootageButton, HoldButton } from "./Production";
import { reviewScript, seeResult, submitScript } from "@/app/tasks/actions";
import { shortAwareness, type Pickers } from "@/lib/proposals-shared";
import { CellView, MapGrid, type CellKey, type MapData } from "./Map";
import { fmtDay, fmtWhen, inboxLine, isLink, stepNow, STEPS, tunisDate, type AngleHistoryRow, type ConceptResult, type CreateTaskContext, type DetailsPickers, type EditorLoad, type ProdCard, type Production, type ScriptDetails, type TaskRow, prodStage } from "@/lib/tasks-shared";

const STATUS_TAG: Record<string, { word: string; tone: string }> = {
  writing: { word: "WRITING", tone: "t-grey" },
  changes: { word: "CHANGES", tone: "t-red" },
  review: { word: "REVIEW", tone: "t-blue" },
  approved: { word: "APPROVED", tone: "t-green" },
  details_done: { word: "IN PRODUCTION", tone: "t-grey" },
};

const RESULT_TAG: Record<ConceptResult["state"], { word: string; tone: string }> = {
  won: { word: "WON", tone: "t-green" }, deteriorating: { word: "DETERIORATING", tone: "t-orange" }, fading: { word: "FADING", tone: "t-red" },
  recovering: { word: "RECOVERING", tone: "t-blue" }, testing: { word: "LIVE · TESTING", tone: "t-amber" }, lost: { word: "LOST", tone: "t-grey" },
};
const pctOf = (n: number | null, d = 0) => (n === null ? "—" : `${(n * 100).toFixed(d)}%`);

/** Inbox (Copywriting board, left): one line per task, most urgent first. Click → task view on the right. */
export function Inbox({ tasks, selectedId, forFounder, query, now, onOpen, results = {} }: { tasks: TaskRow[]; selectedId: string | null; forFounder: boolean; query: string; now: number; onOpen?: (id: string) => void; results?: Record<string, ConceptResult> }) {
  const lines = tasks.map((t) => ({ t, l: inboxLine(t, forFounder, now, results[t.id]) })).sort((a, b) => a.l.rank - b.l.rank || a.t.dueOn.localeCompare(b.t.dueOn));
  if (!lines.length) return <div className="info">{forFounder ? "No tasks yet. Use + Create task." : "No tasks yet. Founder 1 sends them here."}</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {lines.map(({ t, l }) => (
        <Link
          key={t.id}
          href={`/copywriting?${query}${query ? "&" : ""}task=${t.id}#task-view`}
          scroll={false}
          prefetch={onOpen ? false : true}
          onClick={(e) => {
            if (!onOpen || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
            e.preventDefault();
            onOpen(t.id);
          }}
          className={`inrow ${t.id === selectedId ? "inrow-on" : ""}`}
          aria-current={t.id === selectedId ? "true" : undefined}
        >
          <span><span className={`tag ${l.tone}`}><i aria-hidden="true" />{l.tag}</span></span>
          <span style={{ minWidth: 0 }}>
            <span className="inrow-title">{l.title}</span>
            <span className="inrow-sub">{l.sub}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}

/** Inbox with the founders' copywriter switch (Copywriter 1 · 2 · All). Filters in the browser, no trip to the server. */
export function BoardInbox({
  tasks,
  writers,
  cw,
  pick,
  selectedId,
  forFounder,
  now,
  action,
  onOpen,
  results,
}: {
  results?: Record<string, ConceptResult>;
  tasks: TaskRow[];
  writers: [string, string][];
  cw: string | null;
  pick: (id: string | null) => void;
  selectedId: string | null;
  forFounder: boolean;
  now: number;
  action?: React.ReactNode;
  onOpen?: (id: string) => void;
}) {
  const shown = cw ? tasks.filter((t) => t.copywriterId === cw) : tasks;
  return (
    <section className="tray" style={{ padding: "18px 16px 16px", display: "flex", flexDirection: "column", gap: 8 }} aria-labelledby="h-inbox">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 6px 6px", gap: 12, flexWrap: "wrap" }}>
        <h2 id="h-inbox" style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Inbox</h2>
        {action ?? <span className="lbl">Click a line → task</span>}
      </div>
      {forFounder && writers.length > 0 && (
        <div className="recess wseg" role="group" aria-label="Copywriter" style={{ alignSelf: "flex-start", marginBottom: 6 }}>
          {writers.map(([id, name]) => (
            <button key={id} type="button" className={cw === id ? "seg-on" : ""} aria-pressed={cw === id} onClick={() => pick(id)}>{name}</button>
          ))}
          <button type="button" className={!cw ? "seg-on" : ""} aria-pressed={!cw} onClick={() => pick(null)}>All</button>
        </div>
      )}
      <Inbox tasks={shown} selectedId={selectedId} forFounder={forFounder} query={cw ? `cw=${cw}` : ""} now={now} onOpen={onOpen} results={results} />
    </section>
  );
}

export type BoardData = {
  line: number | null;
  pickers: DetailsPickers;
  details: Record<string, ScriptDetails>;
  history: Record<string, AngleHistoryRow[]>;
  productions: Record<string, Production>;
  cards: Record<string, ProdCard>;
  editors: EditorLoad[];
};

/**
 * Copywriting board: inbox (left) + task view (right). Every task's data is already on the page, so opening a task
 * or switching copywriter is instant; the address keeps the choice for a reload or a shared link.
 */
export function CopyBoard({
  tasks,
  writers,
  initialSelected,
  forFounder,
  viewerId,
  now,
  action,
  side,
  data,
  map,
  proposePickers,
  createCtx,
}: {
  tasks: TaskRow[];
  writers: [string, string][];
  initialSelected: string | null;
  forFounder: boolean;
  viewerId: string;
  now: number;
  action?: React.ReactNode;
  side: React.ReactNode;
  data: BoardData;
  /** The map under the inbox (artboard order Inbox → Map); a cell opens the cell view on the right. */
  map?: MapData;
  proposePickers?: Pickers;
  /** Founders: empty cells open Create task instead of Propose. */
  createCtx?: CreateTaskContext | null;
}) {
  const [track, setTrack] = useState<"knee" | "hips">("knee");
  const [cell, setCell] = useState<CellKey | null>(null);
  // Instant: the choice lives in state and is written to the address. A navigation to this page with another
  // ?task / ?cw (e.g. a Pipeline row) changes the address, and the board follows it ("previous value" pattern).
  const params = useSearchParams();
  const urlTask = params.get("task");
  const rawCw = params.get("cw");
  const urlCw = rawCw && writers.some(([id]) => id === rawCw) ? rawCw : null;
  const [sel, setSel] = useState<string | null>(urlTask ?? initialSelected);
  // A task the copywriter chose (a click, or a link with ?task=): only then does opening it mark a RESULT as seen.
  const [chosen, setChosen] = useState<string | null>(urlTask);
  const [cw, setCw] = useState<string | null>(urlCw);
  const [seen, setSeen] = useState({ task: urlTask, cw: urlCw });
  // A Pipeline row for the task already in the address: no address change, so the Pipeline says it directly.
  useEffect(() => {
    const on = (e: Event) => { const id = (e as CustomEvent<string>).detail; setCell(null); setSel(id); setChosen(id); };
    window.addEventListener("aura:open-task", on);
    return () => window.removeEventListener("aura:open-task", on);
  }, []);
  if (seen.task !== urlTask || seen.cw !== urlCw) {
    setSeen({ task: urlTask, cw: urlCw });
    if (urlTask && urlTask !== seen.task) { setSel(urlTask); setChosen(urlTask); setCell(null); }
    if (urlCw !== seen.cw) setCw(urlCw);
  }
  const setAddress = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(patch)) { if (v) q.set(k, v); else q.delete(k); }
    window.history.replaceState(null, "", `/copywriting${q.size ? `?${q}` : ""}`);
  };
  // Results the copywriter has just opened count as seen at once (the server keeps it for the next load).
  const [seenNow, setSeenNow] = useState<Record<string, string>>({});
  const markSeen = useCallback((id: string, state: string) => setSeenNow((m) => ({ ...m, [id]: state })), []);
  const results: Record<string, ConceptResult> = Object.fromEntries(Object.entries(map?.results ?? {}).map(([id, r]) => [id, seenNow[id] ? { ...r, seenState: seenNow[id] } : r]));
  const shown = cw ? tasks.filter((t) => t.copywriterId === cw) : tasks;
  const urgent = [...shown].sort((a, b) => inboxLine(a, forFounder, now, results[a.id]).rank - inboxLine(b, forFounder, now, results[b.id]).rank || a.dueOn.localeCompare(b.dueOn))[0];
  const selected = shown.find((t) => t.id === sel) ?? urgent ?? null;
  const open = (id: string) => {
    setCell(null);
    setSel(id);
    setChosen(id);
    setAddress({ task: id });
    if (window.innerWidth < 1000) requestAnimationFrame(() => document.getElementById("task-view")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  return (
    <div className="board">
      <aside className="board-side">
        <BoardInbox
          tasks={tasks}
          writers={writers}
          cw={cw}
          pick={(id) => { setCw(id); setAddress({ cw: id }); }}
          selectedId={selected?.id ?? null}
          forFounder={forFounder}
          now={now}
          action={action}
          onOpen={open}
          results={results}
        />
        {map && <MapGrid data={map} track={track} setTrack={setTrack} selected={cell} pickers={proposePickers} createCtx={createCtx} onPick={(k) => {
          setCell(k);
          if (window.innerWidth < 1000) requestAnimationFrame(() => document.getElementById("cell-view")?.scrollIntoView({ behavior: "smooth", block: "start" }));
        }} />}
        {side}
      </aside>
      <div className="board-main">
        {cell && map ? (
          <CellView key={`${cell.avatarId}-${cell.awareness}-${track}`} data={map} cell={cell} track={track} pickers={proposePickers} createCtx={createCtx}
            onBack={selected ? () => setCell(null) : undefined} backLabel={selected?.copywriterId === viewerId ? "← Back to my task" : "← Back to the task"} />
        ) : selected ? (
          <TaskView
            key={selected.id}
            task={selected}
            history={data.history[selected.id] ?? []}
            line={data.line}
            isFounder={forFounder}
            isOwner={selected.copywriterId === viewerId}
            details={data.details[selected.id] ?? null}
            detailsPickers={data.pickers}
            production={data.productions[selected.id]}
            prodCard={data.cards[selected.id]}
            editors={data.editors}
            result={results[selected.id] ?? null}
            onSeen={chosen === selected.id ? markSeen : undefined}
          />
        ) : (
          <section className="card sec"><div className="info">Pick a task in the inbox to open it.</div></section>
        )}
      </div>
    </div>
  );
}

/** Task view (Copywriting board, right): the brief, the progress, the script link and the founder's review buttons. */
export function TaskView({
  task,
  history,
  line,
  isFounder,
  isOwner,
  details,
  detailsPickers,
  production,
  prodCard,
  editors = [],
  result = null,
  onSeen,
}: {
  /** Meta result (founders, or the copywriter's own concept). */
  result?: ConceptResult | null;
  onSeen?: (taskId: string, state: string) => void;
  task: TaskRow;
  history: AngleHistoryRow[];
  line: number | null;
  isFounder: boolean;
  isOwner: boolean;
  details: ScriptDetails | null;
  detailsPickers: DetailsPickers;
  production?: Production;
  prodCard?: ProdCard;
  editors?: EditorLoad[];
}) {
  const [url, setUrl] = useState(task.scriptUrl ?? "");
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pending, setPending] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);
  // Opening a new verdict marks the RESULT item as seen (her own concept only).
  const unseen = !!onSeen && !!result && isOwner && result.state !== "testing" && result.state !== result.seenState;
  const resultState = result?.state ?? null;
  useEffect(() => {
    if (!unseen || !resultState) return;
    let live = true;
    seeResult(task.id).then((r) => { if (live && r.ok) onSeen?.(task.id, resultState); });
    return () => { live = false; };
  }, [unseen, resultState, task.id, onSeen]);

  const last = task.rounds[task.rounds.length - 1];
  const generate = !!details?.generate || task.formatCode === "AI";
  const vo = !generate && !!details?.vo;
  const stage = task.status === "details_done" ? prodStage(generate, production) : null;
  // After hand-off: Shoot (or Generate) until the footage is in (AI / 3D: until assigned), then Edit.
  const now = result && result.state !== "testing" ? 6 : production?.liveAt || result ? 5 : stage === "editing" || (stage === "assign" && !generate) ? 4 : stepNow(task.status);
  const canSend = (isOwner || isFounder) && (task.status === "writing" || task.status === "changes");
  const canReview = isFounder && task.status === "review" && !!last && !last.decision;
  const today = tunisDate(0);
  const late = (task.status === "writing" || task.status === "changes") && task.dueOn < today;
  const soon = (task.status === "writing" || task.status === "changes") && task.dueOn <= tunisDate(1);
  const facts = task.changeFacts;

  const run = (fn: () => Promise<{ ok?: string; error?: string }>) => {
    setPending(true);
    setMsg({});
    startTransition(async () => {
      try {
        setMsg(await fn());
      } catch {
        setMsg({ error: "No connection: nothing was saved. Try again." });
      } finally {
        setPending(false);
      }
    });
  };

  return (
    <section className="card tv" id="task-view" aria-labelledby="tv-title">
      <div>
        <div className="lbl">Task · script{isFounder ? ` · ${task.copywriter}` : ""}</div>
        <h2 id="tv-title" className="tv-title">{task.angle}</h2>
        <div className="tv-tags">
          <span className="tag t-grey"><i aria-hidden="true" />{task.avatarCode} × {task.awareness.toUpperCase()}</span>
          <span className={`tag ${late ? "t-red" : soon ? "t-amber" : "t-grey"}`}><i aria-hidden="true" />{late ? "LATE · WAS DUE" : "DUE"} {fmtDay(task.dueOn).toUpperCase()}</span>
          <span className={`tag ${STATUS_TAG[task.status]?.tone ?? "t-grey"}`}><i aria-hidden="true" />{STATUS_TAG[task.status]?.word ?? task.status}</span>
          <span className="chip recess">{task.format}</span>
          {line !== null && <span className="chip recess">Business line <b className="mono">${line.toFixed(2)}</b></span>}
        </div>
      </div>

      {msg.ok && <div className="notice notice-green" role="status">{msg.ok}</div>}

      {task.status === "changes" && last && (
        <div className="tv-changes" role="note">
          <div className="lbl" style={{ color: "var(--red-ink)" }}>Needs changes · round {last.round} → round {last.round + 1}</div>
          {last.note && <div style={{ fontSize: 15, marginTop: 6 }}>{last.note}</div>}
          <div className="unit" style={{ marginTop: 6 }}>
            {last.decidedBy ?? "Founder"} · {last.decidedAt ? fmtWhen(last.decidedAt) : ""}
            {last.loom && <> · <a className="tap" href={last.loom} target="_blank" rel="noopener noreferrer">Watch the Loom ↗</a></>}
          </div>
        </div>
      )}

      <div className="tv-grid">
        <div className="tv-keep">
          <div className="lbl" style={{ color: "#135f33" }}>Keep · core message</div>
          <div className="tv-keep-text">{task.keep ?? "No core message yet for this angle. It is written when a concept in it wins."}</div>
        </div>
        <div className="tv-chg">
          <div className="lbl" style={{ color: "#844006" }}>Change</div>
          <div className="tv-chg-grid">
            <span className="tv-chg-k">Format</span>
            <span className="chg-row">
              {facts ? (
                <>
                  {facts.used.length ? facts.used.map((u) => <span key={u.label} className="ch-used">{u.label} {u.count}</span>) : <span className="tv-chg-k">nothing yet here</span>}
                  {facts.untried.length > 0 && <span className="tv-chg-k">untried</span>}
                  {facts.untried.map((u) => <span key={u} className="ch-un">{u}</span>)}
                </>
              ) : (
                <span className="tv-chg-k">no facts saved</span>
              )}
            </span>
            {task.note && (
              <>
                <span className="tv-chg-k">Founder</span>
                <span style={{ fontSize: 14, color: "#4a2603" }}>“{task.note}”</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div>
        <h3 className="h3">Already tried in this angle</h3>
        <div className="tray tv-tried">
          {history.length === 0 && <div className="tv-tried-empty">Nothing else in this angle yet.</div>}
          {history.map((h, i) => (
            <div className="tv-tried-row" key={i}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{h.cell}</div>
                <div className="unit">{h.format} · {h.month}</div>
              </div>
              <span className={`tag ${STATUS_TAG[h.status]?.tone ?? "t-grey"}`} style={{ justifyContent: "center" }}><i aria-hidden="true" />{STATUS_TAG[h.status]?.word ?? h.status}</span>
              <span className="part p-wait">OPENING —</span>
              <span className="part p-wait">HOLD —</span>
              <span className="part p-wait">CLICKS —</span>
            </div>
          ))}
        </div>
        <div className="unit" style={{ marginTop: 6 }}>Opening, Hold and Clicks fill in once Meta is connected (phase 3).</div>
      </div>

      <div>
        <h3 className="h3">Materials</h3>
        <div className="tv-mat">
          <div className="raise tv-mat-item">
            <span className="lbl">Reference ad</span>
            {isLink(task.reference)
              ? <a className="tap" href={task.reference} target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, fontWeight: 600 }}>Open ↗</a>
              : <span style={{ fontSize: 14, fontWeight: 600 }}>{task.reference ?? "None"}</span>}
          </div>
          <div className="raise tv-mat-item">
            <span className="lbl">Founder note</span>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{task.note ?? "None"}</span>
          </div>
        </div>
      </div>

      <div>
        <h3 className="h3">{isOwner ? "My work" : "Progress"}</h3>
        <ol className="recess steps" aria-label="Progress">
          {STEPS.map((s, i) => (
            <li key={s} className={`step ${i < now ? "st-done" : i === now ? "st-now" : ""}`} aria-current={i === now ? "step" : undefined}>
              {s === "SHOOT" && (details?.generate || task.formatCode === "AI") ? "GENERATE" : s === "SHOOT" && details?.vo ? "VO" : s}
            </li>
          ))}
        </ol>
        {result && (
          <div className="tv-result">
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span className={`tag ${RESULT_TAG[result.state].tone}`}><i aria-hidden="true" />{RESULT_TAG[result.state].word}</span>
              <span className="mono" style={{ fontSize: 13 }}>
                <span className={`bx ${result.state === "testing" || result.cpa7 === null ? "bx-y" : result.cpa7 > result.line ? "bx-r" : "bx-g"}`}>{result.cpa7 === null ? "no sale" : `$${result.cpa7.toFixed(2)}`}</span>
                <span className="unit"> / {result.line.toFixed(2)} own line · 7d{result.bestV !== null ? ` · V${result.bestV}` : ""}</span>
              </span>
              <span className="unit">{result.sales7} sale{result.sales7 === 1 ? "" : "s"} · ${Math.round(result.spend7)} in 7 days</span>
            </div>
            <div className="tv-result-vars">
              {result.variations.map((v) => (
                <div key={v.v ?? "?"} className="tv-result-var">
                  <span className="mono" style={{ fontWeight: 600 }}>V{v.v ?? "?"}</span>
                  <span className={`bx ${v.state === "testing" || v.cpa7 === null ? "bx-y" : v.cpa7 > v.line ? "bx-r" : "bx-g"}`}>{v.cpa7 === null ? "no sale" : `$${v.cpa7.toFixed(2)}`}</span>
                  <span className="unit">{v.sales7} sale{v.sales7 === 1 ? "" : "s"}{v.live ? "" : " · paused"} · Opening {pctOf(v.hookRate)} · Hold {pctOf(v.hold)} · Clicks {pctOf(v.ctr, 2)}</span>
                </div>
              ))}
            </div>
            <div className="unit">The verdict is CPA vs the concept&apos;s own line; opening, hold and clicks are signals only. Updated every morning from Meta.</div>
          </div>
        )}
        {canReview && (
          <div style={{ display: "flex", gap: 10, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" className="btn b-green" disabled={pending} onClick={() => run(() => reviewScript(task.id, last.round, "approved", "", ""))}>
              {pending ? "Saving…" : "Approve"}
            </button>
            <button type="button" className="btn b-red" disabled={pending} onClick={() => setChangesOpen(true)}>Needs changes</button>
            <span className="unit">Founder only · round {last.round}</span>
          </div>
        )}
      </div>

      {task.status === "approved" && (isOwner || isFounder) && (
        <div className="tv-next">
          <div>
            <b>Script approved.</b> Fill the script details: face, {details?.generate || task.formatCode === "AI" ? "AI / 3D" : "shoot date (or VO)"}, main argument, and {task.formatCode === "AI" ? "1–6" : "5–6"} hook variations.
            The shoot and the ad names wait until it’s confirmed.
            {details && !details.confirmedAt && <span className="unit"> · Draft saved</span>}
          </div>
          <ScriptDetailsButton task={task} details={details} pickers={detailsPickers} label={details ? "Continue script details" : "Fill script details"} onDone={(m) => setMsg({ ok: m })} />
        </div>
      )}
      {task.status === "approved" && !isOwner && !isFounder && <div className="info">Script approved. Script details come next.</div>}

      {task.status === "details_done" && details && (
        <div>
          <h3 className="h3">Script details</h3>
          <div className="tv-det">
            <div><span className="lbl">Face</span><b>{details.face}</b></div>
            <div><span className="lbl">{details.generate || details.vo ? "Production" : "Shoot"}</span><b>{details.generate ? "AI / 3D, no shoot" : details.vo ? "VO, no shoot" : fmtDay(details.shootOn)}</b></div>
            <div><span className="lbl">Main argument</span><b>{detailsPickers.mainArguments.find((a) => a.id === details.mainArgumentId)?.label ?? "—"}</b></div>
            <div><span className="lbl">Offer at the end</span><b>{details.offer ? `${details.offer} bottle${details.offer > 1 ? "s" : ""}` : "None"}</b></div>
          </div>
          {details.adSetName && (
            <div className="field" style={{ marginTop: 14 }}>
              <span className="lbl">Ad set name</span>
              <div className="copy"><span>{details.adSetName}</span><CopyName text={details.adSetName} /></div>
            </div>
          )}
          <div className="field" style={{ marginTop: 10 }}>
            <span className="lbl">Ad variations · one ad name each</span>
            {details.ads.map((a) => (
              <div className="tv-ad" key={a.v}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14 }}><b>V{a.v}</b> · <span className="unit">{a.hookType}</span> · “{a.hookLine}”{a.headline ? <span className="unit"> · headline: {a.headline}</span> : null}</div>
                  <div className="copy" style={{ marginTop: 6 }}><span>{a.adName}</span><CopyName text={a.adName} /></div>
                </div>
              </div>
            ))}
          </div>
          {production?.launchedAt && <div className="unit" style={{ marginTop: 12 }}>Launched: the names are in Meta and can no longer change.</div>}
          {(isOwner || isFounder) && !production?.launchedAt && (
            <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <ScriptDetailsButton task={task} details={details} pickers={detailsPickers} label="Edit details" className="btn b-ghost" onDone={(m) => setMsg({ ok: m })} />
              <span className="unit">Editing changes the ad names: do it before launch.</span>
            </div>
          )}
        </div>
      )}

      {task.status === "details_done" && stage && (
        <div>
          <h3 className="h3">Production</h3>
          {!production?.launchedAt && (production?.holdAt || isFounder) && (
            <div className="tv-prod-row" style={{ marginBottom: 8 }}>
              <div style={{ minWidth: 0 }}>
                {production?.holdAt
                  ? <><span className="tag t-hold"><i aria-hidden="true" />ON HOLD</span><div style={{ fontSize: 14, marginTop: 6 }}>Since {fmtWhen(production.holdAt)}{production.holdReason ? ` · ${production.holdReason}` : ""} · no late alerts, the editor can&rsquo;t send a version</div></>
                  : <span className="unit">Another script should go first? Put this one on hold.</span>}
              </div>
              {isFounder && <HoldButton taskId={task.id} face={details?.face ?? task.angle} current={production} onDone={(m) => setMsg({ ok: m })} />}
            </div>
          )}
          <div className="tv-prod">
            <div className="tv-prod-row">
              <div style={{ minWidth: 0 }}>
                <span className="lbl">{generate ? "Generate" : vo ? "VO recording" : "Shoot and footage"}</span>
                <div style={{ fontSize: 14, marginTop: 4 }}>
                  {generate
                    ? "AI / 3D: no shoot. Goes straight to an editor."
                    : vo
                      ? production?.footageAt
                        ? <>VO received {fmtWhen(production.footageAt)} · <a className="tap" href={production.footageUrl ?? "#"} target="_blank" rel="noopener noreferrer">VO recording ↗</a>{production.inspirationUrl ? <> · <a className="tap" href={production.inspirationUrl} target="_blank" rel="noopener noreferrer">Inspiration ↗</a></> : null}</>
                        : "No shoot · waiting for the VO recording (Founder 2 uploads it)"
                    : production?.footageAt
                      ? <>Footage received {fmtWhen(production.footageAt)} · <a className="tap" href={production.footageUrl ?? "#"} target="_blank" rel="noopener noreferrer">Raw footage ↗</a>{production.allHooksShot ? " · all hooks shot ✓" : <span className="formmsg err"> · missing: {production.footageGap}</span>}</>
                      : <>Shoot {details?.shootOn ? fmtDay(details.shootOn) : "date not set"} · waiting for the agency’s footage</>}
                </div>
              </div>
              {isFounder && prodCard && stage === "shoot" && <FootageButton card={prodCard} who="Founder · Footage received" className="btn b-primary" onDone={(m) => setMsg({ ok: m })} />}
              {isFounder && prodCard && stage === "assign" && !generate && (
                <FootageButton card={prodCard} current={production} label="Change" who="Founder · Footage received" className="btn b-ghost" onDone={(m) => setMsg({ ok: m })} />
              )}
            </div>
            <div className="tv-prod-row">
              <div style={{ minWidth: 0 }}>
                <span className="lbl">Edit</span>
                <div style={{ fontSize: 14, marginTop: 4 }}>
                  {production?.assignedAt
                    ? <>{production.editorName} · due {production.editDue ? fmtDay(production.editDue) : "—"}{production.brief ? <span className="unit"> · brief: {production.brief}</span> : null}</>
                    : stage === "assign" ? "Ready to assign to an editor" : vo ? "After the VO recording" : "After the footage"}
                </div>
              </div>
              {isFounder && prodCard && stage !== "shoot" && (
                <AssignButton card={prodCard} editors={editors} current={production} who="Founder · Assign" label={production?.assignedAt ? "Change" : "Assign"} className={production?.assignedAt ? "btn b-ghost" : "btn b-primary"} onDone={(m) => setMsg({ ok: m })} />
              )}
            </div>
          </div>
          {production?.launchedAt && (
            <div className="tv-prod-row" style={{ marginTop: 8 }}>
              <div>
                <span className="lbl">Launch</span>
                <div style={{ fontSize: 14, marginTop: 4 }}>{production.liveAt ? `Live since ${fmtWhen(production.liveAt)}` : `Launched ${fmtWhen(production.launchedAt)} · turns Live once Meta is connected (phase 3); use Mark live until then`}</div>
              </div>
            </div>
          )}
          {!isFounder && <div className="unit" style={{ marginTop: 6 }}>Read-only: Founder 2 runs production.</div>}
        </div>
      )}

      {task.status === "review" && last && (
        <div className="info">
          <b style={{ color: "var(--ink)" }}>Sent for review · round {last.round}</b> · {fmtWhen(last.submittedAt)} ·{" "}
          <a className="tap" href={last.scriptUrl} target="_blank" rel="noopener noreferrer">Open the script ↗</a>
          {!isFounder && " · waiting on Founder 1"}
        </div>
      )}

      {canSend && (
        <form
          onSubmit={(e) => { e.preventDefault(); run(() => submitScript(task.id, url)); }}
          style={{ display: "flex", flexDirection: "column", gap: 14 }}
        >
          <div>
            <h3 className="h3">Script for review</h3>
            <label className="field">
              <span className="lbl">Script link ●</span>
              <input className="inp" type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/…" maxLength={1000} />
            </label>
          </div>
          <div className="info">
            <b style={{ color: "var(--ink)" }}>After Founder 1 approves:</b> {isOwner ? "your" : "her"} inbox gets “Fill script details”: face, shoot, main argument, and for each variation its hook type and hook line. The shoot and the ad names wait until it’s done.
          </div>
          <div className="acts">
            {msg.error && <span className="formmsg err" role="alert">{msg.error}</span>}
            <button type="submit" className="btn b-primary" style={{ height: 50 }} disabled={pending}>
              {pending ? "Sending…" : task.status === "changes" ? "Send the new version" : "Submit script for review"}
            </button>
          </div>
        </form>
      )}
      {!canSend && msg.error && <span className="formmsg err" role="alert">{msg.error}</span>}

      {task.rounds.length > 0 && (
        <div>
          <h3 className="h3">History</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[...task.rounds].reverse().map((r) => (
              <div className="row" key={r.round} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <b style={{ fontSize: 14 }}>Round {r.round}</b>
                  <span className="unit">sent {fmtWhen(r.submittedAt)} by {r.submittedBy}</span>
                  <a className="tap" href={r.scriptUrl} target="_blank" rel="noopener noreferrer" >Script ↗</a>
                  {r.decision && (
                    <span className={`tag ${r.decision === "approved" ? "t-green" : "t-red"}`}><i aria-hidden="true" />{r.decision === "approved" ? "APPROVED" : "NEEDS CHANGES"}</span>
                  )}
                </div>
                {(r.note || r.loom) && (
                  <div className="sub">
                    {r.note}
                    {r.loom && <> {r.note ? "· " : ""}<a className="tap" href={r.loom} target="_blank" rel="noopener noreferrer">Loom ↗</a></>}
                    {r.decidedBy && <span className="unit"> · {r.decidedBy}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {canReview && (
        <NeedsChanges
          open={changesOpen}
          onClose={() => setChangesOpen(false)}
          title={`Needs changes · ${task.angle} · ${task.avatarCode} × ${shortAwareness(task.awareness)}`}
          round={last.round}
          onSend={async (loom, note) => {
            const res = await reviewScript(task.id, last.round, "changes", loom, note);
            if (res.ok) setMsg(res);
            return res;
          }}
        />
      )}
    </section>
  );
}

/** Needs changes pop-up (Pop-ups artboard). The Loom is optional; the one line is required when there is no Loom. */
export function NeedsChanges({
  open,
  onClose,
  title,
  round,
  onSend,
  kind = "SCRIPT",
  to = "the copywriter",
  where = "her inbox",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  round: number;
  kind?: "SCRIPT" | "EDIT";
  to?: string;
  where?: string;
  onSend: (loom: string, note: string) => Promise<{ ok?: string; error?: string }>;
}) {
  const [loom, setLoom] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const empty = !loom.trim() && !note.trim();

  const close = () => { setError(""); onClose(); };
  const send = () => {
    setPending(true);
    setError("");
    startTransition(async () => {
      try {
        const res = await onSend(loom, note);
        if (res.ok) { setLoom(""); setNote(""); onClose(); }
        else setError(res.error ?? "Not saved.");
      } catch {
        setError("No connection: nothing was saved. Try again.");
      } finally {
        setPending(false);
      }
    });
  };

  return (
    <Modal open={open} onClose={close} who="Founder · behind every “Needs changes”" title={title}>
      <span className="tag t-red" style={{ alignSelf: "flex-start" }}><i aria-hidden="true" />{kind} · ROUND {round} → ROUND {round + 1}</span>
      <label className="field">
        <span className="lbl">Loom link · optional</span>
        <input className="inp" type="url" value={loom} onChange={(e) => setLoom(e.target.value)} placeholder="https://www.loom.com/share/…" maxLength={1000} />
      </label>
      <label className="field">
        <span className="lbl">One line · what to fix{loom.trim() ? " · optional with a Loom" : ""}</span>
        <textarea className="ta" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="The hook is too slow: start with the stairs." />
      </label>
      <div className="info">Goes back to {to} with your note{loom.trim() ? " and the Loom" : ""}. It shows at the top of {where}.</div>
      <div className="acts">
        {error && <span className="formmsg err" role="alert">{error}</span>}
        <button type="button" className="btn b-ghost" onClick={close}>Cancel</button>
        <button type="button" className="btn b-primary" disabled={pending || empty} title={empty ? "Write one line or add a Loom" : undefined} onClick={send}>
          {pending ? "Sending…" : "Send back"}
        </button>
      </div>
    </Modal>
  );
}
