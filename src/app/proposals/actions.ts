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
  if (newName.length > 80) return fail("Keep the angle name under 80 characters.");
  const newCode = angle === NEW ? toNameCode(newName) : null;
  if (angle === NEW && !newCode) return fail("Write the angle name with Latin letters: it goes into ad names.");
  if (why.length < 3) return fail("Say why in one line.");
  if (why.length > 500) return fail("Keep the why to one or two lines.");

  const supabase = await createClient();
  const { error } = await supabase.from("proposals").insert({
    proposed_by: v.personId,
    avatar_id: avatarId,
    awareness,
    angle_id: angle === NEW ? null : angle,
    new_angle_name: angle === NEW ? newName : null,
    new_angle_code: newCode,
    why,
    format_id: formatId || null,
  });
  if (error) return fail(`Not sent: ${error.message}`);
  revalidatePath("/", "layout");
  return done("Sent to Founder 1. The answer comes back here.");
}

/**
 * Founder decides: Approve / On hold / Reject (answer required for the last two). Done in one database
 * transaction (public.decide_proposal): it refuses a proposal another founder already decided, and for a new
 * angle it puts the angle in Settings · Lists with its track, written with dashes, in the same step.
 * Either founder may decide (founders cover each other); Founder 2 gets it on Home after the unanswered rule.
 */
export async function decide(_prev: ProposeState, form: FormData): Promise<ProposeState> {
  const v = await getViewer();
  if (v.role !== "founder_1" && v.role !== "founder_2") return fail("Only founders decide.");
  const choice = text(form.get("decision"));
  const answer = text(form.get("answer"));
  if (!["approved", "on_hold", "rejected"].includes(choice)) return fail("Choose Approve, On hold or Reject.");
  if (choice !== "approved" && !answer) return fail("Write her an answer: it's required for On hold and Reject.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_proposal", {
    p_id: text(form.get("id")),
    p_choice: choice,
    p_answer: answer,
    p_track: text(form.get("track")) || "knee",
    p_expected: text(form.get("expected")) || null,
  });
  if (error) return fail(error.message);
  revalidatePath("/", "layout");
  const word = choice === "approved" ? "Approved" : choice === "on_hold" ? "Put on hold" : "Rejected";
  return done(`${word}. She sees the answer in her proposals list.`);
}
