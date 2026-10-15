import { TabPage, NotBuiltYet } from "@/components/TabPage";
import { NeedsMe } from "@/components/Proposals";
import { requireTab } from "@/lib/viewer";
import { getProposals } from "@/lib/proposals";
import { buildNeeds, getRule } from "@/lib/needs";

export const metadata = { title: "Home · Aura Flex" };

export default async function Page() {
  const viewer = await requireTab("home");
  const [proposals, hours] = await Promise.all([getProposals(), getRule("proposal_unanswered_hours", 48)]);
  const groups = buildNeeds(viewer, proposals, hours);
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  return (
    <TabPage tab="home" title="Home">
      <NeedsMe groups={groups} total={total} />
      <NotBuiltYet phase="phase 2" what="Your three numbers, Blocked, and the other Needs me items (reviews, launches, footage…) arrive with their screens. DECIDE items work now." />
    </TabPage>
  );
}
