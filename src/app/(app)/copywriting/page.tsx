import { TabPage, NotBuiltYet } from "@/components/TabPage";
import { ProposeButton, ProposalList } from "@/components/Proposals";
import { CreateTaskButton, TaskList } from "@/components/Tasks";
import { requireTab } from "@/lib/viewer";
import { getPickers, getProposals } from "@/lib/proposals";
import { getCreateTaskContext, getTasks } from "@/lib/tasks";

export const metadata = { title: "Copywriting · Aura Flex" };

export default async function Page() {
  const viewer = await requireTab("copywriting");
  const founder = viewer.role === "founder_1" || viewer.role === "founder_2";
  const [pickers, proposals, tasks, ctx] = await Promise.all([
    getPickers(),
    getProposals(),
    getTasks(),
    founder ? getCreateTaskContext() : Promise.resolve(null),
  ]);
  return (
    <TabPage tab="copywriting" title="Copywriting">
      <section className="card sec" aria-labelledby="h-tasks">
        <div className="sh">
          <h2 id="h-tasks">{founder ? "Tasks" : "My tasks"}</h2>
          <span className="lbl">{founder ? "Every script task, open first" : "Your script tasks, open first"}</span>
        </div>
        {ctx && <div><CreateTaskButton ctx={ctx} pickers={pickers} /></div>}
        <TaskList tasks={tasks} showWriter={founder} />
      </section>
      <section className="card sec" aria-labelledby="h-prop">
        <div className="sh">
          <h2 id="h-prop">{founder ? "Proposals" : "My proposals"}</h2>
          <span className="lbl">{founder ? "Every proposal and its answer" : "Founder 1’s answers come back here"}</span>
        </div>
        <div><ProposeButton pickers={pickers} /></div>
        <ProposalList proposals={proposals} showAuthor={founder} taskCtx={ctx ? { ctx, pickers } : undefined} />
      </section>
      <NotBuiltYet phase="phase 2" what="The task view (writing the script, review, Needs changes), the map, the pipeline and the Library arrive next. The “+ Propose” button will also sit on the map and in each cell." />
    </TabPage>
  );
}
