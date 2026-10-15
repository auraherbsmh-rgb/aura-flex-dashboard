import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { canSee, isLoginRole, type Role, type TabKey } from "@/lib/access";

export type Viewer = {
  personId: string;
  name: string;
  role: Role;
  email: string;
};

/** The logged-in person, read once per request. Logged out → /login; login without an active people row → /no-access. */
export const getViewer = cache(async (): Promise<Viewer> => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: person } = await supabase
    .from("people")
    .select("id, display_name, role, email, active")
    .eq("auth_user_id", userId)
    .maybeSingle();

  if (!person || !person.active || !isLoginRole(person.role)) redirect("/no-access");

  return {
    personId: person.id,
    name: person.display_name,
    role: person.role,
    email: person.email ?? "",
  };
});

/** Use at the top of each tab page: someone without access to the tab is sent to their own landing tab. */
export async function requireTab(tab: TabKey): Promise<Viewer> {
  const viewer = await getViewer();
  if (!canSee(viewer.role, tab)) redirect("/");
  return viewer;
}
