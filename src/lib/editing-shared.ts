/**
 * Editing tab (handoff §8, Editing artboard): the editor's queue, her open task and her three private tiles.
 * Pure functions, safe for server and browser.
 */
import { fmtDay, isHeld, tunisDate, type Production, type TaskRow } from "./tasks-shared";

export type EditRound = {
  round: number;
  videoUrl: string;
  submittedAt: string;
  decision: "approved" | "changes" | null;
  loom: string | null;
  note: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
};

export type EditState = "ready" | "editing" | "submitted" | "changes" | "approved";

/** Where an assigned edit stands, from its production row and its versions. */
export function editState(p: Production | undefined, rounds: EditRound[]): EditState | null {
  if (!p?.assignedAt) return null;
  const last = rounds[rounds.length - 1];
  if (last?.decision === "approved") return "approved";
  if (last && !last.decision) return "submitted";
  if (last?.decision === "changes") return "changes";
  return p.editStartedAt ? "editing" : "ready";
}

export const EDIT_TAG: Record<EditState, { word: (n: number) => string; tone: string }> = {
  changes: { word: (n) => `NEEDS CHANGES · ROUND ${n + 1}`, tone: "t-red" },
  editing: { word: () => "EDITING", tone: "t-amber" },
  ready: { word: () => "READY", tone: "t-grey" },
  submitted: { word: (n) => `SUBMITTED V${n}`, tone: "t-blue" },
  approved: { word: () => "APPROVED", tone: "t-green" },
};

/** Steps of the open task: Ready → Editing → Sent vN → Changes → Approved → Launched. */
export const EDIT_STEPS = ["READY", "EDITING", "SENT", "CHANGES", "APPROVED", "LAUNCHED"] as const;
export function editStepNow(s: EditState): number {
  return { ready: 0, editing: 1, submitted: 2, changes: 3, approved: 4 }[s];
}

export type QueueItem = {
  taskId: string;
  editorId: string;
  state: EditState;
  tag: string;
  tone: string;
  title: string;
  sub: string;
  due: string;
  alert: string | null;
  alertTone: "red" | "amber";
  dim: boolean;
  rank: number;
  successor: boolean;
  dueOn: string;
  /** On hold (founders): no alerts, sorted last. */
  hold: boolean;
};

export type EditCard = { face: string; cell: string; angle: string; format: string; generate: boolean; vo?: boolean };

/**
 * The queue: successors first, then what needs the editor (changes, editing, ready), then what waits on Founder 2,
 * approved last (faded, shown 14 days for the pay count).
 */
export function buildQueue(
  tasks: TaskRow[],
  productions: Map<string, Production>,
  rounds: Map<string, EditRound[]>,
  cards: Map<string, EditCard>,
  opts: { now: number; notStartedDays: number; roundAlert: number },
): QueueItem[] {
  const today = tunisDate(0, opts.now);
  const tomorrow = tunisDate(1, opts.now);
  const out: QueueItem[] = [];
  for (const t of tasks) {
    const p = productions.get(t.id);
    const r = rounds.get(t.id) ?? [];
    const state = editState(p, r);
    const c = cards.get(t.id);
    if (!state || !p || !c) continue;
    const last = r[r.length - 1];
    // Launched videos stay 14 days for the pay count; approved but not launched stays until launched.
    if (state === "approved" && p.launchedAt && opts.now - Date.parse(p.launchedAt) > 14 * 864e5) continue;
    const due = p.editDue ?? t.dueOn;
    let alert: string | null = null;
    let alertTone: "red" | "amber" = "amber";
    const working = state === "ready" || state === "editing" || state === "changes";
    if (working && due < today) { alert = `Late since ${fmtDay(due)}`; alertTone = "red"; }
    else if (working && due === today) alert = "Due today";
    else if (working && due === tomorrow) alert = "Due tomorrow";
    // Counted from when the editor could start: the later of footage in and assigned (Founder 2's delay is not hers).
    const readySince = Math.max(Date.parse(p.assignedAt ?? ""), p.footageAt ? Date.parse(p.footageAt) : 0);
    if (state === "ready" && p.assignedAt && (opts.now - readySince) / 864e5 >= opts.notStartedDays) {
      alert = `Footage ready ${Math.floor((opts.now - readySince) / 864e5)} days, not started`;
      alertTone = "red";
    }
    const changesCount = r.filter((x) => x.decision === "changes").length;
    if (state === "changes" && changesCount + 1 >= opts.roundAlert) { alert = `Round ${changesCount + 1}`; alertTone = "red"; }
    const hold = isHeld(p);
    if (hold) alert = null;
    const tag = EDIT_TAG[state];
    const sub =
      state === "changes" ? (last?.loom ? "Loom waiting" : last?.note ?? "Founder note waiting")
      : state === "submitted" ? `Waiting for Founder 2 review`
      : state === "approved" ? `Approved ${last?.decidedAt ? fmtDay(last.decidedAt.slice(0, 10)) : ""} · counted for payment`
      : state === "ready" ? (c.generate ? "AI / 3D · generate and edit" : p.footageAt ? `${c.vo ? "VO" : "Footage"} in Drive since ${fmtDay(p.footageAt.slice(0, 10))}` : "Ready to start")
      : t.origin === "successor" ? "Successor for a fading winner" : "Editing";
    out.push({
      taskId: t.id,
      editorId: p.editorId ?? "",
      state,
      tag: hold ? "ON HOLD" : state === "approved" && p.liveAt ? "LIVE" : state === "approved" && p.launchedAt ? "LAUNCHED" : tag.word(state === "changes" ? (last?.round ?? 1) : (last?.round ?? 0)),
      // Launched and Live stand out from Approved at a glance (founder request Oct 16).
      tone: hold ? "t-hold" : state === "approved" && p.liveAt ? "t-live" : state === "approved" && p.launchedAt ? "t-launched" : tag.tone,
      title: `${c.face} · ${c.cell} · ${c.format}`,
      sub: hold ? `On hold since ${fmtDay(p.holdAt!.slice(0, 10))}${p.holdReason ? ` · ${p.holdReason}` : ""}` : sub,
      due: hold || state === "approved" || state === "submitted" ? "" : `due ${fmtDay(due).split(" ").slice(0, 1).join("")}`,
      alert,
      alertTone,
      dim: state === "approved",
      rank: { changes: 0, editing: 1, ready: 2, submitted: 3, approved: 4 }[state],
      successor: t.origin === "successor",
      dueOn: due,
      hold,
    });
  }
  // On hold sorts last (after approved), so what can move today stays on top.
  return out.sort((a, b) => Number(a.hold) - Number(b.hold) || Number(b.successor && !b.dim) - Number(a.successor && !a.dim) || a.rank - b.rank || a.dueOn.localeCompare(b.dueOn));
}

export type EditorStats = {
  approvedMonth: number;
  payPerVideo: number | null;
  avgRounds: number | null;
  avgRounds3m: number | null;
  onTime: number;
  onTimeOf: number;
  daysPerVideo: number | null;
  aiMonth: number;
  rate3d: number | null;
};

/** The three private tiles (+ the 3D tile for the AI editor). Month = calendar month in Tunisia. */
export function editorStats(
  editorId: string | null,
  productions: Map<string, Production>,
  rounds: Map<string, EditRound[]>,
  cards: Map<string, EditCard>,
  pay: { perVideo: number | null; rate3d: number | null },
  now: number,
): EditorStats {
  const month = tunisDate(0, now).slice(0, 7);
  const since3m = now - 90 * 864e5;
  const since1m = now - 30 * 864e5;
  let approvedMonth = 0, aiMonth = 0, onTime = 0, onTimeOf = 0;
  const r1: number[] = [], r3: number[] = [], days: number[] = [];
  for (const [taskId, p] of productions) {
    if (editorId && p.editorId !== editorId) continue;
    const r = rounds.get(taskId) ?? [];
    const ok = r.find((x) => x.decision === "approved");
    if (!ok?.decidedAt) continue;
    const at = Date.parse(ok.decidedAt);
    const okDay = new Date(at + 36e5).toISOString().slice(0, 10);
    if (okDay.slice(0, 7) === month) {
      approvedMonth++;
      if (cards.get(taskId)?.generate) aiMonth++;
      onTimeOf++;
      if (!p.editDue || okDay <= p.editDue) onTime++;
      const start = p.footageAt ?? p.assignedAt;
      if (start && r[0]) days.push((Date.parse(r[0].submittedAt) - Date.parse(start)) / 864e5);
    }
    if (at >= since1m) r1.push(r.length);
    if (at >= since3m) r3.push(r.length);
  }
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
  return {
    approvedMonth, payPerVideo: pay.perVideo, avgRounds: avg(r1), avgRounds3m: avg(r3), onTime, onTimeOf,
    daysPerVideo: avg(days), aiMonth, rate3d: pay.rate3d,
  };
}

/* ── Videos pipeline (handoff §8, Videos pipeline artboard) ── */

export const VRAIL = ["Shoot", "Footage", "Editing", "Review", "Launch"] as const;
export type VStep = "done" | "now" | "late" | "skip" | "todo";
export type VideoRow = {
  taskId: string;
  editorId: string | null;
  name: string; // face
  meta: string; // cell · format · editor
  origin: string; // script Copywriter 2 · approved Oct 6
  steps: VStep[];
  nowLabel: string;
  waitingOn: "Agency" | "Editor" | "You";
  waitingName: string;
  waitingWhat: string;
  due: string;
  late: boolean;
  href: string;
  dueSort: string;
  /** Not with an editor yet: the row opens Footage received or Assign right in the pipeline (founder choice Oct 16). */
  action: "footage" | "assign" | null;
  /** On hold (founders): not late, sorted last, reason shown. */
  hold: { since: string; reason: string | null } | null;
};

/** "Oct 6" for a timestamp, as a Tunisia calendar day. */
const monthDay = (iso: string) => new Date(`${tunisDate(0, Date.parse(iso))}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
/** "Sat Oct 18" for a YYYY-MM-DD day. */
const dayMonthDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).replace(",", "");

const ago = (fromMs: number, now: number) => {
  const h = Math.max(0, (now - fromMs) / 36e5);
  return h < 72 ? `${Math.floor(h)} h` : `${Math.floor(h / 24)} d`;
};

/**
 * One row per video in production (script details confirmed, not launched yet), late first.
 * Late rules (Settings): footage 2 days after the shoot · editing due passed or round 3 · review over 48h · launch over 2 days.
 */
export function buildVideoPipeline(
  tasks: TaskRow[],
  productions: Map<string, Production>,
  rounds: Map<string, EditRound[]>,
  details: Map<string, { shootOn: string | null; generate: boolean; vo?: boolean; face: string | null; confirmedAt: string | null }>,
  opts: { now: number; footageLateDays: number; assignLateDays: number; reviewHours: number; launchLateDays: number; roundAlert: number },
): VideoRow[] {
  const { now } = opts;
  const today = tunisDate(0, now);
  const rows: VideoRow[] = [];
  for (const t of tasks) {
    if (t.status !== "details_done") continue;
    const d = details.get(t.id);
    if (!d) continue;
    const p = productions.get(t.id);
    if (p?.launchedAt) continue; // launched: out of production
    const r = rounds.get(t.id) ?? [];
    const last = r[r.length - 1];
    const ok = r.find((x) => x.decision === "approved");
    const gen = d.generate || t.formatCode === "AI";
    const scriptOk = [...t.rounds].reverse().find((x) => x.decision === "approved");
    const vo = !gen && !!d.vo;
    const steps: VStep[] = gen ? ["skip", "skip", "todo", "todo", "todo"] : vo ? ["skip", "todo", "todo", "todo", "todo"] : ["todo", "todo", "todo", "todo", "todo"];
    let i = 0, since = now, late = false;
    let waitingOn: VideoRow["waitingOn"] = "Agency", waitingWhat = "", due = "on track";
    let label: string | null = null;
    const editor = p?.editorName ?? "Editor";
    const changes = r.filter((x) => x.decision === "changes").length;

    if (ok) {
      i = 4; since = Date.parse(ok.decidedAt ?? ok.submittedAt);
      late = (now - since) / 864e5 >= opts.launchLateDays;
      waitingOn = "You"; waitingWhat = "launch";
      due = late ? `${Math.floor((now - since) / 864e5)} d waiting` : "names ready";
    } else if (last && !last.decision) {
      i = 3; since = Date.parse(last.submittedAt);
      late = (now - since) / 36e5 >= opts.reviewHours;
      waitingOn = "You"; waitingWhat = `edit review v${last.round}`;
      due = late ? `over ${opts.reviewHours} h` : "on track";
    } else if (p?.assignedAt) {
      i = 2; since = Date.parse(last?.decidedAt ?? p.editStartedAt ?? p.assignedAt);
      const dueOn = p.editDue ?? t.dueOn;
      // Late: due date passed, round 3, or assigned and not started for the "edit not started" rule.
      const notStarted = !p.editStartedAt && (now - Math.max(Date.parse(p.assignedAt), p.footageAt ? Date.parse(p.footageAt) : 0)) / 864e5 >= opts.assignLateDays;
      late = dueOn < today || changes + 1 >= opts.roundAlert || notStarted;
      waitingOn = "Editor";
      waitingWhat = changes ? "changes" : p.editStartedAt ? (gen ? "generating" : "editing") : "not started";
      if (changes) label = `R${changes + 1}`;
      else if (gen && p.editStartedAt) label = "gen";
      due = dueOn < today ? `${Math.round((Date.parse(today) - Date.parse(dueOn)) / 864e5)} d late` : dueOn === tunisDate(1, now) ? "due tomorrow" : `due ${fmtDay(dueOn).split(" ")[0]}`;
    } else if (gen || p?.footageAt) {
      // ready to assign: Editing is the step, waiting on Founder 2
      i = 2;
      since = p?.footageAt ? Date.parse(p.footageAt) : d.confirmedAt ? Date.parse(d.confirmedAt) : now;
      late = (now - since) / 864e5 >= opts.assignLateDays;
      waitingOn = "You"; waitingWhat = "assign";
      due = late ? "assign late" : "to assign";
    } else if (vo) {
      // VO, no shoot: Founder 2 uploads the recording; late after the footage rule, counted from the details confirmation.
      i = 1; since = d.confirmedAt ? Date.parse(d.confirmedAt) : now;
      late = (now - since) / 864e5 >= opts.footageLateDays;
      waitingOn = "You"; waitingWhat = "VO recording";
      due = late ? `${Math.floor((now - since) / 864e5)} d late` : "on track";
    } else if (d.shootOn && d.shootOn <= today) {
      i = 1; since = Date.parse(`${d.shootOn}T00:00:00+01:00`);
      late = (now - since) / 864e5 >= opts.footageLateDays;
      waitingOn = "Agency"; waitingWhat = "footage";
      due = late ? `${Math.floor((now - since) / 864e5)} d late` : "on track";
    } else {
      i = 0; since = now;
      waitingOn = "Agency"; waitingWhat = d.shootOn ? `shoot ${dayMonthDay(d.shootOn)}` : "shoot date not set";
      const inDays = d.shootOn ? Math.round((Date.parse(d.shootOn) - Date.parse(today)) / 864e5) : null;
      label = inDays !== null ? `in ${inDays} d` : "—";
      due = "on track";
    }
    const hold = isHeld(p) ? { since: p!.holdAt!, reason: p!.holdReason ?? null } : null;
    if (hold) { late = false; due = "on hold"; }
    for (let k = 0; k < i; k++) if (steps[k] !== "skip") steps[k] = "done";
    steps[i] = late ? "late" : "now";
    rows.push({
      taskId: t.id,
      editorId: p?.editorId ?? null,
      name: d.face ?? t.angle,
      meta: `${t.avatarCode} × ${t.awareness.replace("-Aware", "")} · ${t.format}${p?.editorName ? ` · ${p.editorName}` : ""}`,
      origin: `script ${t.copywriter}${scriptOk?.decidedAt ? ` · approved ${monthDay(scriptOk.decidedAt)}` : ""}`,
      steps,
      nowLabel: label ?? ago(since, now),
      waitingOn,
      waitingName: waitingOn === "Editor" ? editor : waitingOn,
      waitingWhat,
      due,
      late,
      href: p?.assignedAt ? `/editing?task=${t.id}#edit-view` : `/copywriting?task=${t.id}#task-view`,
      dueSort: p?.editDue ?? d.shootOn ?? t.dueOn,
      action: p?.assignedAt ? null : i === 2 ? "assign" : "footage",
      hold,
    });
  }
  return rows.sort((a, b) => Number(!!a.hold) - Number(!!b.hold) || Number(b.late) - Number(a.late) || Number(b.waitingOn === "You") - Number(a.waitingOn === "You") || a.dueSort.localeCompare(b.dueSort));
}
