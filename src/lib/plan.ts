// Server only: the Monday plan's rows (founders; RLS returns nothing to anyone else).
import { createClient } from "@/lib/supabase/server";
import { addDays, itemStage, planTags, planWeek, type LogRow, type PlanItemRow, type PlanTag, type WeekRow } from "./plan-shared";
import type { Production, TaskRow } from "./tasks-shared";
import type { EditRound } from "./editing-shared";

export type PlanData = { week: string; prevWeek: string; plan: WeekRow | null; items: PlanItemRow[]; log: LogRow[]; ok: boolean };

export async function getPlanData(now: number): Promise<PlanData> {
  const week = planWeek(now);
  const prevWeek = addDays(week, -7);
  const supabase = await createClient();
  const [w, it, lg] = await Promise.all([
    supabase.from("week_plans").select("week_start, cap, locked_at, locker:people!week_plans_locked_by_fkey(display_name)").eq("week_start", week).maybeSingle(),
    // Every item ever planned (small: ~8 a week). Older weeks are needed for carry-over.
    supabase.from("week_plan_items")
      .select("id, week_start, kind, source_task, avatar_id, awareness, note, task_id, added_after_lock, dropped_at, drop_reason, created_at, dropper:people!week_plan_items_dropped_by_fkey(display_name)")
      .is("removed_at", null).lte("week_start", week).order("created_at").limit(2000),
    supabase.from("week_plan_log").select("at, what, who:people!week_plan_log_by_person_fkey(display_name)").eq("week_start", week).order("at", { ascending: false }).limit(100),
  ]);
  const ok = !w.error && !it.error && !lg.error;
  if (!ok) console.error(`[plan] not read: ${w.error?.message ?? it.error?.message ?? lg.error?.message}`);
  const name = (x: unknown) => ((Array.isArray(x) ? x[0] : x) as { display_name?: string } | null)?.display_name ?? "";
  const plan: WeekRow | null = w.data
    ? { weekStart: w.data.week_start as string, cap: w.data.cap as number, lockedAt: w.data.locked_at as string | null, lockedBy: name(w.data.locker) || null }
    : null;
  const items: PlanItemRow[] = (it.data ?? []).map((r) => ({
    id: r.id as string, weekStart: r.week_start as string, kind: r.kind as PlanItemRow["kind"], sourceTask: r.source_task as string | null,
    avatarId: r.avatar_id as string | null, awareness: r.awareness as string | null, note: r.note as string | null, taskId: r.task_id as string | null,
    addedAfterLock: !!r.added_after_lock, droppedAt: r.dropped_at as string | null, droppedBy: name(r.dropper) || null, dropReason: r.drop_reason as string | null,
    createdAt: r.created_at as string,
  }));
  const log: LogRow[] = (lg.data ?? []).map((r) => ({ at: r.at as string, what: r.what as string, by: name(r.who) }));
  return { week, prevWeek, plan, items, log, ok };
}

/** Tags for the pipelines (founders only; empty for anyone else or when the plan can't be read). */
export async function getPlanTags(now: number, tasks: TaskRow[], productions: Map<string, Production>, rounds: Map<string, EditRound[]>): Promise<Record<string, PlanTag>> {
  const d = await getPlanData(now);
  if (!d.ok) return {};
  const byId = new Map(tasks.map((t) => [t.id, t]));
  return planTags(d.items, d.week, (i) => itemStage(i, byId, productions, rounds));
}
