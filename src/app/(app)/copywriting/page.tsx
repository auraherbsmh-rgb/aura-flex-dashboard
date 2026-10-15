import Link from "next/link";
import { TabPage, NotBuiltYet } from "@/components/TabPage";
import { ProposeButton, ProposalList } from "@/components/Proposals";
import { CreateTaskButton } from "@/components/Tasks";
import { Inbox, TaskView } from "@/components/TaskView";
import { requireTab } from "@/lib/viewer";
import { getPickers, getProposals } from "@/lib/proposals";
import { getCreateTaskContext, getTaskExtras, getTasks, inboxLine, requestTime } from "@/lib/tasks";

export const metadata = { title: "Copywriting · Aura Flex" };

type Search = { task?: string; cw?: string };

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  const viewer = await requireTab("copywriting");
  const founder = viewer.role === "founder_1" || viewer.role === "founder_2";
  const sp = await searchParams;
  const [pickers, proposals, allTasks, ctx] = await Promise.all([
    getPickers(),
    getProposals(),
    getTasks(),
    founder ? getCreateTaskContext() : Promise.resolve(null),
  ]);

  // Founders switch between copywriters (Copywriter 1 · 2 · All); a copywriter only ever has her own tasks.
  const writers = founder
    ? [...new Map(allTasks.map((t) => [t.copywriterId, t.copywriter])).entries()]
        .concat((ctx?.copywriters ?? []).map((c) => [c.id, c.name] as [string, string]))
        .filter(([id], i, arr) => arr.findIndex(([x]) => x === id) === i)
        .sort((a, b) => a[1].localeCompare(b[1]))
    : [];
  const cw = founder && sp.cw && writers.some(([id]) => id === sp.cw) ? sp.cw : null;
  const tasks = cw ? allTasks.filter((t) => t.copywriterId === cw) : allTasks;
  const query = cw ? `cw=${cw}` : "";

  // Selected task: the one clicked, else the most urgent line.
  const now = requestTime();
  const urgent = [...tasks].sort((a, b) => inboxLine(a, founder, now).rank - inboxLine(b, founder, now).rank || a.dueOn.localeCompare(b.dueOn))[0];
  const selected = tasks.find((t) => t.id === sp.task) ?? urgent ?? null;
  const extras = selected ? await getTaskExtras(selected) : null;

  const switcher = founder && writers.length > 0 && (
    <nav className="recess seg" aria-label="Copywriter">
      {writers.map(([id, name]) => (
        <Link key={id} href={`/copywriting?cw=${id}`} className={cw === id ? "seg-on" : ""} aria-current={cw === id ? "page" : undefined}>{name}</Link>
      ))}
      <Link href="/copywriting" className={!cw ? "seg-on" : ""} aria-current={!cw ? "page" : undefined}>All</Link>
    </nav>
  );

  return (
    <TabPage tab="copywriting" title="Copywriting" below={switcher || undefined}>
      <div className="board">
        <aside className="board-side">
          <section className="tray" style={{ padding: "18px 16px 16px", display: "flex", flexDirection: "column", gap: 8 }} aria-labelledby="h-inbox">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 6px 6px", gap: 12, flexWrap: "wrap" }}>
              <h2 id="h-inbox" style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Inbox</h2>
              {ctx ? <CreateTaskButton ctx={ctx} pickers={pickers} /> : <span className="lbl">Click a line → task</span>}
            </div>
            <Inbox tasks={tasks} selectedId={selected?.id ?? null} forFounder={founder} query={query} now={now} />
          </section>

          <section className="card sec" aria-labelledby="h-prop">
            <div className="sh">
              <h2 id="h-prop">{founder ? "Proposals" : "My proposals"}</h2>
              <span className="lbl">{founder ? "Every proposal and its answer" : "Founder 1’s answers come back here"}</span>
            </div>
            <div><ProposeButton pickers={pickers} /></div>
            <ProposalList proposals={proposals} showAuthor={founder} taskCtx={ctx ? { ctx, pickers } : undefined} />
          </section>

          <NotBuiltYet phase="phase 2–3" what="The map and the recap come next; the map fills with results once Meta is connected." />
        </aside>

        <div className="board-main">
          {selected && extras ? (
            <TaskView
              key={selected.id}
              task={selected}
              history={extras.history}
              line={extras.line}
              isFounder={founder}
              isOwner={selected.copywriterId === viewer.personId}
            />
          ) : (
            <section className="card sec"><div className="info">Pick a task in the inbox to open it.</div></section>
          )}
        </div>
      </div>
    </TabPage>
  );
}
