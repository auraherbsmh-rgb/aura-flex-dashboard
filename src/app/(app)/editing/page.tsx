import { TabPage, NotBuiltYet } from "@/components/TabPage";
import { CreateTaskButton } from "@/components/Tasks";
import { getPickers } from "@/lib/proposals";
import { EditBoard, EditTask, type EditView } from "@/components/Editing";
import { requireTab } from "@/lib/viewer";
import { getRule } from "@/lib/needs";
import {
  getCreateTaskContext, getDetailsLite, getEditRounds, getEditors, getHookCounts, getHooks, getLaunchNames, getPay, getProductions, getTasks, prodCards, requestTime,
} from "@/lib/tasks";
import { buildQueue, editState, editorStats, type EditCard, type EditorStats } from "@/lib/editing-shared";

export const metadata = { title: "Editing · Aura Flex" };

type Search = { task?: string; ed?: string };

function greeting(now: number, name: string) {
  const h = new Date(now + 36e5).getUTCHours();
  return `${h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"}, ${name}`;
}

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  const viewer = await requireTab("editing");
  const founder = viewer.role === "founder_1" || viewer.role === "founder_2";
  const isEditor = viewer.role === "editor";
  const sp = await searchParams;
  const now = requestTime();
  const [tasks, details, productions, rounds, hookCounts, pay, notStartedDays, roundAlert] = await Promise.all([
    getTasks(),
    getDetailsLite(),
    getProductions(),
    getEditRounds(),
    getHookCounts(),
    getPay(),
    getRule("edit_not_started_days", 2),
    getRule("revision_round_alert", 3),
  ]);
  const editors = founder ? await getEditors(productions, tasks) : [];
  const pcards = prodCards(tasks, details, hookCounts);
  const cards = new Map<string, EditCard>(
    [...pcards.values()].map((c) => [c.taskId, { face: c.face, cell: c.cell, angle: c.angle, format: c.format, generate: c.generate }]),
  );

  // An editor only ever has her own edits (row-level security); founders pick Editor A · B · All.
  const edList: [string, string][] = editors.map((e) => [e.id, e.name]);
  const ed = founder && sp.ed && edList.some(([id]) => id === sp.ed) ? sp.ed : null;
  const queueAll = buildQueue(tasks, productions, rounds, cards, { now, notStartedDays, roundAlert });
  const mine = isEditor ? queueAll.filter((q) => q.editorId === viewer.personId) : queueAll;
  const visible = ed ? mine.filter((q) => q.editorId === ed) : mine;

  // The clicked task if it is in the queue shown, else the most urgent one shown.
  const selectedId = (visible.find((q) => q.taskId === sp.task) ?? visible[0])?.taskId ?? null;

  // Tiles for "All" and for each editor, computed here so the Editor A · B · All switch is instant and always matches.
  const statsBy: Record<string, EditorStats> = {};
  const aiBy: Record<string, boolean> = {};
  if (isEditor) {
    const own = pay.get(viewer.personId);
    statsBy.all = editorStats(viewer.personId, productions, rounds, cards, { perVideo: own?.perVideo ?? null, rate3d: own?.rate3d ?? null }, now);
    aiBy.all = own?.rate3d !== null && own?.rate3d !== undefined ? true : [...cards.values()].some((c) => c.generate);
  } else {
    const same = [...new Set(editors.map((e) => pay.get(e.id)?.perVideo ?? null))];
    statsBy.all = editorStats(null, productions, rounds, cards, { perVideo: same.length === 1 ? same[0] : null, rate3d: null }, now);
    aiBy.all = false;
    for (const e of editors) {
      const pe = pay.get(e.id);
      statsBy[e.id] = editorStats(e.id, productions, rounds, cards, { perVideo: pe?.perVideo ?? null, rate3d: pe?.rate3d ?? null }, now);
      aiBy[e.id] = e.doesAi;
    }
  }
  const [ctx, pickers] = founder ? await Promise.all([getCreateTaskContext(), getPickers()]) : [null, null];

  let view: EditView | null = null;
  if (selectedId) {
    const t = tasks.find((x) => x.id === selectedId)!;
    const p = productions.get(selectedId)!;
    const r = rounds.get(selectedId) ?? [];
    const c = cards.get(selectedId)!;
    view = {
      taskId: selectedId,
      title: c.face,
      cellLine: `${c.cell} · ${c.angle} · ${c.format}`,
      state: editState(p, r)!,
      rounds: r,
      production: p,
      scriptUrl: t.scriptUrl,
      hooks: await getHooks(selectedId),
      generate: c.generate,
      payPerVideo: pay.get(p.editorId ?? "")?.perVideo ?? null,
      editorName: p.editorName ?? "Editor",
      card: pcards.get(selectedId),
      names: founder ? (await getLaunchNames()).get(selectedId) : undefined,
    };
  }

  const queueCount = mine.filter((q) => !q.dim).length;
  const needNow = mine.filter((q) => q.state === "changes" || q.state === "ready" || (q.alert && q.alertTone === "red" && q.state !== "submitted")).length;
  return (
    <TabPage
      tab="editing"
      title={isEditor ? greeting(now, viewer.name) : "Editing"}
      below={
        <>
          <span className="pill raise"><b>{queueCount}</b>video{queueCount === 1 ? "" : "s"} in {isEditor ? "my" : "the"} queue</span>
          {isEditor && <span className={`pill ${needNow ? "pill-r" : "raise"}`}><b>{needNow}</b>need me now</span>}
        </>
      }
    >
      <EditBoard
        statsBy={statsBy}
        aiBy={aiBy}
        items={mine}
        selectedId={selectedId}
        editors={edList}
        initialEd={ed}
        forFounder={founder}
        createTask={ctx && pickers ? <CreateTaskButton ctx={ctx} pickers={pickers} /> : undefined}
        pipeline={<NotBuiltYet phase="screen 11" what="The Videos pipeline (Shoot → Footage → Editing → Review → Launch, late first) comes after the Launch pop-up." />}
        task={
          view ? (
            <EditTask key={view.taskId} v={view} isFounder={founder} isEditor={isEditor && view.production.editorId === viewer.personId} editors={editors} />
          ) : (
            <section className="card sec"><div className="info">{founder ? "Pick a video in the queue." : "Nothing assigned to you yet."}</div></section>
          )
        }
      />
    </TabPage>
  );
}
