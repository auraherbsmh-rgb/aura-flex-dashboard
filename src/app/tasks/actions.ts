"use server";

import { getFounderNames, withFounderNames } from "@/lib/founders";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { text, toConceptTag, toNameCode } from "@/lib/parse";
import { AWARENESS } from "@/lib/proposals-shared";
import { changeFacts, tunisDate, type TaskLite } from "@/lib/tasks-shared";

export type TaskState = { ok?: string; error?: string; at?: number };
const done = (ok: string): TaskState => ({ ok, at: Date.now() });
const fail = (error: string): TaskState => ({ error, at: Date.now() });

const NEW = "__new__";

/** Today in Tunisia (UTC+1 all year) as YYYY-MM-DD. */
const tunisToday = () => tunisDate(0);

/**
 * Founder creates a task for a copywriter (Create task pop-up, handoff §7).
 * KEEP = the angle's core message, CHANGE = facts of what was tried in this cell and angle — both saved with the task
 * as they were at creation. A new angle is created approved (a founder creating it is the decision), in the same
 * database transaction as the task (public.create_task).
 */
export async function createTask(_prev: TaskState, form: FormData): Promise<TaskState> {
  const v = await getViewer();
  if (v.role !== "founder_1" && v.role !== "founder_2") return fail("Only founders create tasks.");

  const avatarId = text(form.get("avatar_id"));
  const awareness = text(form.get("awareness"));
  const angle = text(form.get("angle_id"));
  const newName = text(form.get("new_angle_name"));
  const track = text(form.get("track")) || "knee";
  const formatId = text(form.get("format_id"));
  const due = text(form.get("due_on"));
  const reference = text(form.get("reference"));
  const note = text(form.get("founder_note"));
  const copywriterId = text(form.get("copywriter_id"));
  const proposalId = text(form.get("proposal_id")) || null;

  if (!avatarId) return fail("Pick the avatar.");
  if (!(AWARENESS as readonly string[]).includes(awareness)) return fail("Pick the awareness level.");
  if (!angle) return fail("Pick an angle, or “+ New angle…”.");
  if (angle === NEW && newName.length < 2) return fail("Give the new angle a name.");
  if (newName.length > 80) return fail("Keep the angle name under 80 characters.");
  const newCode = angle === NEW ? toNameCode(newName) : null;
  if (angle === NEW && !newCode) return fail("Write the angle name with Latin letters: it goes into ad names.");
  if (!formatId) return fail("Pick the format.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return fail("Pick the due date.");
  if (due < tunisToday()) return fail("The due date is in the past.");
  if (reference.length > 500) return fail("Keep the reference under 500 characters.");
  if (note.length > 1000) return fail("Keep the note under 1,000 characters.");
  if (!copywriterId) return fail("Pick the copywriter.");

  const supabase = await createClient();

  // CHANGE box facts, recomputed here from the database (not trusted from the browser).
  // A new angle has no tasks yet: every video format is untried.
  const [tasks, formats] = await Promise.all([
    angle === NEW
      ? Promise.resolve({ data: [] as { id: string; avatar_id: string; awareness: string; angle_id: string; format_id: string; status: string }[] })
      : supabase.from("tasks").select("id, avatar_id, awareness, angle_id, format_id, status")
          .eq("angle_id", angle).eq("avatar_id", avatarId).eq("awareness", awareness).neq("status", "cancelled").limit(1000),
    supabase.from("list_items").select("id, label, code").eq("list", "format").eq("status", "approved").order("sort"),
  ]);
  const lite: TaskLite[] = (tasks.data ?? []).map((t) => ({
    id: t.id, avatarId: t.avatar_id, awareness: t.awareness, angleId: t.angle_id, formatId: t.format_id, status: t.status,
  }));
  const facts = changeFacts(lite, { avatarId, awareness, angleId: angle }, (formats.data ?? []).filter((f) => f.code !== "IMG"));

  const { data: newId, error } = await supabase.rpc("create_task", {
    p_copywriter: copywriterId,
    p_avatar: avatarId,
    p_awareness: awareness,
    p_angle: angle === NEW ? null : angle,
    p_new_angle_code: newCode,
    p_track: track,
    p_format: formatId,
    p_due: due,
    p_reference: reference,
    p_note: note,
    p_change: facts,
    p_proposal: proposalId,
  });
  if (error) return fail(error.code === "23505" ? "This proposal already has a task. Reload the page." : plain(error));
  // Created from an ALERT item: saved as the fading winner's successor.
  if (form.get("successor") === "1" && newId) {
    const of = String(form.get("successor_of") ?? "");
    const mark = await supabase.rpc("mark_successor2", { p_task: newId as string, p_of: /^[0-9a-f-]{36}$/i.test(of) ? of : null });
    if (mark.error) { revalidatePath("/", "layout"); return done("Task created, but it could not be marked as a successor."); }
  }
  // Created from the Monday plan: the plan item follows this task from now on.
  const planItem = String(form.get("plan_item") ?? "");
  if (planItem && newId && /^[0-9a-f-]{36}$/i.test(planItem)) {
    const link = await supabase.rpc("plan_link_task", { p_item: planItem, p_task: newId as string });
    if (link.error) { revalidatePath("/", "layout"); return done("Task created, but it could not be linked to the week plan."); }
  }
  revalidatePath("/", "layout");
  return done("Task created. It is in the copywriter’s list now.");
}

const LINK = /^https:\/\/\S+\.\S+$/i; // https only, as every message says

/** Our own database messages (raised by the functions, code P0001) are written for people; anything else is not. */
const plain = (e: { code?: string; message: string }) => (e.code === "P0001" ? e.message : "Not saved. Reload the page and try again.");

/** Copywriter (her own task) or a founder sends the script link for review. writing / changes → review. */
export async function submitScript(taskId: string, url: string): Promise<TaskState> {
  const v = await getViewer();
  if (!["founder_1", "founder_2", "copywriter"].includes(v.role)) return fail("Only copywriters and founders send scripts.");
  const link = url.trim();
  if (!LINK.test(link)) return fail("Paste the full script link (starting with https://).");
  if (link.length > 1000) return fail("That link is too long.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_script", { p_task: taskId, p_url: link });
  if (error) return fail(plain(error));
  revalidatePath("/", "layout");
  return done(withFounderNames(v.role === "founder_1" ? `Sent for review (round ${data}). It is now a REVIEW item on your Home.` : `Sent for review (round ${data}). Founder 1 gets it on Home.`, await getFounderNames()));
}

/** Founder decides on the round in review. Needs changes: Loom optional, one line required when there is no Loom. */
export async function reviewScript(taskId: string, round: number, decision: "approved" | "changes", loom: string, note: string): Promise<TaskState> {
  const v = await getViewer();
  if (v.role !== "founder_1" && v.role !== "founder_2") return fail("Only founders review scripts.");
  const l = loom.trim();
  const n = note.trim();
  if (l && !LINK.test(l)) return fail("The Loom link must start with https://.");
  if (l.length > 1000) return fail("That Loom link is too long.");
  if (decision === "changes" && !l && !n) return fail("Write one line on what to fix (or add a Loom).");
  if (n.length > 1000) return fail("Keep the note under 1,000 characters.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_script", { p_task: taskId, p_round: round, p_decision: decision, p_loom: l, p_note: n });
  if (error) return fail(plain(error));
  revalidatePath("/", "layout");
  return done(decision === "approved" ? "Approved. Her inbox now says: fill script details." : "Sent back with your note. She sees it at the top of her inbox.");
}

export type DetailsInput = {
  face: string;
  shootOn: string;
  generate: boolean;
  /** VO (no shoot): a voice recording replaces the raw footage. */
  vo: boolean;
  mainArgumentId: string;
  offer: number | null;
  variations: { hookTypeId: string; hookLine: string; headline: string }[];
};

/**
 * Script details (after approval): save a draft, or confirm. Confirm needs every ● field and 5–6 variations;
 * the database then writes one ad name per variation and hands the script to production.
 */
export async function saveScriptDetails(taskId: string, input: DetailsInput, confirm: boolean): Promise<TaskState> {
  const v = await getViewer();
  if (!["founder_1", "founder_2", "copywriter"].includes(v.role)) return fail("Only copywriters and founders fill script details.");
  const face = input.face.trim();
  if (face.length > 60) return fail("Keep the face name short (first name only).");
  const tag = toConceptTag(face);
  if (face && !tag) return fail("Use Latin letters or digits (it goes into ad names).");
  if (input.variations.length > 6) return fail("At most 6 variations.");
  if (input.shootOn && !/^\d{4}-\d{2}-\d{2}$/.test(input.shootOn)) return fail("Pick the shoot date from the calendar.");
  const offer = input.offer && [1, 2, 3].includes(input.offer) ? input.offer : null;
  const vars = input.variations.map((x) => ({ hook_type_id: x.hookTypeId || null, hook_line: x.hookLine.trim(), headline: x.headline.trim() }));
  if (vars.some((x) => x.hook_line.length > 300)) return fail("Keep each hook line under 300 characters.");
  if (vars.some((x) => x.headline.length > 200)) return fail("Keep each headline under 200 characters.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_script_details2", {
    p_task: taskId,
    p_face: face,
    p_tag: tag,
    p_shoot: input.generate || input.vo ? null : input.shootOn || null,
    p_generate: input.generate,
    p_arg: input.mainArgumentId || null,
    p_offer: offer,
    p_vars: vars,
    p_confirm: confirm,
    p_vo: !input.generate && input.vo,
  });
  if (error) return fail(error.code === "23505" ? "One of these ad names is already used. Use another word for the face." : plain(error));
  revalidatePath("/", "layout");
  return done(confirm ? "Details confirmed. The ad names are ready and the script is handed to production." : "Draft saved.");
}

/** Footage received (founders): raw Drive link + "the agency shot all hooks", or one line on what is missing. */
export async function markFootage(taskId: string, url: string, allHooks: boolean, gap: string): Promise<TaskState> {
  const v = await getViewer();
  if (v.role !== "founder_1" && v.role !== "founder_2") return fail("Only founders mark footage received.");
  const link = url.trim();
  if (!LINK.test(link)) return fail("Paste the full Drive link (starting with https://).");
  if (link.length > 1000) return fail("That link is too long.");
  if (!allHooks && gap.trim().length < 2) return fail("Say in one line what the agency did not shoot.");
  if (gap.length > 500) return fail("Keep the missing-footage note short.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_footage", { p_task: taskId, p_url: link, p_all_hooks: allHooks, p_gap: gap.trim() });
  if (error) return fail(plain(error));
  revalidatePath("/", "layout");
  return done("Footage received. It is now an ASSIGN item.");
}

/** Assign the edit (founders): editor, due date, one-box brief, optional reference. */
export async function assignEdit(taskId: string, editorId: string, due: string, brief: string, reference: string): Promise<TaskState> {
  const v = await getViewer();
  if (v.role !== "founder_1" && v.role !== "founder_2") return fail("Only founders assign edits.");
  if (!editorId) return fail("Pick the editor.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return fail("Pick the due date.");
  if (due < tunisDate(0)) return fail("The due date is in the past.");
  if (brief.trim().length < 3) return fail("Write the brief (one text box).");
  if (brief.length > 2000) return fail("Keep the brief under 2,000 characters.");
  if (reference.length > 1000) return fail("That reference is too long.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_edit", { p_task: taskId, p_editor: editorId, p_due: due, p_brief: brief.trim(), p_ref: reference.trim() });
  if (error) return fail(plain(error));
  revalidatePath("/", "layout");
  return done("Assigned. It is in the editor’s queue.");
}

/** The assigned editor (or a founder) starts editing: Ready → Editing. */
export async function startEdit(taskId: string): Promise<TaskState> {
  const v = await getViewer();
  if (!["founder_1", "founder_2", "editor"].includes(v.role)) return fail("Only the editor starts an edit.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("start_edit", { p_task: taskId });
  if (error) return fail(plain(error));
  revalidatePath("/", "layout");
  return done(withFounderNames("Started. Founder 2 sees it as Editing.", await getFounderNames()));
}

/** The editor sends a version (Drive link): v1, v2… */
export async function submitEdit(taskId: string, url: string): Promise<TaskState> {
  const v = await getViewer();
  if (!["founder_1", "founder_2", "editor"].includes(v.role)) return fail("Only the editor sends versions.");
  const link = url.trim();
  if (!LINK.test(link)) return fail("Paste the full Drive link (starting with https://).");
  if (link.length > 1000) return fail("That link is too long.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_edit", { p_task: taskId, p_url: link });
  if (error) return fail(plain(error));
  revalidatePath("/", "layout");
  return done(withFounderNames(`v${data} sent. Founder 2 gets it on Home.`, await getFounderNames()));
}

/** Founder review of an edit version: Approve, or Needs changes (Loom optional; one line required without a Loom). */
export async function reviewEdit(taskId: string, round: number, decision: "approved" | "changes", loom: string, note: string): Promise<TaskState> {
  const v = await getViewer();
  if (v.role !== "founder_1" && v.role !== "founder_2") return fail("Only founders review edits.");
  const l = loom.trim();
  const n = note.trim();
  if (l && !LINK.test(l)) return fail("The Loom link must start with https://.");
  if (l.length > 1000) return fail("That Loom link is too long.");
  if (decision === "changes" && !l && !n) return fail("Write one line on what to fix (or add a Loom).");
  if (n.length > 1000) return fail("Keep the note under 1,000 characters.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_edit", { p_task: taskId, p_round: round, p_decision: decision, p_loom: l, p_note: n });
  if (error) return fail(plain(error));
  revalidatePath("/", "layout");
  return done(decision === "approved" ? "Approved. Upload the final to Drive; launching comes next." : "Sent back with your note. It is at the top of the editor’s queue.");
}

/** Launch (founders): "Done" = launched in Meta with these names; "Mark live" = the fallback when Meta can't confirm. */
export async function launchConcept(taskId: string, finalUrl: string, markLive: boolean): Promise<TaskState> {
  const v = await getViewer();
  if (v.role !== "founder_1" && v.role !== "founder_2") return fail("Only founders launch.");
  const f = finalUrl.trim();
  if (f && !LINK.test(f)) return fail("The final videos link must start with https://.");
  if (f.length > 1000) return fail("That link is too long.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("launch_concept", { p_task: taskId, p_final: f, p_mark_live: markLive });
  if (error) return fail(plain(error));
  revalidatePath("/", "layout");
  return done(markLive ? "Marked live." : "Launched. It turns Live by itself once Meta is connected and finds these names.");
}

/** On hold / Resume (founders): pauses a video in production so another script can go first. */
export async function setHold(taskId: string, hold: boolean, reason: string): Promise<TaskState> {
  const v = await getViewer();
  if (v.role !== "founder_1" && v.role !== "founder_2") return fail("Only founders put a video on hold.");
  const r = reason.trim();
  if (r.length > 300) return fail("Keep the reason short.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_production_hold", { p_task: taskId, p_hold: hold, p_reason: hold ? r : "" });
  if (error) return fail(plain(error));
  revalidatePath("/", "layout");
  return done(hold ? "On hold. Its late alerts and Home items stop until you resume it." : "Resumed. Alerts and Home items are back.");
}

/** The founders' production order: the full list of in-production task ids, first = #1 (arrows, or ✓ Use suggested order). */
export async function setProductionOrder(ids: string[], version: number): Promise<TaskState & { version?: number }> {
  const v = await getViewer();
  if (v.role !== "founder_1" && v.role !== "founder_2") return fail("Only founders change the production order.");
  if (!ids.length || ids.length > 500 || ids.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) return fail("Reload the page and try again.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_production_order2", { p_ids: ids, p_version: version });
  if (error) return fail(plain(error));
  revalidatePath("/", "layout");
  return { ...done("Order saved. Everyone sees it."), version: Number(data) };
}

/** VO received (founders): the voice recording link + an optional inspiration link for the editor. */
export async function markVo(taskId: string, url: string, inspiration: string): Promise<TaskState> {
  const v = await getViewer();
  if (v.role !== "founder_1" && v.role !== "founder_2") return fail("Only founders mark the VO received.");
  const u = url.trim();
  const i = inspiration.trim();
  if (!LINK.test(u)) return fail("Paste the full link to the VO recording (starting with https://).");
  if (i && !LINK.test(i)) return fail("The inspiration link must start with https://.");
  if (u.length > 1000 || i.length > 1000) return fail("That link is too long.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_vo", { p_task: taskId, p_url: u, p_inspiration: i });
  if (error) return fail(plain(error));
  revalidatePath("/", "layout");
  return done("VO received. The task is ready to assign to an editor.");
}

/** Testimonial (founders): save a support-call recording to tag later (TESTIMONIAL item on Founder 2's Home). */
export async function addTestimonial(url: string, note: string): Promise<TaskState> {
  const v = await getViewer();
  if (v.role !== "founder_1" && v.role !== "founder_2") return fail("Only founders add testimonials.");
  const u = url.trim();
  if (!LINK.test(u)) return fail("Paste the full link to the recording (starting with https://).");
  if (u.length > 1000) return fail("That link is too long.");
  if (note.trim().length > 300) return fail("Keep the note short.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_testimonial", { p_url: u, p_note: note.trim() });
  if (error) return fail(plain(error));
  revalidatePath("/", "layout");
  return done(withFounderNames("Saved. It waits as a TESTIMONIAL item on Founder 2’s Home.", await getFounderNames()));
}

/** Testimonial: Not usable (discards a waiting recording). */
export async function testimonialNotUsable(id: string, reason: string): Promise<TaskState> {
  const v = await getViewer();
  if (v.role !== "founder_1" && v.role !== "founder_2") return fail("Only founders decide on testimonials.");
  if (reason.trim().length > 300) return fail("Keep the reason short.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("testimonial_not_usable", { p_id: id, p_reason: reason.trim() });
  if (error) return fail(plain(error));
  revalidatePath("/", "layout");
  return done("Marked not usable.");
}

export type TestimonialInput = {
  id: string | null;
  url: string;
  note: string;
  avatarId: string;
  awareness: string;
  angleId: string;
  face: string;
  brief: string;
  hooks: number;
};

/** Testimonial tag → edit task (UGC + testimonial, skips script and shoot); the next step is Assign. Returns the task id. */
export async function tagTestimonial(input: TestimonialInput): Promise<TaskState & { taskId?: string }> {
  const v = await getViewer();
  if (v.role !== "founder_1" && v.role !== "founder_2") return fail("Only founders tag testimonials.");
  const u = input.url.trim();
  if (!input.id && !LINK.test(u)) return fail("Paste the full link to the recording (starting with https://).");
  const face = input.face.trim();
  const tag = toConceptTag(face);
  if (!tag) return fail("Write the customer’s first name in Latin letters (it goes into ad names).");
  if (face.length > 60) return fail("Keep the first name short.");
  if (input.brief.trim().length < 3) return fail("Write the brief for the editor.");
  if (input.brief.length > 2000) return fail("Keep the brief under 2000 characters.");
  if (!Number.isInteger(input.hooks) || input.hooks < 1 || input.hooks > 6) return fail("Pick 1 to 6 hooks.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("tag_testimonial", {
    p_id: input.id, p_url: u, p_note: input.note.trim(), p_avatar: input.avatarId || null, p_awareness: input.awareness,
    p_angle: input.angleId || null, p_face: face, p_tag: tag, p_brief: input.brief.trim(), p_hooks: input.hooks,
  });
  if (error) return fail(plain(error));
  revalidatePath("/", "layout");
  return { ...done("Edit task created. Assign it to an editor."), taskId: data as string };
}

/** Tag an old ad (founders): an old-named ad set → avatar, awareness, angle, format, concept tag. Meta is not changed. */
export async function tagOldAd(base: string, avatarId: string, awareness: string, angleId: string, formatId: string, tag: string): Promise<TaskState> {
  const v = await getViewer();
  if (v.role !== "founder_1" && v.role !== "founder_2") return fail("Only founders tag old ads.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("tag_old_ad", { p_base: base, p_avatar: avatarId || null, p_awareness: awareness, p_angle: angleId || null, p_format: formatId || null, p_tag: toConceptTag(tag) });
  if (error) return fail(plain(error));
  revalidatePath("/", "layout");
  return done("Tagged. Its results now show under that cell, angle and format in Live ads.");
}

/** Pause in Meta answer (founders): "Done, paused in Meta" or "Not now" + why. The next pull checks the ad. */
export async function answerPause(adId: string, flag: string, answer: "paused" | "not_now", reason: string): Promise<TaskState> {
  const v = await getViewer();
  if (v.role !== "founder_1" && v.role !== "founder_2") return fail("Only founders answer KILL items.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("answer_pause", { p_ad: adId, p_flag: flag, p_answer: answer, p_reason: reason.trim() });
  if (error) return fail(plain(error));
  revalidatePath("/", "layout");
  return done(answer === "paused" ? "Noted. The next Meta pull checks it is paused." : "Noted with your reason.");
}

/** The copywriter opened her RESULT item: it stays seen until the concept's state changes again. No revalidation (instant). */
export async function seeResult(taskId: string): Promise<TaskState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("see_result", { p_task: taskId });
  if (error) return fail(plain(error));
  return done("seen");
}

/** Winner · core message (Founder 1, WINNER item): saved on the angle; it fills KEEP in every future task in that angle. */
export async function saveWinner(taskId: string, message: string): Promise<TaskState> {
  const v = await getViewer();
  if (v.role !== "founder_1" && v.role !== "founder_2") return fail("Only founders confirm winners.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_winner", { p_task: taskId, p_message: message.trim() });
  if (error) return fail(plain(error));
  revalidatePath("/", "layout");
  return done("Saved. Every new task in this angle starts with this core message in KEEP.");
}
