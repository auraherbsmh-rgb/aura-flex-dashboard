import { TabPage } from "@/components/TabPage";
import { CreateTaskButton } from "@/components/Tasks";
import { TestimonialButton } from "@/components/Testimonial";
import { getPickers } from "@/lib/proposals";
import { EditBoard, type EditView } from "@/components/Editing";
import { requireTab } from "@/lib/viewer";
import { getRule } from "@/lib/needs";
import {
  getAllTestimonials, getCreateTaskContext, getDetailsLite, getEditRounds, getEditors, getAllHooks, getHookCounts, getLaunchNames, getPay, getProductions, getTasks, prodCards, requestTime,
} from "@/lib/tasks";
import type { ProdCard, Production } from "@/lib/tasks-shared";
import type { TestimonialVideo } from "@/components/TestimonialsList";
import { buildQueue, buildVideoPipeline, editState, editorStats, type EditCard, type EditorStats } from "@/lib/editing-shared";

export const metadata = { title: "Editing · Aura Flex" };

type Search = { task?: string; ed?: string; view?: string };

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
  const [tasks, details, productions, rounds, hookCounts, pay, notStartedDays, roundAlert, footageLateDays, reviewHours, launchLateDays] = await Promise.all([
    getTasks(),
    getDetailsLite(),
    getProductions(),
    getEditRounds(),
    getHookCounts(),
    getPay(),
    getRule("edit_not_started_days", 2),
    getRule("revision_round_alert", 3),
    getRule("footage_late_days", 2),
    getRule("review_waiting_hours", 48),
    getRule("launch_waiting_days", 2),
  ]);
  const [editors, launchNames] = founder ? await Promise.all([getEditors(productions, tasks), getLaunchNames()]) : [[], undefined];
  const pcards = prodCards(tasks, details, hookCounts);
  const cards = new Map<string, EditCard>(
    [...pcards.values()].map((c) => [c.taskId, { face: c.face, cell: c.cell, angle: c.angle, format: c.format, generate: c.generate, vo: c.vo }]),
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
  const [ctx, pickers, testimonialRows] = founder ? await Promise.all([getCreateTaskContext(), getPickers(), getAllTestimonials()]) : [null, null, []];

  // Every video in the queue is prepared here, so opening one is instant (no page load).
  const allHooks = await getAllHooks();
  const views: Record<string, EditView> = {};
  for (const q of mine) {
    const t = tasks.find((x) => x.id === q.taskId);
    const p = productions.get(q.taskId);
    const c = cards.get(q.taskId);
    if (!t || !p || !c) continue;
    const r = rounds.get(q.taskId) ?? [];
    views[q.taskId] = {
      taskId: q.taskId,
      title: c.face,
      cellLine: `${c.cell} · ${c.angle} · ${c.format}`,
      state: editState(p, r)!,
      rounds: r,
      production: p,
      scriptUrl: t.scriptUrl,
      hooks: allHooks.get(q.taskId) ?? [],
      generate: c.generate,
      vo: pcards.get(q.taskId)?.vo ?? false,
      testimonial: t.origin === "testimonial",
      payPerVideo: pay.get(p.editorId ?? "")?.perVideo ?? null,
      editorName: p.editorName ?? "Editor",
      card: pcards.get(q.taskId),
      names: launchNames?.get(q.taskId),
    };
  }

  // Rows not with an editor yet open Footage received / Assign right in the pipeline.
  const pipelineRows = founder ? buildVideoPipeline(tasks, productions, rounds, new Map(details.map((d) => [d.taskId, d])), { now, footageLateDays, assignLateDays: notStartedDays, reviewHours, launchLateDays, roundAlert }) : undefined;
  const pipeCards: Record<string, ProdCard> = {};
  const pipeCurrent: Record<string, Production> = {};
  for (const r of pipelineRows ?? []) {
    const c = pcards.get(r.taskId);
    if (r.action && c) pipeCards[r.taskId] = c;
    const p = productions.get(r.taskId);
    if (r.action && p) pipeCurrent[r.taskId] = p;
  }

  // Each used testimonial's video and where it is now (Editing → Testimonials).
  const testimonialVideos: Record<string, TestimonialVideo> = {};
  for (const r of testimonialRows) {
    if (!r.taskId) continue;
    const p = productions.get(r.taskId);
    const c = pcards.get(r.taskId);
    testimonialVideos[r.taskId] = {
      name: c?.face ?? "Testimonial",
      where: tasks.find((t) => t.id === r.taskId)?.status === undefined ? "cancelled" : p?.liveAt ? "live" : p?.launchedAt ? "launched" : p?.assignedAt ? `with ${p.editorName ?? "an editor"}` : "to assign",
      inQueue: mine.some((q) => q.taskId === r.taskId),
      link: p?.finalUrl ?? rounds.get(r.taskId)?.at(-1)?.videoUrl ?? null,
    };
  }

  const queueCount = mine.filter((q) => !q.dim && !q.hold).length;
  const needNow = mine.filter((q) => !q.hold).filter((q) => q.state === "changes" || q.state === "ready" || (q.alert && q.alertTone === "red" && q.state !== "submitted")).length;
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
        initialView={founder && sp.view === "testimonials" ? "testimonials" : founder && sp.view === "pipeline" ? "pipeline" : "queue"}
        forFounder={founder}
        createTask={ctx && pickers ? <span style={{ display: "inline-flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}><TestimonialButton pickers={pickers} editors={editors} /><CreateTaskButton ctx={ctx} pickers={pickers} /></span> : undefined}
        pipelineRows={pipelineRows}
        pipeCards={pipeCards}
        pipeCurrent={pipeCurrent}
        testimonials={founder && pickers ? { rows: testimonialRows, videos: testimonialVideos, pickers } : undefined}
        views={views}
        isEditorId={isEditor ? viewer.personId : null}
        editorLoads={editors}
      />
    </TabPage>
  );
}
