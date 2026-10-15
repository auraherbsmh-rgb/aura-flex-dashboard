"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { text, toNameCode } from "@/lib/parse";
import { AWARENESS } from "@/lib/proposals-shared";

export type ProposeState = { ok?: string; error?: string; at?: number };
const done = (ok: string): ProposeState => ({ ok, at: Date.now() });
const fail = (error: string): ProposeState => ({ error, at: Date.now() });

const NEW = "__new__";

/** Copywriter (or founder) proposes a test in a cell, or a new angle. Goes to Founder 1 as a DECIDE item. */
export async function propose(_prev: ProposeState, form: FormData): Promise<ProposeState> {
  const v = await getViewer();
  if (!["founder_1", "founder_2", "copywriter"].includes(v.role)) return fail("Only copywriters and founders can propose.");

  const avatarId = text(form.get("avatar_id"));
  const awareness = text(form.get("awareness"));
  const angle = text(form.get("angle_id"));
  const newName = text(form.get("new_angle_name"));
  const why = text(form.get("why"));
  const formatId = text(form.get("format_id"));

  if (!avatarId) return fail("Pick the avatar.");
  if (!(AWARENESS as readonly string[]).includes(awareness)) return fail("Pick the awareness level.");
  if (!angle) return fail("Pick an angle, or “+ New angle…”.");
  if (angle === NEW && newName.length < 2) return fail("Give the new angle a name.");
  if (why.length < 3) return fail("Say why in one line.");
  if (why.length > 500) return fail("Keep the why to one or two lines.");

  const supabase = await createClient();
  const { error } = await supabase.from("proposals").insert({
    proposed_by: v.personId,
    avatar_id: avatarId,
    awareness,
    angle_id: angle === NEW ? null : angle,
    new_angle_name: angle === NEW ? newName : null,
    why,
    format_id: formatId || null,
  });
  if (error) return fail(`Not sent: ${error.message}`);
  revalidatePath("/", "layout");
  return done("Sent to Founder 1. The answer comes back here.");
}

/**
 * Founder decides: Approve / On hold / Reject. The answer line is required for On hold and Reject.
 * For a new angle, the decision also puts the angle in Settings · Lists (approved, on hold or rejected),
 * written with dashes so it works in ad names. Approved angles are usable in names right away.
 */
export async function decide(_prev: ProposeState, form: FormData): Promise<ProposeState> {
  const v = await getViewer();
  if (v.role !== "founder_1" && v.role !== "founder_2") return fail("Only founders decide.");

  const id = text(form.get("id"));
  const choice = text(form.get("decision"));
  const answer = text(form.get("answer"));
  if (!["approved", "on_hold", "rejected"].includes(choice)) return fail("Choose Approve, On hold or Reject.");
  if (choice !== "approved" && !answer) return fail("Write her an answer: it's required for On hold and Reject.");

  const supabase = await createClient();
  const { data: p } = await supabase.from("proposals").select("id, status, new_angle_name").eq("id", id).maybeSingle();
  if (!p) return fail("Proposal not found.");
  if (p.status !== "waiting" && p.status !== "on_hold") return fail("Already decided.");

  let newAngleItemId: string | null = null;
  if (p.new_angle_name) {
    const code = toNameCode(p.new_angle_name);
    if (!code) return fail("The angle name needs letters or numbers.");
    const listStatus = choice === "approved" ? "approved" : choice;
    const { data: existing } = await supabase
      .from("list_items")
      .select("id, status")
      .eq("list", "angle")
      .or(`code.ilike.${code},label.ilike.${code}`)
      .maybeSingle();
    if (existing) {
      if (existing.status === "approved" && choice !== "approved") {
        return fail(`${code} is already an approved angle. Approve, or answer and reject.`);
      }
      const { error } = await supabase.from("list_items").update({ status: listStatus, archived_from: null }).eq("id", existing.id);
      if (error) return fail(`Not saved: ${error.message}`);
      newAngleItemId = existing.id;
    } else {
      const { data: last } = await supabase.from("list_items").select("sort").eq("list", "angle").order("sort", { ascending: false }).limit(1).maybeSingle();
      const { data: created, error } = await supabase
        .from("list_items")
        .insert({ list: "angle", code, label: code, track: "knee", status: listStatus, sort: (last?.sort ?? 0) + 1, created_by: v.personId })
        .select("id")
        .single();
      if (error) return fail(`Not saved: ${error.message}`);
      newAngleItemId = created.id;
    }
  }

  const { error } = await supabase
    .from("proposals")
    .update({
      status: choice,
      answer: answer || null,
      decided_by: v.personId,
      decided_at: new Date().toISOString(),
      new_angle_item_id: newAngleItemId,
    })
    .eq("id", id);
  if (error) return fail(`Not saved: ${error.message}`);
  revalidatePath("/", "layout");
  const word = choice === "approved" ? "Approved" : choice === "on_hold" ? "Put on hold" : "Rejected";
  return done(`${word}. The answer is in her inbox.`);
}
