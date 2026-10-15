import { redirect } from "next/navigation";
import { LANDING_BY_ROLE } from "@/lib/access";
import { getViewer } from "@/lib/viewer";

/** "/" sends each person to their own first screen. */
export default async function Root() {
  const viewer = await getViewer();
  redirect(LANDING_BY_ROLE[viewer.role]);
}
