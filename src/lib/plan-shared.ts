/**
 * Monday plan (founder decision Oct 23): both founders plan the week once — double down on what converts under its
 * own line, new tests, production order, launches — then lock it. Nothing here scores or predicts: every word comes
 * from a status (task, production, edit versions) or a Meta state already on the dashboard.
 * Carry-over is computed: an item of an earlier week that is not launched, dropped or cancelled is "From last week".
 */
import { isHeld, type ConceptResult, type Production, type TaskRow } from "./tasks-shared";
import type { EditRound } from "./editing-shared";

export type PlanKind = "double_down" | "new_test" | "launch";
export type PlanItemRow = {
  id: string;
  weekStart: string;
  kind: PlanKind;
  sourceTask: string | null;
  avatarId: string | null;
  awareness: string | null;
  note: string | null;
  taskId: string | null;
  addedAfterLock: boolean;
  droppedAt: string | null;
  droppedBy: string | null;
  dropReason: string | null;
  createdAt: string;
};
export type WeekRow = { weekStart: string; cap: number; lockedAt: string | null; lockedBy: string | null };
export type LogRow = { at: string; by: string; what: string };

/** Monday (Tunisia, UTC+1) of the week `now` is in, as YYYY-MM-DD. */
export function planWeek(now: number): string {
  const tn = new Date(now + 36e5);
  const back = (tn.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(tn.getUTCFullYear(), tn.getUTCMonth(), tn.getUTCDate() - back)).toISOString().slice(0, 10);
}
export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
/** "Mon 26 Oct" */
export const dayLabel = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
/** Tunisia weekday + time of an instant: "Mon 10:40". */
export const whenLabel = (iso: string) => {
  const d = new Date(Date.parse(iso) + 36e5);
  return `${d.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

export type Stage = { key: StageKey; word: string; tone: "t-green" | "t-grey" | "t-blue" | "t-orange" | "t-red"; closed: boolean };
type StageKey = "no_task" | "writing" | "review" | "changes" | "approved" | "shoot" | "editing" | "edit_review" | "on_hold" | "to_launch" | "launched" | "cancelled";

/** Where a plan item stands now, from the real statuses. Launched and cancelled close it. */
export function itemStage(
  it: Pick<PlanItemRow, "kind" | "sourceTask" | "taskId">,
  tasks: Map<string, TaskRow>,
  productions: Map<string, Production>,
  rounds: Map<string, EditRound[]>,
): Stage {
  const id = it.kind === "launch" ? it.sourceTask : it.taskId;
  if (!id) return { key: "no_task", word: "Task not created", tone: "t-orange", closed: false };
  const t = tasks.get(id);
  if (!t) return { key: "cancelled", word: "Task not found", tone: "t-grey", closed: true };
  const p = productions.get(id);
  if (p?.launchedAt) return { key: "launched", word: "Launched", tone: "t-green", closed: true };
  if (t.status === "cancelled") return { key: "cancelled", word: "Task cancelled", tone: "t-grey", closed: true };
  if (t.status === "writing") return { key: "writing", word: "Writing", tone: "t-blue", closed: false };
  if (t.status === "review") return { key: "review", word: "Script review", tone: "t-blue", closed: false };
  if (t.status === "changes") return { key: "changes", word: "Script changes", tone: "t-blue", closed: false };
  if (t.status === "approved") return { key: "approved", word: "Script details", tone: "t-blue", closed: false };
  if (isHeld(p)) return { key: "on_hold", word: "On hold", tone: "t-grey", closed: false };
  const rs = rounds.get(id) ?? [];
  if (rs.some((r) => r.decision === "approved")) return { key: "to_launch", word: "Waiting to launch", tone: "t-orange", closed: false };
  if (rs.some((r) => r.decision === null)) return { key: "edit_review", word: "Edit review", tone: "t-blue", closed: false };
  if (p?.editorId) return { key: "editing", word: "Editing", tone: "t-blue", closed: false };
  return { key: "shoot", word: "Shoot · footage", tone: "t-blue", closed: false };
}

/** Planned on Monday or carried from an earlier week: what the pipelines tag. */
export type PlanTag = "week" | "carry";

/** Items still open from earlier weeks (not removed, not dropped, not launched / cancelled). */
export function carried(items: PlanItemRow[], week: string, stageOf: (i: PlanItemRow) => Stage): PlanItemRow[] {
  return items.filter((i) => i.weekStart < week && !i.droppedAt && !stageOf(i).closed);
}

/** taskId → tag, for the Scripts and Videos pipelines. A launch item tags its video; others tag their task. */
export function planTags(items: PlanItemRow[], week: string, stageOf: (i: PlanItemRow) => Stage): Record<string, PlanTag> {
  const out: Record<string, PlanTag> = {};
  for (const i of carried(items, week, stageOf)) {
    const id = i.kind === "launch" ? i.sourceTask : i.taskId;
    if (id) out[id] = "carry";
  }
  for (const i of items) {
    if (i.weekStart !== week || i.droppedAt) continue;
    const id = i.kind === "launch" ? i.sourceTask : i.taskId;
    if (id && !out[id]) out[id] = "week";
  }
  return out;
}

/** Converting under its own line (Meta state won / recovering, still live): a concept to double down on. */
export function isWorking(r: ConceptResult | undefined): boolean {
  return !!r && r.live && (r.state === "won" || r.state === "recovering");
}

/** "CPA $4.10 · line $5.85 · 14 purchases (7 days)" — the numbers behind a Meta state, nothing computed. */
export function resultLine(r: ConceptResult | undefined): string {
  if (!r) return "No Meta numbers yet";
  const cpa = r.cpa7 === null ? "no purchase" : `CPA $${r.cpa7.toFixed(2)}`;
  return `${cpa} · line $${r.line.toFixed(2)} · ${r.sales7} purchase${r.sales7 === 1 ? "" : "s"} (7 days)`;
}

export const RESULT_WORD: Record<ConceptResult["state"], { word: string; tone: string }> = {
  won: { word: "UNDER ITS LINE", tone: "t-green" },
  recovering: { word: "BACK UNDER ITS LINE", tone: "t-green" },
  deteriorating: { word: "RISING TOWARD ITS LINE", tone: "t-amber" },
  fading: { word: "OVER ITS LINE", tone: "t-red" },
  testing: { word: "STILL TESTING", tone: "t-grey" },
  lost: { word: "OVER ITS LINE · LOST", tone: "t-red" },
};

export const DROP_REASONS = ["Concept is dead (over its line)", "Not needed anymore", "Replaced by another script", "No capacity this week"] as const;
