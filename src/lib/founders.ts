import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

import { DEFAULT_FOUNDERS, type FounderNames } from "./founders-shared";
export { withFounderNames, type FounderNames } from "./founders-shared";

/** The founders' names as set in Settings → People (founder 1 / founder 2 roles), read once per request. */
export const getFounderNames = cache(async (): Promise<FounderNames> => {
  const supabase = await createClient();
  const { data } = await supabase.from("people").select("role, display_name, active").in("role", ["founder_1", "founder_2"]);
  const pick = (role: string, fallback: string) => (data ?? []).find((p) => p.role === role && p.active && String(p.display_name ?? "").trim())?.display_name?.trim() ?? fallback;
  return { f1: pick("founder_1", DEFAULT_FOUNDERS.f1), f2: pick("founder_2", DEFAULT_FOUNDERS.f2) };
});

