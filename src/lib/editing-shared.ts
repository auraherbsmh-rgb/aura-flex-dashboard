/**
 * Editing tab (handoff §8, Editing artboard): the editor's queue, her open task and her three private tiles.
 * Pure functions, safe for server and browser.
 */
import { fmtDay, tunisDate, type Production, type TaskRow } from "./tasks-shared";

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
};

export type EditCard = { face: string; cell: string; angle: string; format: string; generate: boolean };

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
    if (state === "approved" && last?.decidedAt && opts.now - Date.parse(last.decidedAt) > 14 * 864e5) continue;
    const due = p.editDue ?? t.dueOn;
    let alert: string | null = null;
    let alertTone: "red" | "amber" = "amber";
    const working = state === "ready" || state === "editing" || state === "changes";
    if (working && due < today) { alert = `Late since ${fmtDay(due)}`; alertTone = "red"; }
    else if (working && due === today) alert = "Due today";
    else if (working && due === tomorrow) alert = "Due tomorrow";
    if (state === "ready" && p.assignedAt && (opts.now - Date.parse(p.footageAt ?? p.assignedAt)) / 864e5 >= opts.notStartedDays) {
      alert = `Footage ready ${Math.floor((opts.now - Date.parse(p.footageAt ?? p.assignedAt)) / 864e5)} days, not started`;
      alertTone = "red";
    }
    const changesCount = r.filter((x) => x.decision === "changes").length;
    if (state === "changes" && changesCount + 1 >= opts.roundAlert) { alert = `Round ${changesCount + 1}`; alertTone = "red"; }
    const tag = EDIT_TAG[state];
    const sub =
      state === "changes" ? (last?.loom ? "Loom waiting" : last?.note ?? "Founder note waiting")
      : state === "submitted" ? `Waiting for Founder 2 review`
      : state === "approved" ? `Approved ${last?.decidedAt ? fmtDay(last.decidedAt.slice(0, 10)) : ""} · counted for payment`
      : state === "ready" ? (c.generate ? "AI / 3D · generate and edit" : p.footageAt ? `Footage in Drive since ${fmtDay(p.footageAt.slice(0, 10))}` : "Ready to start")
      : t.origin === "successor" ? "Successor for a fading winner" : "Editing";
    out.push({
      taskId: t.id,
      editorId: p.editorId ?? "",
      state,
      tag: tag.word(state === "changes" ? (last?.round ?? 1) : (last?.round ?? 0)),
      tone: tag.tone,
      title: `${c.face} · ${c.cell} · ${c.format}`,
      sub,
      due: state === "approved" || state === "submitted" ? "" : `due ${fmtDay(due).split(" ").slice(0, 1).join("")}`,
      alert,
      alertTone,
      dim: state === "approved",
      rank: { changes: 0, editing: 1, ready: 2, submitted: 3, approved: 4 }[state],
      successor: t.origin === "successor",
      dueOn: due,
    });
  }
  return out.sort((a, b) => Number(b.successor && !b.dim) - Number(a.successor && !a.dim) || a.rank - b.rank || a.dueOn.localeCompare(b.dueOn));
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
