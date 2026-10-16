import { TabPage, NotBuiltYet } from "@/components/TabPage";
import { NeedsMe } from "@/components/Proposals";
import { CreateTaskButton } from "@/components/Tasks";
import { requireTab } from "@/lib/viewer";
import { getPickers, getProposals } from "@/lib/proposals";
import { getCreateTaskContext, getDetailsLite, getEditors, getHookCounts, getProductions, getTasks, prodCards, requestTime } from "@/lib/tasks";
import { buildNeeds, getRule, mergeNeeds } from "@/lib/needs";

export const metadata = { title: "Home · Aura Flex" };

export default async function Page() {
  const viewer = await requireTab("home");
  const [proposals, hours, reviewHours, footageLateDays, assignLateDays, pickers, ctx, tasks, details, productions, hooks] = await Promise.all([
    getProposals(),
    getRule("proposal_unanswered_hours", 48),
    getRule("review_waiting_hours", 48),
    getRule("footage_late_days", 2),
    getRule("edit_not_started_days", 2),
    getPickers(),
    getCreateTaskContext(),
    getTasks(),
    getDetailsLite(),
    getProductions(),
    getHookCounts(),
  ]);
  const editors = await getEditors(productions, tasks);
  const cards = prodCards(tasks, details, hooks);
  const now = requestTime();
  const prod = { cards, productions, footageLateDays, assignLateDays };
  const groups = buildNeeds(viewer, proposals, hours, now, tasks, reviewHours, prod);
  // "All": what each founder has on their own Home (so Founder 1 can see Founder 2's items, and the reverse).
  const asRole = (role: "founder_1" | "founder_2") => buildNeeds({ ...viewer, role }, proposals, hours, now, tasks, reviewHours, prod);
  const allGroups = mergeNeeds(asRole("founder_1"), asRole("founder_2"));
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  return (
    <TabPage tab="home" title="Home">
      <div><CreateTaskButton ctx={ctx} pickers={pickers} /></div>
      <NeedsMe groups={groups} total={total} editors={editors} allGroups={allGroups} />
      <NotBuiltYet phase="phase 2" what="Your three numbers, Blocked, and the other Needs me items (edit reviews, launches, testimonials…) arrive with their screens. DECIDE, script REVIEW, FOOTAGE and ASSIGN items and Create task work now." />
    </TabPage>
  );
}
