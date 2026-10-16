/**
 * Scripts pipeline (handoff §7, Scripts pipeline artboard): one row per script in progress, late first.
 * Rail of 5 steps: Writing → Review → Changes → Approved → Details.
 * Pure functions, safe for server and browser; fed by tasks, their review rounds and their Script details.
 */
import { fmtDay, isHeld, prodStage, tunisDate, type Production, type TaskRow } from "./tasks-shared";

export const RAIL = ["Writing", "Review", "Changes", "Approved", "Details"] as const;
export type StepState = "done" | "now" | "late" | "skip" | "todo";

export type DetailsLite = { taskId: string; face: string | null; shootOn: string | null; generate: boolean; vo?: boolean; confirmedAt: string | null };

export type PipeRow = {
  id: string;
  name: string;
  meta: string;
  copywriterId: string;
  steps: StepState[];
  nowLabel: string; // time spent on the current step: "6h", "3 d"
  waitingOn: string;
  waitingWhat: string;
  due: string;
  late: boolean;
  onFounder: boolean;
};
export type HandedChip = { id: string; copywriterId: string; label: string };
export type Pipeline = { rows: PipeRow[]; handed: HandedChip[] };

export const spent = (fromIso: string, now: number) => {
  const h = Math.max(0, (now - Date.parse(fromIso)) / 36e5);
  return h < 72 ? `${Math.floor(h)} h` : `${Math.floor(h / 24)} d`;
};

/**
 * Late rules (Settings · Alerts): writing / changes = due date passed; review = waiting over the review rule (48h);
 * details = not filled within the details rule (1 day) after approval.
 */
export function buildPipeline(
  tasks: TaskRow[],
  details: DetailsLite[],
  opts: { forFounder: boolean; reviewHours: number; detailsDays: number; weekStart: string; now: number },
  productions: Map<string, Production> = new Map(),
): Pipeline {
  const { forFounder, reviewHours, detailsDays, weekStart, now } = opts;
  const today = tunisDate(0, now);
  const det = new Map(details.map((d) => [d.taskId, d]));
  const rows: PipeRow[] = [];

  for (const t of tasks) {
    if (!["writing", "review", "changes", "approved"].includes(t.status)) continue;
    const last = t.rounds[t.rounds.length - 1];
    const hadChanges = t.rounds.some((r) => r.decision === "changes");
    const d = det.get(t.id);
    const cell = `${t.avatarCode} × ${t.awareness.replace("-Aware", "")}`;
    const meta = `${cell} · ${t.format}${forFounder ? ` · ${t.copywriter}` : ""}${d?.face ? ` · ${d.face}` : ""}`;
    const writer = forFounder ? t.copywriter : "You";
    const steps: StepState[] = ["todo", "todo", "todo", "todo", "todo"];
    let since = t.createdAt;
    let late = false;
    let waitingOn = writer;
    let waitingWhat = "writing";
    let due = `due ${fmtDay(t.dueOn)}`;
    let onFounder = false;
    const dueLate = t.dueOn < today;
    const daysLate = Math.round((Date.parse(today) - Date.parse(t.dueOn)) / 864e5);

    if (t.status === "writing") {
      steps[0] = "now";
      late = dueLate;
      if (late) due = `late ${daysLate} d`;
    } else if (t.status === "review") {
      steps[0] = "done";
      steps[1] = "now";
      if (hadChanges) steps[2] = "done";
      since = last?.submittedAt ?? since;
      late = (now - Date.parse(since)) / 36e5 >= reviewHours;
      waitingOn = forFounder ? "You" : "Founder 1";
      waitingWhat = `script review · round ${last?.round ?? 1}`;
      due = late ? `over ${reviewHours} h` : "in review";
      onFounder = true;
    } else if (t.status === "changes") {
      steps[0] = "done";
      steps[1] = "done";
      steps[2] = "now";
      since = last?.decidedAt ?? since;
      late = dueLate;
      waitingWhat = last?.loom ? (forFounder ? "your Loom" : "the founder Loom") : forFounder ? "your note" : "the founder note";
      if (late) due = `late ${daysLate} d`;
    } else {
      // approved: script approved, Script details still to confirm
      steps[0] = "done";
      steps[1] = "done";
      steps[2] = hadChanges ? "done" : "skip";
      steps[3] = "done";
      steps[4] = "now";
      since = last?.decidedAt ?? since;
      late = (now - Date.parse(since)) / 864e5 >= detailsDays;
      waitingWhat = d ? "script details (draft)" : "script details";
      due = late ? "details late" : d?.generate ? "AI / 3D" : d?.vo ? "VO" : d?.shootOn ? `shoot ${fmtDay(d.shootOn)}` : "details next";
    }
    const i = steps.indexOf("now");
    if (late) steps[i] = "late";
    rows.push({
      id: t.id,
      name: t.angle,
      meta,
      copywriterId: t.copywriterId,
      steps,
      nowLabel: spent(since, now),
      waitingOn,
      waitingWhat,
      due,
      late,
      onFounder,
    });
  }
  // Late first, then what waits on the founders, then by due date.
  const order = new Map(tasks.map((t) => [t.id, t.dueOn]));
  rows.sort((a, b) => Number(b.late) - Number(a.late) || Number(b.onFounder) - Number(a.onFounder) || (order.get(a.id) ?? "").localeCompare(order.get(b.id) ?? ""));

  const handed: HandedChip[] = [];
  for (const t of tasks) {
    const d = det.get(t.id);
    if (t.status !== "details_done" || !d?.confirmedAt || Date.parse(d.confirmedAt) < Date.parse(weekStart)) continue;
    // Where it is now in production: shoot day, footage in (to assign), or with an editor.
    const p = productions.get(t.id);
    const stage = prodStage(d.generate, p);
    const where =
      p?.liveAt ? "LIVE" : p?.launchedAt ? "LAUNCHED" : isHeld(p) ? "ON HOLD" : stage === "editing" ? "EDITING"
      : stage === "assign" ? (d.generate ? "AI / 3D · TO ASSIGN" : d.vo ? "VO IN" : "FOOTAGE IN")
      : d.vo ? "WAITING FOR VO" : d.shootOn ? `SHOOT ${fmtDay(d.shootOn).split(" ")[0].toUpperCase()}` : "SHOOT";
    handed.push({ id: t.id, copywriterId: t.copywriterId, label: `${(d.face ?? t.angle).toUpperCase()} · ${where}` });
  }
  return { rows, handed };
}
