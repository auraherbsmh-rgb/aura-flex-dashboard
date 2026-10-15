import { TabPage, NotBuiltYet } from "@/components/TabPage";
import { NeedsMe } from "@/components/Proposals";
import { CreateTaskButton } from "@/components/Tasks";
import { requireTab } from "@/lib/viewer";
import { getPickers, getProposals } from "@/lib/proposals";
import { getCreateTaskContext, getTasks, requestTime } from "@/lib/tasks";
import { buildNeeds, getRule } from "@/lib/needs";

export const metadata = { title: "Home · Aura Flex" };

export default async function Page() {
  const viewer = await requireTab("home");
  const [proposals, hours, reviewHours, pickers, ctx, tasks] = await Promise.all([
    getProposals(),
    getRule("proposal_unanswered_hours", 48),
    getRule("review_waiting_hours", 48),
    getPickers(),
    getCreateTaskContext(),
    getTasks(),
  ]);
  const groups = buildNeeds(viewer, proposals, hours, requestTime(), tasks, reviewHours);
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  return (
    <TabPage tab="home" title="Home">
      <div><CreateTaskButton ctx={ctx} pickers={pickers} /></div>
      <NeedsMe groups={groups} total={total} />
      <NotBuiltYet phase="phase 2" what="Your three numbers, Blocked, and the other Needs me items (reviews, launches, footage…) arrive with their screens. DECIDE and script REVIEW items and Create task work now." />
    </TabPage>
  );
}
