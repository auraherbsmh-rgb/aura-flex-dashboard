"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { AWARENESS } from "@/lib/proposals-shared";
import { DROP_REASONS, planWeek, type PlanKind } from "@/lib/plan-shared";

export type PlanResult = { ok?: string; error?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Our own database messages (raised by the functions, code P0001) are written for people; anything else is not. */
const plain = (e: { code?: string; message: string }) => (e.code === "P0001" ? e.message : "Not saved. Reload the page and try again.");

async function founder(): Promise<string | null> {
  const v = await getViewer();
  return v.role === "founder_1" || v.role === "founder_2" ? null : "Only founders plan the week.";
}
/** Always this week (server clock), never a week sent by the browser. */
const thisWeek = () => planWeek(Date.now());
const done = (ok: string): PlanResult => { revalidatePath("/", "layout"); return { ok }; };

export async function addPlanItem(kind: PlanKind, source: string | null, avatarId: string | null, awareness: string | null, note: string): Promise<PlanResult> {
  const no = await founder();
  if (no) return { error: no };
  if (!["double_down", "new_test", "launch"].includes(kind)) return { error: "Unknown item." };
  if (kind !== "new_test" && !(source && UUID.test(source))) return { error: "Reload the page and try again." };
  if (kind === "new_test" && !(avatarId && UUID.test(avatarId))) return { error: "Pick the avatar." };
  if (kind === "new_test" && !(AWARENESS as readonly string[]).includes(awareness ?? "")) return { error: "Pick the awareness level." };
  const n = note.trim();
  if (n.length > 300) return { error: "Keep the note under 300 characters." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("plan_add_item", {
    p_week: thisWeek(), p_kind: kind, p_source: kind === "new_test" ? null : source,
    p_avatar: kind === "new_test" ? avatarId : null, p_awareness: kind === "new_test" ? awareness : null, p_note: n,
  });
  return error ? { error: plain(error) } : done("Added.");
}

export async function removePlanItem(id: string): Promise<PlanResult> {
  const no = await founder();
  if (no) return { error: no };
  if (!UUID.test(id)) return { error: "Reload the page and try again." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("plan_remove_item", { p_item: id });
  return error ? { error: plain(error) } : done("Taken out.");
}

/** Drop (with a reason) or put back an item. `label` is only used for the change line. */
export async function dropPlanItem(id: string, drop: boolean, reason: string, label: string): Promise<PlanResult> {
  const no = await founder();
  if (no) return { error: no };
  if (!UUID.test(id)) return { error: "Reload the page and try again." };
  const r = reason.trim();
  if (drop && !(DROP_REASONS as readonly string[]).includes(r) && (r.length < 3 || r.length > 200)) return { error: "Pick a reason, or write one (3 to 200 characters)." };
  const supabase = await createClient();
  const week = thisWeek();
  const { error } = await supabase.rpc("plan_drop_item", { p_item: id, p_drop: drop, p_reason: drop ? r : null, p_log_week: week });
  if (error) return { error: plain(error) };
  const name = label.trim().slice(0, 120) || "an item";
  await supabase.rpc("plan_note", { p_week: week, p_what: drop ? `Dropped ${name} · ${r}` : `Put back ${name}` });
  return done(drop ? "Dropped." : "Put back.");
}

export async function setPlanCap(cap: number): Promise<PlanResult> {
  const no = await founder();
  if (no) return { error: no };
  if (!Number.isInteger(cap) || cap < 1 || cap > 30) return { error: "Between 1 and 30 scripts." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("plan_set_cap", { p_week: thisWeek(), p_cap: cap });
  return error ? { error: plain(error) } : done("Saved.");
}

export async function lockPlan(): Promise<PlanResult> {
  const no = await founder();
  if (no) return { error: no };
  const supabase = await createClient();
  const { error } = await supabase.rpc("plan_lock", { p_week: thisWeek() });
  return error ? { error: plain(error) } : done("Week plan locked.");
}
