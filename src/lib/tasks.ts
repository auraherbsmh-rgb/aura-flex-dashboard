import { createClient } from "@/lib/supabase/server";
import { OPEN_STATUSES, weekStartIso, type AngleHistoryRow, type AngleInfo, type ChangeFacts, type CopywriterLoad, type CreateTaskContext, type DetailsPickers, type ScriptDetails, type Round, type TaskLite, type TaskRow } from "@/lib/tasks-shared";
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

/** Tasks the viewer may see (founders all, a copywriter her own) with their review rounds; open ones first, then by due date. */
export async function getTasks(): Promise<TaskRow[]> {
  const supabase = await createClient();
  type Row = {
    id: string; status: string; due_on: string; created_at: string; keep_text: string | null; founder_note: string | null;
    reference: string | null; copywriter_id: string; awareness: string; angle_id: string; script_url: string | null; change_facts: ChangeFacts | Record<string, never>;
    writer: { display_name: string } | null; avatar: { code: string } | null; angle: { label: string; code: string } | null; format: { label: string; code: string } | null;
  };
  type RoundRow = {
    task_id: string; round: number; script_url: string; submitted_at: string; decision: Round["decision"]; loom_url: string | null; note: string | null;
    decided_at: string | null; sender: { display_name: string } | null; decider: { display_name: string } | null;
  };
  const [rows, rounds] = await Promise.all([
    allRows("tasks", (a, b) =>
      supabase
        .from("tasks")
        .select(
          "id, status, due_on, created_at, keep_text, founder_note, reference, copywriter_id, awareness, angle_id, script_url, change_facts, " +
            "writer:people!tasks_copywriter_id_fkey(display_name), avatar:list_items!tasks_avatar_id_fkey(code), " +
            "angle:list_items!tasks_angle_id_fkey(label, code), format:list_items!tasks_format_id_fkey(label, code)",
        )
        .neq("status", "cancelled")
        .order("id")
        .range(a, b) as unknown as PromiseLike<{ data: Row[] | null; error: unknown }>,
    ),
    allRows("script rounds", (a, b) =>
      supabase
        .from("script_rounds")
        .select(
          "task_id, round, script_url, submitted_at, decision, loom_url, note, decided_at, " +
            "sender:people!script_rounds_submitted_by_fkey(display_name), decider:people!script_rounds_decided_by_fkey(display_name)",
        )
        .order("id")
        .range(a, b) as unknown as PromiseLike<{ data: RoundRow[] | null; error: unknown }>,
    ),
  ]);
  const byTask = new Map<string, Round[]>();
  for (const r of rounds) {
    const list = byTask.get(r.task_id) ?? [];
    list.push({
      round: r.round, scriptUrl: r.script_url, submittedAt: r.submitted_at, submittedBy: r.sender?.display_name ?? "—",
      decision: r.decision, loom: r.loom_url, note: r.note, decidedBy: r.decider?.display_name ?? null, decidedAt: r.decided_at,
    });
    byTask.set(r.task_id, list);
  }
  return rows
    .map((r) => ({
      id: r.id, status: r.status, dueOn: r.due_on, createdAt: r.created_at,
      copywriter: r.writer?.display_name ?? "—", copywriterId: r.copywriter_id,
      avatarCode: r.avatar?.code ?? "?", awareness: r.awareness, angleId: r.angle_id, angle: r.angle?.label ?? "—", angleCode: r.angle?.code ?? "?",
      format: r.format?.label ?? "—", formatCode: r.format?.code ?? "?",
      keep: r.keep_text, note: r.founder_note, reference: r.reference, scriptUrl: r.script_url,
      changeFacts: "untried" in (r.change_facts ?? {}) ? (r.change_facts as ChangeFacts) : null,
      rounds: (byTask.get(r.id) ?? []).sort((x, y) => x.round - y.round),
    }))
    .sort((a, b) => Number(OPEN_STATUSES.includes(b.status)) - Number(OPEN_STATUSES.includes(a.status)) || a.dueOn.localeCompare(b.dueOn));
}

/** "Already tried in this angle" (other tasks in the same angle, no names) and the business line, for the task view. */
export async function getTaskExtras(task: TaskRow): Promise<{
  history: AngleHistoryRow[];
  line: number | null;
  details: ScriptDetails | null;
  pickers: DetailsPickers;
}> {
  const supabase = await createClient();
  const [hist, money, det, ads, lists] = await Promise.all([
    supabase.rpc("angle_history", { p_angle: task.angleId, p_exclude: task.id }),
    supabase.from("money_settings").select("business_line_usd, price_1b_tnd, price_2b_tnd, price_3b_tnd").order("month", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("script_details").select("face, shoot_on, generate, main_argument_id, offer_bottles, variations, ad_set_name, confirmed_at").eq("task_id", task.id).maybeSingle(),
    supabase.from("ad_variations").select("v, hook_line, headline, ad_name, hook:list_items!ad_variations_hook_type_id_fkey(label)").eq("task_id", task.id).eq("active", true).order("v"),
    supabase.from("list_items").select("id, list, label").in("list", ["hook_type", "main_argument"]).eq("status", "approved").order("sort"),
  ]);
  type V = { hook_type_id?: string | null; hook_line?: string | null; headline?: string | null };
  type A = { v: number; hook_line: string; headline: string | null; ad_name: string; hook: { label: string } | null };
  const d = det.data;
  const details: ScriptDetails | null = d
    ? {
        face: d.face ?? "",
        shootOn: d.shoot_on ?? "",
        generate: d.generate,
        mainArgumentId: d.main_argument_id ?? "",
        offer: d.offer_bottles,
        variations: ((d.variations ?? []) as V[]).map((x) => ({ hookTypeId: x.hook_type_id ?? "", hookLine: x.hook_line ?? "", headline: x.headline ?? "" })),
        adSetName: d.ad_set_name,
        confirmedAt: d.confirmed_at,
        ads: ((ads.data ?? []) as unknown as A[]).map((a) => ({ v: a.v, hookType: a.hook?.label ?? "—", hookLine: a.hook_line, headline: a.headline, adName: a.ad_name })),
      }
    : null;
  const rows = lists.data ?? [];
  const m = money.data;
  const num = (x: unknown) => (x === null || x === undefined ? null : Number(x));
  const pickers: DetailsPickers = {
    hookTypes: rows.filter((r) => r.list === "hook_type").map((r) => ({ id: r.id, label: r.label })),
    mainArguments: rows.filter((r) => r.list === "main_argument").map((r) => ({ id: r.id, label: r.label })),
    prices: [num(m?.price_1b_tnd), num(m?.price_2b_tnd), num(m?.price_3b_tnd)],
  };
  type H = { avatar_code: string; awareness: string; format_label: string; status: string; created_at: string };
  const history = ((hist.data ?? []) as H[]).map((h) => ({
    cell: `${h.avatar_code} × ${h.awareness.replace("-Aware", "")}`,
    format: h.format_label,
    status: h.status,
    month: new Date(h.created_at).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "Africa/Tunis" }),
  }));
  return { history, line: num(m?.business_line_usd), details, pickers };
}
