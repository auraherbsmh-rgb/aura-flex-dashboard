import { createClient } from "@/lib/supabase/server";
import { weekStartIso, type AngleInfo, type CopywriterLoad, type CreateTaskContext, type TaskLite, type TaskRow } from "@/lib/tasks-shared";
export * from "@/lib/tasks-shared";

/** Reads every row in pages of 1,000 (the database returns at most 1,000 rows per request). */
async function allRows<T>(what: string, page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(`Could not read ${what}. Reload the page.`);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

/** What the Create task pop-up needs: angle core messages, past tasks (for CHANGE), copywriters with their load. */
export async function getCreateTaskContext(): Promise<CreateTaskContext> {
  const supabase = await createClient();
  const since = weekStartIso();
  const [angles, taskRows, people, pay, approvals] = await Promise.all([
    supabase.from("list_items").select("id, code, label, core_message").eq("list", "angle").eq("status", "approved").order("sort"),
    allRows("tasks", (a, b) =>
      supabase.from("tasks").select("id, avatar_id, awareness, angle_id, format_id, status, copywriter_id").neq("status", "cancelled").order("id").range(a, b),
    ),
    supabase.from("people").select("id, display_name").eq("role", "copywriter").eq("active", true).order("display_name"),
    supabase.from("people_pay").select("person_id, weekly_target"),
    // Scripts approved this week: a task's status changed to "approved" since Monday (from the step log).
    allRows("the step log", (a, b) => supabase.from("step_log").select("id, entity_id, detail").eq("entity_type", "tasks").gte("at", since).order("id").range(a, b)),
  ]);

  // Each task counts once, even if approved, sent back and approved again in the same week.
  const approvedBy = new Map<string, Set<string>>();
  const taskOwner = new Map(taskRows.map((t) => [t.id, t.copywriter_id as string]));
  for (const row of approvals) {
    const to = (row.detail as { changed?: { status?: { to?: string } } })?.changed?.status?.to;
    const owner = row.entity_id ? taskOwner.get(row.entity_id) : undefined;
    if (to === "approved" && owner) approvedBy.set(owner, (approvedBy.get(owner) ?? new Set()).add(row.entity_id as string));
  }
  const targetBy = new Map((pay.data ?? []).map((p) => [p.person_id as string, p.weekly_target as number | null]));
  const copywriters: CopywriterLoad[] = (people.data ?? []).map((p) => ({
    id: p.id,
    name: p.display_name,
    target: targetBy.get(p.id) ?? null,
    approvedThisWeek: approvedBy.get(p.id)?.size ?? 0,
    openTasks: taskRows.filter((t) => t.copywriter_id === p.id && ["writing", "review", "changes"].includes(t.status)).length,
  }));

  const lite: TaskLite[] = taskRows.map((t) => ({
    id: t.id, avatarId: t.avatar_id, awareness: t.awareness, angleId: t.angle_id, formatId: t.format_id, status: t.status,
  }));
  const angleInfo: AngleInfo[] = (angles.data ?? []).map((a) => ({ id: a.id, code: a.code, label: a.label, coreMessage: a.core_message }));
  return { angles: angleInfo, tasks: lite, copywriters };
}

/** Tasks the viewer may see (founders all, a copywriter her own), open ones first, then by due date. */
export async function getTasks(): Promise<TaskRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tasks")
    .select(
      "id, status, due_on, created_at, keep_text, founder_note, reference, copywriter_id, " +
        "writer:people!tasks_copywriter_id_fkey(display_name), avatar:list_items!tasks_avatar_id_fkey(code), " +
        "angle:list_items!tasks_angle_id_fkey(label), format:list_items!tasks_format_id_fkey(label), awareness",
    )
    .neq("status", "cancelled")
    .order("due_on")
    .limit(300);
  type Row = {
    id: string; status: string; due_on: string; created_at: string; keep_text: string | null; founder_note: string | null;
    reference: string | null; copywriter_id: string; awareness: string;
    writer: { display_name: string } | null; avatar: { code: string } | null; angle: { label: string } | null; format: { label: string } | null;
  };
  const open = ["writing", "changes", "review"];
  return ((data ?? []) as unknown as Row[])
    .map((r) => ({
      id: r.id, status: r.status, dueOn: r.due_on, createdAt: r.created_at,
      copywriter: r.writer?.display_name ?? "—", copywriterId: r.copywriter_id,
      avatarCode: r.avatar?.code ?? "?", awareness: r.awareness, angle: r.angle?.label ?? "—", format: r.format?.label ?? "—",
      keep: r.keep_text, note: r.founder_note, reference: r.reference,
    }))
    .sort((a, b) => Number(open.includes(b.status)) - Number(open.includes(a.status)) || a.dueOn.localeCompare(b.dueOn));
}
