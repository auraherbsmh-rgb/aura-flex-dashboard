import { TabPage } from "@/components/TabPage";
import { PlanWeek, type PlanView } from "@/components/PlanWeek";
import { requireTab } from "@/lib/viewer";
import { getPickers } from "@/lib/proposals";
import { getCreateTaskContext, getDetailsLite, getEditRounds, getHookCounts, getMapData, getOrderVersion, getProductions, getTasks, requestTime } from "@/lib/tasks";
import { getRule } from "@/lib/needs";
import { getPlanData } from "@/lib/plan";
import { buildVideoPipeline } from "@/lib/editing-shared";
import { waitingToLaunch } from "@/lib/home-shared";
import { conceptState, LEVEL_SHORT, mapConcepts } from "@/lib/map-shared";
import { AWARENESS } from "@/lib/proposals-shared";
import { carried, dayLabel, isWorking, itemStage, RESULT_WORD, resultLine, whenLabel, type PlanItemRow } from "@/lib/plan-shared";

export const metadata = { title: "Plan the week · Aura Flex" };

/**
 * Monday plan (founder decision Oct 23): last week's plan vs what happened → last week's tests → double down on what
 * converts under its own line → new tests → production order → launches → lock. Open any day: after the lock, changes
 * are tagged and logged.
 */
export default async function Page() {
  const viewer = await requireTab("home");
  const now = requestTime();
  const [tasks, productions, rounds, details, hooks, pickers, ctx, map, version, plan, footageLateDays, assignLateDays, reviewHours, launchLateDays, roundAlert] = await Promise.all([
    getTasks(), getProductions(), getEditRounds(), getDetailsLite(), getHookCounts(), getPickers(), getCreateTaskContext(), getMapData(), getOrderVersion(), getPlanData(now),
    getRule("footage_late_days", 2), getRule("edit_not_started_days", 2), getRule("review_waiting_hours", 48), getRule("launch_waiting_days", 2), getRule("revision_round_alert", 3),
  ]);
  const founder = viewer.role === "founder_1" || viewer.role === "founder_2";
  const byTask = new Map(tasks.map((t) => [t.id, t]));
  const concept = new Map(map.concepts.map((c) => [c.taskId, c]));
  const stageOf = (i: PlanItemRow) => itemStage(i, byTask, productions, rounds);
  const short = (a: string | null) => (a ? LEVEL_SHORT[a] ?? a : "");
  const avatarCode = new Map(pickers.avatars.map((a) => [a.id, a.code ?? a.label]));
  const faceOf = (id: string | null) => {
    if (!id) return null;
    const c = concept.get(id);
    return c?.face || (c ? `${c.angle}` : null);
  };
  const cellOf = (id: string | null) => {
    const c = id ? concept.get(id) : undefined;
    return c ? `${c.avatarCode} × ${short(c.awareness)} · ${c.angle} · ${c.formatCode === "AI" ? "AI / 3D" : c.format}` : "";
  };
  const adSet = (id: string) => concept.get(id)?.variations[0]?.name.replace(/_V\d+$/i, "") ?? "";

  // Names: a double down reads "<winner> · new concept 2"; a new test "<avatar> × <awareness>"; a launch the video's face.
  const ddIndex = new Map<string, number>();
  const seen = new Map<string, number>();
  // Numbered across every week for the same winner, so a carried "concept 1" and this week's never share a name.
  for (const i of plan.items) if (i.kind === "double_down" && i.sourceTask) {
    const k = i.sourceTask;
    seen.set(k, (seen.get(k) ?? 0) + 1);
    ddIndex.set(i.id, seen.get(k)!);
  }
  const nameOf = (i: PlanItemRow) => {
    const own = i.taskId ? concept.get(i.taskId)?.face : null;
    if (i.kind === "double_down") return own ? `${own} (from ${faceOf(i.sourceTask) ?? "winner"})` : `${faceOf(i.sourceTask) ?? "Winner"} · new concept ${ddIndex.get(i.id) ?? 1}`;
    if (i.kind === "launch") return faceOf(i.sourceTask) ?? "Video";
    return own ?? `${avatarCode.get(i.avatarId ?? "") ?? "?"} × ${short(i.awareness)}`;
  };
  const metaOf = (i: PlanItemRow) => {
    const t = i.taskId ? byTask.get(i.taskId) : undefined;
    const who = t ? ` · ${t.copywriter}` : "";
    if (i.kind === "double_down") return `Double down · ${cellOf(i.sourceTask)}${who}`;
    if (i.kind === "launch") return `Launch · ${cellOf(i.sourceTask)}`;
    return `New test${i.note ? ` · ${i.note}` : ""}${who}`;
  };

  const week = plan.week;
  const current = plan.items.filter((i) => i.weekStart === week);
  const carry = carried(plan.items, week, stageOf);
  const avatarById = new Map(pickers.avatars.map((a) => [a.id, a]));
  const formatId = new Map(pickers.formats.map((f) => [f.code ?? "", f.id]));

  const toItem = (i: PlanItemRow, isCarry: boolean): PlanView["items"][number] => {
    const st = stageOf(i);
    const src = i.sourceTask ? concept.get(i.sourceTask) : undefined;
    const canCreate = founder && i.kind !== "launch" && !i.taskId && !i.droppedAt;
    return {
      id: i.id, kind: i.kind, name: nameOf(i), meta: metaOf(i), stage: st.word, tone: st.tone, closed: st.closed,
      carry: isCarry, added: i.addedAfterLock ? `ADDED ${whenLabel(i.createdAt).split(" ")[0].toUpperCase()}` : null,
      dropped: i.droppedAt ? { reason: i.dropReason ?? "", by: i.droppedBy ?? "" } : null,
      hasTask: !!i.taskId, sourceTask: i.sourceTask,
      prefill: canCreate
        ? i.kind === "double_down" && src
          ? { planItem: i.id, proposalId: null, avatarId: src.avatarId, awareness: src.awareness, angleId: src.angleId, formatId: formatId.get(src.formatCode) ?? null, reference: adSet(src.taskId), label: `Double down · ${nameOf(i)}` }
          : i.kind === "new_test" && i.avatarId && avatarById.has(i.avatarId)
            ? { planItem: i.id, proposalId: null, avatarId: i.avatarId, awareness: i.awareness ?? "", angleId: null, formatId: null, label: `New test · ${nameOf(i)}` }
            : null
        : null,
    };
  };

  // Step 1: last week's items (and older ones still open), with what happened.
  const lastWeek = [
    ...plan.items.filter((i) => i.weekStart === plan.prevWeek).map((i) => toItem(i, false)),
    ...plan.items.filter((i) => i.weekStart < plan.prevWeek && !i.droppedAt && !stageOf(i).closed).map((i) => ({ ...toItem(i, false), older: true })),
  ];

  // Step 2: concepts launched since last Monday (Tunisia), with their Meta state.
  const since = Date.parse(`${plan.prevWeek}T00:00:00Z`) - 36e5;
  const tests = map.concepts
    .filter((c) => c.launchedAt && Date.parse(c.launchedAt) >= since)
    .sort((a, b) => (b.launchedAt ?? "").localeCompare(a.launchedAt ?? ""))
    .map((c) => {
      const r = map.results[c.taskId];
      return { taskId: c.taskId, name: c.face || c.angle, cell: cellOf(c.taskId), launched: dayLabel(new Date(Date.parse(c.launchedAt!) + 36e5).toISOString().slice(0, 10)), word: r ? RESULT_WORD[r.state].word : "NO META DATA YET", tone: r ? RESULT_WORD[r.state].tone : "t-grey", line: resultLine(r) };
    });

  // Step 3: what converts under its own line now (any launch date).
  const winners = map.concepts
    .filter((c) => isWorking(map.results[c.taskId]))
    .map((c) => ({ taskId: c.taskId, name: c.face || c.angle, cell: cellOf(c.taskId), line: resultLine(map.results[c.taskId]) }));

  // Step 5: production order (same list as Editing → Pipeline).
  const detailMap = new Map(details.map((d) => [d.taskId, d]));
  const videoRows = buildVideoPipeline(tasks, productions, rounds, detailMap, { now, footageLateDays, assignLateDays, reviewHours, launchLateDays, roundAlert, prio: map.prio });
  const order = videoRows.filter((r) => map.prio[r.taskId]).map((r) => ({ taskId: r.taskId, name: r.name, meta: r.meta, late: r.late }));

  // Step 6: approved videos not launched yet.
  const faces = new Map(details.map((d) => [d.taskId, d.face ?? ""]).filter(([, f]) => f) as [string, string][]);
  const launches = waitingToLaunch(tasks, productions, rounds, faces, hooks, now).map((w) => ({ ...w, name: faces.get(w.taskId) ?? w.title }));

  // Step 4: what was tried in each avatar × awareness cell (concepts since the map start date, both tracks).
  const onMap = [...new Map([...mapConcepts(map.concepts, "knee", map.start), ...mapConcepts(map.concepts, "hips", map.start)].map((c) => [c.taskId, c])).values()];
  const plannedHere = (av: string, aw: string) => current.filter((i) => !i.droppedAt && i.kind !== "launch" && i.avatarId === av && i.awareness === aw).length;
  const coverage = pickers.avatars.map((a) => ({
    id: a.id, code: a.code ?? a.label, label: a.label,
    cells: AWARENESS.map((aw) => {
      const here = onMap.filter((c) => c.avatarId === a.id && c.awareness === aw).map(conceptState);
      return {
        awareness: aw,
        total: here.length,
        working: here.filter((s) => s === "won" || s === "recovering" || s === "deteriorating").length,
        lost: here.filter((s) => s === "lost" || s === "fading").length,
        moving: here.filter((s) => s === "writing" || s === "production" || s === "test").length,
        planned: plannedHere(a.id, aw),
      };
    }),
  }));

  const view: PlanView = {
    weekLabel: dayLabel(week), prevLabel: dayLabel(plan.prevWeek),
    cap: plan.plan?.cap ?? 8,
    locked: plan.plan?.lockedAt ? `${whenLabel(plan.plan.lockedAt)}${plan.plan.lockedBy ? ` by ${plan.plan.lockedBy}` : ""}` : null,
    items: [...carry.map((i) => toItem(i, true)), ...current.map((i) => toItem(i, false))],
    lastWeek, tests, winners, launches, coverage,
    log: plan.log.map((l) => ({ when: whenLabel(l.at), who: l.by, what: l.what })),
    hasMeta: Object.keys(map.results).length > 0,
    ok: plan.ok,
  };

  return (
    <TabPage tab="home" title={`Plan the week · ${view.weekLabel}`}>
      <PlanWeek view={view} ctx={ctx} pickers={pickers} order={{ items: order, prio: map.prio, version, now }} />
    </TabPage>
  );
}
