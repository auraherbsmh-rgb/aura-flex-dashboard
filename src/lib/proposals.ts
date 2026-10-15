import { createClient } from "@/lib/supabase/server";
import type { Pickers, Proposal } from "@/lib/proposals-shared";
export * from "@/lib/proposals-shared";

/** Approved list items for pickers (Settings · Lists). Static (IMG) is left out: statics have no tasks in v1. */
export async function getPickers(): Promise<Pickers> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("list_items")
    .select("id, list, code, label, status, sort")
    .in("list", ["avatar", "angle", "format"])
    .eq("status", "approved")
    .order("sort");
  const rows = data ?? [];
  const pick = (l: string) => rows.filter((r) => r.list === l).map((r) => ({ id: r.id, code: r.code, label: r.label }));
  return { avatars: pick("avatar"), angles: pick("angle"), formats: pick("format").filter((f) => f.code !== "IMG") };
}

/** Proposals the viewer may see (row-level security: founders all, others their own), newest first. */
export async function getProposals(): Promise<Proposal[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("proposals")
    .select(
      "id, status, created_at, decided_at, why, answer, awareness, new_angle_name, proposed_by, " +
        "author:people!proposals_proposed_by_fkey(display_name), decider:people!proposals_decided_by_fkey(display_name), " +
        "avatar:list_items!proposals_avatar_id_fkey(code), angle:list_items!proposals_angle_id_fkey(label), format:list_items!proposals_format_id_fkey(label)",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  type Row = {
    id: string; status: Proposal["status"]; created_at: string; decided_at: string | null; why: string; answer: string | null;
    awareness: string; new_angle_name: string | null; proposed_by: string;
    author: { display_name: string } | null; decider: { display_name: string } | null;
    avatar: { code: string } | null; angle: { label: string } | null; format: { label: string } | null;
  };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    status: r.status,
    createdAt: r.created_at,
    decidedAt: r.decided_at,
    proposedById: r.proposed_by,
    proposedBy: r.author?.display_name ?? "—",
    avatarCode: r.avatar?.code ?? "?",
    awareness: r.awareness,
    angle: r.new_angle_name ?? r.angle?.label ?? "—",
    isNewAngle: r.new_angle_name !== null,
    why: r.why,
    format: r.format?.label ?? null,
    answer: r.answer,
    decidedBy: r.decider?.display_name ?? null,
  }));
}

