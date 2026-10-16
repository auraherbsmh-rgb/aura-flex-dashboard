import { TabPage } from "@/components/TabPage";
import { ProposeButton, ProposalList } from "@/components/Proposals";
import { CreateTaskButton } from "@/components/Tasks";
import { CopyBoard } from "@/components/TaskView";
import { requireTab } from "@/lib/viewer";
import { getPickers, getProposals } from "@/lib/proposals";
import { getCreateTaskContext, getDetailsLite, getEditors, getHookCounts, getProductions, getBoardExtras, getEditRounds, getMapData, getTasks, inboxLine, prodCards, requestTime, weekStartIso } from "@/lib/tasks";
import { getRule } from "@/lib/needs";
import { buildPipeline } from "@/lib/pipeline-shared";
import { CopyViews } from "@/components/CopyViews";
import { Library } from "@/components/Library";
import { buildLibrary } from "@/lib/library-shared";
import { ScriptsPipeline } from "@/components/Pipeline";

export const metadata = { title: "Copywriting · Aura Flex" };

type Search = { task?: string; cw?: string };

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  const viewer = await requireTab("copywriting");
  const founder = viewer.role === "founder_1" || viewer.role === "founder_2";
  const sp = await searchParams;
  const [pickers, proposals, everyTask, ctx, detailsLite, reviewHours, detailsDays, productions, hooks] = await Promise.all([
    getPickers(),
    getProposals(),
    getTasks(),
    founder ? getCreateTaskContext() : Promise.resolve(null),
    getDetailsLite(),
    getRule("review_waiting_hours", 48),
    getRule("details_not_filled_days", 1),
    getProductions(),
    getHookCounts(),
  ]);
  // Testimonial edit tasks have no script: they live in Editing only.
  const allTasks = everyTask.filter((t) => t.origin !== "testimonial");
  const editors = founder ? await getEditors(productions, everyTask) : [];
  const cards = prodCards(allTasks, detailsLite, hooks);

  // Founders switch between copywriters (Copywriter 1 · 2 · All); a copywriter only ever has her own tasks.
  const writers = founder
    ? [...new Map(allTasks.map((t) => [t.copywriterId, t.copywriter])).entries()]
        .concat((ctx?.copywriters ?? []).map((c) => [c.id, c.name] as [string, string]))
        .filter(([id], i, arr) => arr.findIndex(([x]) => x === id) === i)
        .sort((a, b) => a[1].localeCompare(b[1]))
    : [];
  const cw = founder && sp.cw && writers.some(([id]) => id === sp.cw) ? sp.cw : null;
  const tasks = cw ? allTasks.filter((t) => t.copywriterId === cw) : allTasks;

  // Selected task: the one clicked, else the most urgent line.
  const now = requestTime();
  // Board extras for every task (testimonials too: the Library lists them), the map, and edit versions (Library looms / days).
  const [extras, mapData, editRounds] = await Promise.all([getBoardExtras(everyTask), getMapData(), getEditRounds()]);
  // With results, so a new RESULT (top of her inbox) is the default line, as in the browser.
  const line = (t: (typeof tasks)[number]) => inboxLine(t, founder, now, mapData.results[t.id]).rank;
  const urgent = [...tasks].sort((a, b) => line(a) - line(b) || a.dueOn.localeCompare(b.dueOn))[0];
  const selected = tasks.find((t) => t.id === sp.task) ?? urgent ?? null;
  const library = buildLibrary(everyTask, Object.fromEntries(extras.details), Object.fromEntries(productions), editRounds, now, mapData.results);
  const pipeline = buildPipeline(allTasks, detailsLite, { forFounder: founder, reviewHours, detailsDays, weekStart: weekStartIso(new Date(now)), now }, productions);

  return (
    <TabPage tab="copywriting" title="Copywriting">
      <CopyViews
        pipeline={<ScriptsPipeline data={pipeline} writers={writers} forFounder={founder} initialCw={cw} />}
        library={
          <Library
            rows={library}
            avatars={pickers.avatars.map((a) => a.code ?? a.label)}
            angles={pickers.angles.map((a) => ({ id: a.id, label: a.label }))}
            formats={[...new Set(library.map((r) => r.formatKey))].sort()}
            hookTypes={extras.pickers.hookTypes.map((h) => h.label)}
            mainArguments={extras.pickers.mainArguments}
            bands={mapData.bands}
          />
        }
        board={
          <CopyBoard
            tasks={allTasks}
            writers={writers}
            initialSelected={selected?.id ?? null}
            forFounder={founder}
            viewerId={viewer.personId}
            now={now}
            action={ctx ? <CreateTaskButton ctx={ctx} pickers={pickers} /> : undefined}
            map={{ ...mapData, avatars: pickers.avatars }}
            proposePickers={pickers}
            createCtx={ctx}
            data={{
              line: extras.line,
              pickers: extras.pickers,
              details: Object.fromEntries(extras.details),
              history: Object.fromEntries(extras.history),
              productions: Object.fromEntries(productions),
              cards: Object.fromEntries(cards),
              editors,
            }}
            side={
              <>
                <section className="card sec" aria-labelledby="h-prop">
                  <div className="sh">
                    <h2 id="h-prop">{founder ? "Proposals" : "My proposals"}</h2>
                    <span className="lbl">{founder ? "Every proposal and its answer" : "Founder 1’s answers come back here"}</span>
                  </div>
                  {!founder && <div><ProposeButton pickers={pickers} /></div>}
                  <ProposalList proposals={proposals} showAuthor={founder} taskCtx={ctx ? { ctx, pickers } : undefined} />
                </section>
              </>
            }
          />
        }
      />
    </TabPage>
  );
}
