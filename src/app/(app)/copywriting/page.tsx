import { TabPage, NotBuiltYet } from "@/components/TabPage";
import { ProposeButton, ProposalList } from "@/components/Proposals";
import { requireTab } from "@/lib/viewer";
import { getPickers, getProposals } from "@/lib/proposals";

export const metadata = { title: "Copywriting · Aura Flex" };

export default async function Page() {
  const viewer = await requireTab("copywriting");
  const founder = viewer.role === "founder_1" || viewer.role === "founder_2";
  const [pickers, proposals] = await Promise.all([getPickers(), getProposals()]);
  return (
    <TabPage tab="copywriting" title="Copywriting">
      <section className="card sec" aria-labelledby="h-prop">
        <div className="sh">
          <h2 id="h-prop">{founder ? "Proposals" : "My proposals"}</h2>
          <span className="lbl">{founder ? "Every proposal and its answer" : "Founder 1’s answers come back here"}</span>
        </div>
        <div><ProposeButton pickers={pickers} /></div>
        <ProposalList proposals={proposals} showAuthor={founder} />
      </section>
      <NotBuiltYet phase="phase 2" what="Inbox, map, tasks, scripts, the pipeline and the Library arrive with the production flow. The “+ Propose” button will also sit on the map and in each cell." />
    </TabPage>
  );
}
