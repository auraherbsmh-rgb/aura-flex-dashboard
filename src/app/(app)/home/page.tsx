import { TabPage, NotBuiltYet } from "@/components/TabPage";
import { NeedsMe } from "@/components/Proposals";
import { CreateTaskButton } from "@/components/Tasks";
import { requireTab } from "@/lib/viewer";
import { getPickers, getProposals } from "@/lib/proposals";
import { getCreateTaskContext, getDetailsLite, getEditRounds, getEditors, getHookCounts, getLaunchNames, getProductions, getTasks, getTestimonials, prodCards, requestTime } from "@/lib/tasks";
import { TestimonialButton } from "@/components/Testimonial";
import { buildNeeds, getRule, mergeNeeds } from "@/lib/needs";

export const metadata = { title: "Home · Aura Flex" };

export default async function Page() {
  const viewer = await requireTab("home");
  const [proposals, hours, reviewHours, footageLateDays, assignLateDays, launchLateDays, pickers, ctx, tasks, details, productions, hooks, editRounds, launchNames, testimonials] = await Promise.all([
    getProposals(),
    getRule("proposal_unanswered_hours", 48),
    getRule("review_waiting_hours", 48),
    getRule("footage_late_days", 2),
    getRule("edit_not_started_days", 2),
    getRule("launch_waiting_days", 2),
    getPickers(),
    getCreateTaskContext(),
    getTasks(),
    getDetailsLite(),
    getProductions(),
    getHookCounts(),
    getEditRounds(),
    getLaunchNames(),
    getTestimonials(),
  ]);
  const editors = await getEditors(productions, tasks);
  const cards = prodCards(tasks, details, hooks);
  const now = requestTime();
  const prod = { cards, productions, footageLateDays, assignLateDays, editRounds, launchLateDays, launchNames, testimonials };
  const groups = buildNeeds(viewer, proposals, hours, now, tasks, reviewHours, prod);
  // "All": what each founder has on their own Home (so Founder 1 can see Founder 2's items, and the reverse).
  const asRole = (role: "founder_1" | "founder_2") => buildNeeds({ ...viewer, role }, proposals, hours, now, tasks, reviewHours, prod);
  const allGroups = mergeNeeds(asRole("founder_1"), asRole("founder_2"));
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  return (
    <TabPage tab="home" title="Home">
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <CreateTaskButton ctx={ctx} pickers={pickers} />
        <TestimonialButton pickers={pickers} editors={editors} />
      </div>
      <NeedsMe groups={groups} total={total} editors={editors} allGroups={allGroups} pickers={pickers} />
      <NotBuiltYet phase="phase 2" what="Your three numbers, Blocked, and the other Needs me items (KILL, WINNER…) arrive with their screens. DECIDE, script and edit REVIEW, FOOTAGE, VO, ASSIGN, LAUNCH and TESTIMONIAL items, Create task and + Testimonial work now." />
    </TabPage>
  );
}
