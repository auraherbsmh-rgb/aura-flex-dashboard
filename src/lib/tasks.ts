import type { State as MetaState } from "./meta-shared";
import { createClient } from "@/lib/supabase/server";
import type { DetailsLite } from "@/lib/pipeline-shared";
import type { EditRound } from "@/lib/editing-shared";
import { OPEN_STATUSES, weekStartIso, type AngleHistoryRow, type AngleInfo, type Bands, type ConceptResult, type ChangeFacts, type CopywriterLoad, type CreateTaskContext, type DetailsPickers, type EditorLoad, type LaunchNames, type Prio, finalOrder, type ProdCard, type Production, type ScriptDetails, type Round, type TaskLite, type TaskRow, type TestimonialLite, type TestimonialRow } from "@/lib/tasks-shared";
import type { MapConcept, MapVariation } from "@/lib/map-shared";
export * from "@/lib/tasks-shared";

/** Reads every row in pages of 1,000 (the database returns at most 1,000 rows per request). */
export async function allRows<T>(what: string, page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
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
    reference: string | null; copywriter_id: string | null; awareness: string; angle_id: string; script_url: string | null; origin: string; change_facts: ChangeFacts | Record<string, never>;
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
          "id, status, due_on, created_at, keep_text, founder_note, reference, copywriter_id, awareness, angle_id, script_url, change_facts, origin, " +
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
      // Testimonial edit tasks have no copywriter (no script).
      copywriter: r.origin === "testimonial" ? "Testimonial" : r.writer?.display_name ?? "—", copywriterId: r.copywriter_id ?? "",
      avatarCode: r.avatar?.code ?? "?", awareness: r.awareness, angleId: r.angle_id, angle: r.angle?.label ?? "—", angleCode: r.angle?.code ?? "?",
      format: r.format?.label ?? "—", formatCode: r.format?.code ?? "?",
      keep: r.keep_text, note: r.founder_note, reference: r.reference, scriptUrl: r.script_url, origin: r.origin,
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
    supabase.from("script_details").select("face, shoot_on, generate, vo, main_argument_id, offer_bottles, variations, ad_set_name, confirmed_at").eq("task_id", task.id).maybeSingle(),
    supabase.from("ad_variations").select("v, hook_line, headline, ad_name, hook:list_items!ad_variations_hook_type_id_fkey(label)").eq("task_id", task.id).eq("active", true).order("v"),
    supabase.from("list_items").select("id, list, label").in("list", ["hook_type", "main_argument"]).eq("status", "approved").order("sort"),
  ]);
  // A failed read must not look like "no draft": the pop-up would open blank and Save draft would erase the real one.
  if (det.error || ads.error || lists.error) throw new Error("Could not read the script details. Reload the page.");
  type V = { hook_type_id?: string | null; hook_line?: string | null; headline?: string | null };
  type A = { v: number; hook_line: string; headline: string | null; ad_name: string; hook: { label: string } | null };
  const d = det.data;
  const details: ScriptDetails | null = d
    ? {
        face: d.face ?? "",
        shootOn: d.shoot_on ?? "",
        generate: d.generate,
        vo: !!d.vo,
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

/**
 * Everything the task view needs for every task in the board, read at once, so opening a task is instant.
 * One read for money, lists, details and hooks; "Already tried" per task, in parallel.
 */
export async function getBoardExtras(tasks: TaskRow[]): Promise<{
  line: number | null;
  pickers: DetailsPickers;
  details: Map<string, ScriptDetails>;
  history: Map<string, AngleHistoryRow[]>;
}> {
  const supabase = await createClient();
  type D = { task_id: string; face: string | null; shoot_on: string | null; generate: boolean; vo: boolean; main_argument_id: string | null; offer_bottles: number | null; variations: unknown; ad_set_name: string | null; confirmed_at: string | null };
  type A = { id: string; task_id: string; v: number; hook_line: string; headline: string | null; ad_name: string; hook: { label: string } | null };
  type H = { angle_id: string; task_id: string; avatar_code: string; awareness: string; format_label: string; status: string; created_at: string };
  const [money, lists, dets, ads, hists] = await Promise.all([
    supabase.from("money_settings").select("business_line_usd, price_1b_tnd, price_2b_tnd, price_3b_tnd").order("month", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("list_items").select("id, list, label").in("list", ["hook_type", "main_argument"]).eq("status", "approved").order("sort"),
    allRows("script details", (a, b) =>
      supabase.from("script_details").select("task_id, face, shoot_on, generate, vo, main_argument_id, offer_bottles, variations, ad_set_name, confirmed_at").order("task_id").range(a, b) as unknown as PromiseLike<{ data: D[] | null; error: unknown }>,
    ),
    allRows("hooks", (a, b) =>
      supabase.from("ad_variations").select("id, task_id, v, hook_line, headline, ad_name, hook:list_items!ad_variations_hook_type_id_fkey(label)").eq("active", true).order("id").range(a, b) as unknown as PromiseLike<{ data: A[] | null; error: unknown }>,
    ),
    supabase.rpc("angle_history_many", { p_angles: [...new Set(tasks.map((t) => t.angleId))] }),
  ]);
  if (lists.error) throw new Error("Could not read the lists. Reload the page.");
  const num = (x: unknown) => (x === null || x === undefined ? null : Number(x));
  const m = money.data;
  const rows = lists.data ?? [];
  const pickers: DetailsPickers = {
    hookTypes: rows.filter((r) => r.list === "hook_type").map((r) => ({ id: r.id, label: r.label })),
    mainArguments: rows.filter((r) => r.list === "main_argument").map((r) => ({ id: r.id, label: r.label })),
    prices: [num(m?.price_1b_tnd), num(m?.price_2b_tnd), num(m?.price_3b_tnd)],
  };
  const adsBy = new Map<string, ScriptDetails["ads"]>();
  for (const a of ads) {
    const l = adsBy.get(a.task_id) ?? [];
    l.push({ v: a.v, hookType: a.hook?.label ?? "—", hookLine: a.hook_line, headline: a.headline, adName: a.ad_name });
    adsBy.set(a.task_id, l);
  }
  type V = { hook_type_id?: string | null; hook_line?: string | null; headline?: string | null };
  const details = new Map<string, ScriptDetails>();
  for (const d of dets) {
    details.set(d.task_id, {
      face: d.face ?? "",
      shootOn: d.shoot_on ?? "",
      generate: d.generate,
      vo: !!d.vo,
      mainArgumentId: d.main_argument_id ?? "",
      offer: d.offer_bottles,
      variations: ((d.variations ?? []) as V[]).map((x) => ({ hookTypeId: x.hook_type_id ?? "", hookLine: x.hook_line ?? "", headline: x.headline ?? "" })),
      adSetName: d.ad_set_name,
      confirmedAt: d.confirmed_at,
      ads: (adsBy.get(d.task_id) ?? []).sort((x, y) => x.v - y.v),
    });
  }
  // One call for every angle on the board; each task then skips its own row (max 50 per task, newest first).
  if (hists.error) throw new Error("Could not read what was tried in each angle. Reload the page.");
  const byAngle = new Map<string, H[]>();
  for (const h of (hists.data ?? []) as H[]) byAngle.set(h.angle_id, [...(byAngle.get(h.angle_id) ?? []), h]);
  const history = new Map<string, AngleHistoryRow[]>(
    tasks.map((t) => [
      t.id,
      (byAngle.get(t.angleId) ?? []).filter((h) => h.task_id !== t.id).slice(0, 50).map((h) => ({
        cell: `${h.avatar_code} × ${h.awareness.replace("-Aware", "")}`,
        format: h.format_label,
        status: h.status,
        month: new Date(h.created_at).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "Africa/Tunis" }),
      })),
    ]),
  );
  return { line: num(m?.business_line_usd), pickers, details, history };
}

/** Script details of the tasks the viewer may see (face, shoot, confirmed), for the Scripts pipeline. */
export async function getDetailsLite(): Promise<DetailsLite[]> {
  const supabase = await createClient();
  type R = { task_id: string; face: string | null; shoot_on: string | null; generate: boolean; vo: boolean; confirmed_at: string | null };
  const rows = await allRows("script details", (a, b) =>
    supabase.from("script_details").select("task_id, face, shoot_on, generate, vo, confirmed_at").order("task_id").range(a, b) as unknown as PromiseLike<{ data: R[] | null; error: unknown }>,
  );
  return rows.map((r) => ({ taskId: r.task_id, face: r.face, shootOn: r.shoot_on, generate: r.generate, vo: !!r.vo, confirmedAt: r.confirmed_at }));
}

/** Productions the viewer may see, by task (founders all; a copywriter her own; an editor the ones assigned to her). */
export async function getProductions(): Promise<Map<string, Production>> {
  const supabase = await createClient();
  type R = {
    task_id: string; footage_url: string | null; all_hooks_shot: boolean | null; footage_gap: string | null; footage_at: string | null;
    editor_id: string | null; edit_due: string | null; brief: string | null; edit_reference: string | null; assigned_at: string | null;
    edit_started_at: string | null; final_url: string | null; launched_at: string | null; live_at: string | null; live_source: "manual" | "meta" | null;
    hold_at: string | null; hold_reason: string | null; inspiration_url: string | null;
    editor: { display_name: string } | null;
  };
  const rows = await allRows("production", (a, b) =>
    supabase
      .from("productions")
      .select("task_id, footage_url, all_hooks_shot, footage_gap, footage_at, editor_id, edit_due, brief, edit_reference, assigned_at, edit_started_at, final_url, launched_at, live_at, live_source, hold_at, hold_reason, inspiration_url, editor:people!productions_editor_id_fkey(display_name)")
      .order("task_id")
      .range(a, b) as unknown as PromiseLike<{ data: R[] | null; error: unknown }>,
  );
  return new Map(
    rows.map((r) => [
      r.task_id,
      {
        taskId: r.task_id, footageUrl: r.footage_url, allHooksShot: r.all_hooks_shot, footageGap: r.footage_gap, footageAt: r.footage_at,
        editorId: r.editor_id, editorName: r.editor?.display_name ?? (r.editor_id ? "an editor" : null), editDue: r.edit_due,
        brief: r.brief, reference: r.edit_reference, assignedAt: r.assigned_at, editStartedAt: r.edit_started_at,
        finalUrl: r.final_url, launchedAt: r.launched_at, liveAt: r.live_at, liveSource: r.live_source, holdAt: r.hold_at, holdReason: r.hold_reason, inspirationUrl: r.inspiration_url,
      },
    ]),
  );
}

/** Active editors with their queue (edits assigned to them), for the Assign pop-up. Founders only. */
export async function getEditors(productions: Map<string, Production>, tasks: TaskRow[]): Promise<EditorLoad[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("people").select("id, display_name, does_ai_3d").eq("role", "editor").eq("active", true).order("display_name");
  if (error) throw new Error("Could not read the editors. Reload the page.");
  const queue = new Map<string, number>();
  // Only live work counts: cancelled tasks keep their production row but are not in anyone's queue.
  const live = new Set(tasks.filter((t) => t.status === "details_done").map((t) => t.id));
  for (const p of productions.values()) if (p.editorId && p.assignedAt && live.has(p.taskId)) queue.set(p.editorId, (queue.get(p.editorId) ?? 0) + 1);
  return (data ?? []).map((e) => ({ id: e.id, name: e.display_name, doesAi: !!e.does_ai_3d, queue: queue.get(e.id) ?? 0 }));
}

/** Pop-up cards for confirmed scripts (needs the tasks and their Script details). */
export function prodCards(tasks: TaskRow[], details: DetailsLite[], hooksByTask: Map<string, number>): Map<string, ProdCard> {
  const det = new Map(details.map((d) => [d.taskId, d]));
  const out = new Map<string, ProdCard>();
  for (const t of tasks) {
    const d = det.get(t.id);
    if (t.status !== "details_done" || !d) continue;
    out.set(t.id, {
      taskId: t.id, face: d.face ?? t.angle, cell: `${t.avatarCode} × ${t.awareness.replace("-Aware", "")}`, angle: t.angle, format: t.format,
      copywriter: t.origin === "testimonial" ? "a support call" : t.copywriter, shootOn: d.shootOn, generate: d.generate, vo: !!d.vo, testimonial: t.origin === "testimonial", hooks: hooksByTask.get(t.id) ?? 0, confirmedAt: d.confirmedAt,
    });
  }
  return out;
}

/** Number of active ad variations (hooks) per task. */
export async function getHookCounts(): Promise<Map<string, number>> {
  const supabase = await createClient();
  const rows = await allRows("ad variations", (a, b) =>
    supabase.from("ad_variations").select("id, task_id").eq("active", true).order("id").range(a, b) as unknown as PromiseLike<{ data: { task_id: string }[] | null; error: unknown }>,
  );
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.task_id, (m.get(r.task_id) ?? 0) + 1);
  return m;
}

/** Edit versions (v1, v2…) the viewer may see, by task, oldest first. */
export async function getEditRounds(): Promise<Map<string, EditRound[]>> {
  const supabase = await createClient();
  type R = {
    task_id: string; round: number; video_url: string; submitted_at: string; decision: EditRound["decision"]; loom_url: string | null;
    note: string | null; decided_at: string | null; decider: { display_name: string } | null;
  };
  const rows = await allRows("edit versions", (a, b) =>
    supabase
      .from("edit_rounds")
      .select("task_id, round, video_url, submitted_at, decision, loom_url, note, decided_at, decider:people!edit_rounds_decided_by_fkey(display_name)")
      .order("id")
      .range(a, b) as unknown as PromiseLike<{ data: R[] | null; error: unknown }>,
  );
  const m = new Map<string, EditRound[]>();
  for (const r of rows) {
    const list = m.get(r.task_id) ?? [];
    list.push({ round: r.round, videoUrl: r.video_url, submittedAt: r.submitted_at, decision: r.decision, loom: r.loom_url, note: r.note, decidedBy: r.decider?.display_name ?? null, decidedAt: r.decided_at });
    m.set(r.task_id, list);
  }
  for (const list of m.values()) list.sort((a, b) => a.round - b.round);
  return m;
}

/** Pay rows the viewer may read (founders all; anyone their own): per-video pay and 3D rate by person. */
export async function getPay(): Promise<Map<string, { perVideo: number | null; rate3d: number | null }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("people_pay").select("person_id, pay_amount_tnd, pay_unit, rate_3d_tnd");
  if (error) throw new Error("Could not read pay. Reload the page.");
  const num = (x: unknown) => (x === null || x === undefined ? null : Number(x));
  return new Map((data ?? []).map((p) => [p.person_id as string, { perVideo: p.pay_unit === "per_video" ? num(p.pay_amount_tnd) : null, rate3d: num(p.rate_3d_tnd) }]));
}

/** Hooks (V#) of one task with their ad names, for the editor's "Hooks to deliver". */
export async function getHooks(taskId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ad_variations")
    .select("v, hook_line, headline, ad_name, hook:list_items!ad_variations_hook_type_id_fkey(label)")
    .eq("task_id", taskId)
    .eq("active", true)
    .order("v");
  if (error) throw new Error("Could not read the hooks. Reload the page.");
  type A = { v: number; hook_line: string; headline: string | null; ad_name: string; hook: { label: string } | null };
  return ((data ?? []) as unknown as A[]).map((a) => ({ v: a.v, type: a.hook?.label ?? "Testimonial", line: a.hook_line, headline: a.headline, name: a.ad_name }));
}

/** Ad set and ad names of every confirmed script, for the Launch pop-ups (founders). */
export async function getLaunchNames(): Promise<Map<string, LaunchNames>> {
  const supabase = await createClient();
  type V = { task_id: string; v: number; ad_name: string };
  type D = { task_id: string; ad_set_name: string | null };
  const [vars, sets] = await Promise.all([
    allRows("ad names", (a, b) =>
      supabase.from("ad_variations").select("id, task_id, v, ad_name").eq("active", true).order("id").range(a, b) as unknown as PromiseLike<{ data: V[] | null; error: unknown }>,
    ),
    allRows("ad set names", (a, b) =>
      supabase.from("script_details").select("task_id, ad_set_name").not("ad_set_name", "is", null).order("task_id").range(a, b) as unknown as PromiseLike<{ data: D[] | null; error: unknown }>,
    ),
  ]);
  const m = new Map<string, LaunchNames>();
  for (const d of sets) m.set(d.task_id, { adSetName: d.ad_set_name, ads: [] });
  for (const v of vars) {
    const x = m.get(v.task_id) ?? { adSetName: null, ads: [] };
    x.ads.push({ v: v.v, name: v.ad_name });
    m.set(v.task_id, x);
  }
  for (const x of m.values()) x.ads.sort((a, b) => a.v - b.v);
  return m;
}

/** Hooks (V#) of every task the viewer may see, with their ad names (one query), by task. */
export async function getAllHooks(): Promise<Map<string, { v: number; type: string; line: string; headline: string | null; name: string }[]>> {
  const supabase = await createClient();
  type A = { id: string; task_id: string; v: number; hook_line: string; headline: string | null; ad_name: string; hook: { label: string } | null };
  const rows = await allRows("hooks", (a, b) =>
    supabase
      .from("ad_variations")
      .select("id, task_id, v, hook_line, headline, ad_name, hook:list_items!ad_variations_hook_type_id_fkey(label)")
      .eq("active", true)
      .order("id")
      .range(a, b) as unknown as PromiseLike<{ data: A[] | null; error: unknown }>,
  );
  const m = new Map<string, { v: number; type: string; line: string; headline: string | null; name: string }[]>();
  for (const a of rows) {
    const list = m.get(a.task_id) ?? [];
    list.push({ v: a.v, type: a.hook?.label ?? "Testimonial", line: a.hook_line, headline: a.headline, name: a.ad_name });
    m.set(a.task_id, list);
  }
  for (const l of m.values()) l.sort((x, y) => x.v - y.v);
  return m;
}

/** Support-call recordings waiting to be tagged (TESTIMONIAL items). Founders only (row-level security). */
export async function getTestimonials(): Promise<TestimonialLite[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("testimonials").select("id, recording_url, note, added_at").eq("status", "new").order("added_at").limit(200);
  if (error) throw new Error("Could not read the testimonials. Reload the page.");
  return (data ?? []).map((r) => ({ id: r.id, url: r.recording_url, note: r.note, addedAt: r.added_at }));
}

/** Every testimonial (waiting, used, not usable), newest first, for the Editing → Testimonials list. Founders only. */
export async function getAllTestimonials(): Promise<TestimonialRow[]> {
  const supabase = await createClient();
  type R = {
    id: string; recording_url: string; note: string | null; status: TestimonialRow["status"]; reason: string | null; task_id: string | null;
    added_at: string; decided_at: string | null; decider: { display_name: string } | null;
  };
  const rows = await allRows("testimonials", (a, b) =>
    supabase
      .from("testimonials")
      .select("id, recording_url, note, status, reason, task_id, added_at, decided_at, decider:people!testimonials_decided_by_fkey(display_name)")
      .order("added_at", { ascending: false })
      .range(a, b) as unknown as PromiseLike<{ data: R[] | null; error: unknown }>,
  );
  return rows.map((r) => ({
    id: r.id, url: r.recording_url, note: r.note, status: r.status, reason: r.reason, taskId: r.task_id, addedAt: r.added_at,
    decidedAt: r.decided_at, decidedBy: r.decider?.display_name ?? null,
  }));
}

/** Every concept for the map (team-wide, names and states only) + the map start date (Settings). */
/** Meta results the viewer may read (RLS: founders all, a copywriter her own concepts). */
export async function getResults(): Promise<Record<string, ConceptResult>> {
  const supabase = await createClient();
  const { data } = await supabase.from("concept_results").select("task_id, state, state_since, ever_won, cpa7, line, sales7, spend7, best_v, live, variations, seen_state, winner_noted_at, won_at, totals");
  const out: Record<string, ConceptResult> = {};
  for (const r of data ?? []) {
    out[r.task_id as string] = {
      taskId: r.task_id as string, state: r.state as ConceptResult["state"], stateSince: r.state_since as string, everWon: !!r.ever_won,
      cpa7: r.cpa7 === null ? null : Number(r.cpa7), line: Number(r.line), sales7: r.sales7 as number, spend7: Number(r.spend7), bestV: r.best_v as number | null,
      live: !!r.live, variations: (r.variations ?? []) as ConceptResult["variations"], seenState: r.seen_state as string | null, winnerNotedAt: r.winner_noted_at as string | null, wonAt: r.won_at as string | null,
      totals: r.totals && Object.keys(r.totals as object).length ? (r.totals as ConceptResult["totals"]) : undefined,
    };
  }
  return out;
}

/** Format bands for opening / hold / clicks (the whole team reads them; founders edit them in Settings). */
export async function getBands(): Promise<Bands | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("script_part_bands");
  if (!data) return null;
  const n = (x: unknown) => (x === null || x === undefined ? null : Number(x));
  const d = data as Record<string, unknown>;
  return { on: !!d.on, hook: n(d.hook), hold: n(d.hold), ctrVideo: n(d.ctrVideo), ctrImage: n(d.ctrImage), minImpressions: n(d.minImpressions) };
}

/** Production order for scripts in production (not launched, not on hold, edit not approved), with the reasons. */
export async function getPriority(): Promise<Record<string, Prio>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("production_order");
  if (error) { console.error(`[prio] production order not read: ${error.message}`); return {}; }
  type R = {
    task_id: string; sug: number; grp: 1 | 2 | 3 | 4; order_rank: number | null; due_on: string;
    winner_task: string | null; winner_face: string | null; winner_state: string | null; winner_cpa7: number | null; winner_line: number | null;
    winner_spend_day: number | null; winner_sales_day: number | null; winner_since: string | null;
    cell_alive: number; cell_best_cpa: number | null; cell_spend_day: number | null; cell_tested: number; cell_won: number; cell_lost: number;
  };
  const rows = (data ?? []) as R[];
  const n = (x: number | string | null) => (x === null ? null : Number(x));
  const pos = finalOrder(rows.map((r) => ({ id: r.task_id, sug: r.sug, rank: n(r.order_rank) })));
  return Object.fromEntries(rows.map((r) => [r.task_id, {
    pos: pos.get(r.task_id) ?? r.sug, sug: r.sug, grp: r.grp, manual: r.order_rank !== null, dueOn: r.due_on,
    why: {
      winner: r.winner_task ? { taskId: r.winner_task, face: r.winner_face, state: r.winner_state, cpa7: n(r.winner_cpa7), line: n(r.winner_line), spendDay: n(r.winner_spend_day), salesDay: n(r.winner_sales_day), since: r.winner_since } : null,
      cell: { alive: r.cell_alive, bestCpa: n(r.cell_best_cpa), spendDay: n(r.cell_spend_day), tested: r.cell_tested, won: r.cell_won, lost: r.cell_lost },
    },
  } satisfies Prio]));
}

export async function getMapData(): Promise<{ concepts: MapConcept[]; start: string | null; results: Record<string, ConceptResult>; bands: Bands | null; prio: Record<string, Prio> }> {
  const supabase = await createClient();
  type R = {
    task_id: string; avatar_id: string; avatar_code: string; awareness: string; angle_id: string; angle_label: string; angle_code: string; angle_track: string | null;
    format_label: string; format_code: string; origin: string; status: string; copywriter: string | null; created_at: string; face: string | null;
    generate: boolean; vo: boolean; launched_at: string | null; live_at: string | null; hold_at: string | null; variations: MapVariation[] | null;
    result_state: MetaState | null; ever_won: boolean;
  };
  const [rows, start, results, bands, prio] = await Promise.all([
    supabase.rpc("map_concepts2"),
    supabase.from("app_dates").select("value").eq("key", "map_start").maybeSingle(),
    getResults(),
    getBands(),
    getPriority(),
  ]);
  if (rows.error) throw new Error("Could not read the map. Reload the page.");
  const concepts = ((rows.data ?? []) as R[]).map((r) => ({
    taskId: r.task_id, avatarId: r.avatar_id, avatarCode: r.avatar_code, awareness: r.awareness, angleId: r.angle_id, angle: r.angle_label,
    angleCode: r.angle_code, track: r.angle_track, format: r.format_label, formatCode: r.format_code, origin: r.origin, status: r.status,
    copywriter: r.copywriter, createdAt: r.created_at, face: r.face, generate: r.generate, vo: r.vo, launchedAt: r.launched_at, liveAt: r.live_at,
    holdAt: r.hold_at, variations: r.variations ?? [], resultState: r.result_state, everWon: r.ever_won,
  }));
  return { concepts, start: (start.data?.value as string | null) ?? null, results, bands, prio };
}
