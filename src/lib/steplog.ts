import { createClient } from "@/lib/supabase/server";

/** Writes one dated row to the step log (data model record 23). Every button that changes something calls this. */
export async function logStep(
  actorId: string,
  entityType: string,
  entityId: string | null,
  action: string,
  detail: Record<string, unknown> = {},
) {
  const supabase = await createClient();
  const { error } = await supabase.from("step_log").insert({
    actor_id: actorId,
    entity_type: entityType,
    entity_id: entityId,
    action,
    detail,
  });
  if (error) console.error("step log write failed", { entityType, action, message: error.message });
}
