/**
 * Business · Creative engine (handoff §10, artboard "Engine"): "Is the creative chain keeping up?"
 * Revenue = profitable concepts running at once × what each can spend; this tracks how fast we make them and where
 * the chain gets stuck. Pure: tested in tests/business.test.ts.
 */
import type { LibRow } from "./library-shared";
import type { ConceptResult, TaskRow } from "./tasks-shared";
import type { EditRound } from "./editing-shared";

export type StateLog = { taskId: string; state: string; live?: boolean; at: string };
export type CostParts = { copywriters: number; copywriterPerScript: number; agency: number; strategist: number; editingPerVideo: number; copywritersNote: string };
export type PeriodKey = "4w" | "3m";

const ALIVE = new Set(["won", "deteriorating", "recovering"]);
const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r1 = (x: number | null) => (x === null ? null : Math.round(x * 10) / 10);
const inP = (iso: string | null | undefined, from: number, to: number) => !!iso && Date.parse(iso) >= from && Date.parse(iso) < to;

export type ChainStep = { key: "created" | "approved" | "produced" | "launched" | "won"; label: string; n: number; conv: number | null; days: number | null; daysLabel: string; href: string; bottleneck: boolean };
export type SpeedGroup = { name: string; segs: number[]; total: number; n: number };
export type EngineView = {
  alive: number; aliveLine: { week: string; n: number }[]; born: number; faded: number;
  pace: { standStill: number | null; grow: number | null; actual: number; fadingPerMonth: number; winRate: number | null; word: "GROWING PACE" | "STANDING STILL" | "FALLING BEHIND" | "NO VERDICT YET"; standBar: number; growBar: number };
  chain: ChainStep[]; won: { won: number; settled: number; testing: number };
  speed: { median: number | null; before: number | null; beforeLabel: string; groups: Record<"all" | "format" | "cw" | "ed" | "month", SpeedGroup[]>; slowest: Record<"all" | "format" | "cw" | "ed" | "month", string | null> };
  cost: { month: number; perLaunched: number | null; perWinner: number | null; ret: number | null; parts: string; launched: number; winners: number; winnersProfit: number | null };
};

export const STEP_LABELS = ["Writing", "Script review", "Details", "Agency · shoot + footage", "Editing + review", "Launch"];
const STEP_SHORT = ["writing", "script review", "details", "agency", "editing", "launch"];
const monthLabel = (ym: string, thisYm: string) => {
  const name = new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  return ym === thisYm ? `${name} so far` : name;
};

export function buildEngine(input: {
  period: PeriodKey; now: number; tasks: TaskRow[]; lib: LibRow[]; results: Record<string, ConceptResult>; editRounds: Map<string, EditRound[]>;
  launchedAt: Map<string, string | null>; log: StateLog[]; cost: CostParts; winnersMoney: Map<string, { sales: number; spendUsd: number }>;
  /** USD earned per Meta purchase before ads (and before fixed costs, which include the engine); null without Meta. */
  marginUsd: number; rate: number; hasMeta: boolean;
}): EngineView {
  const { period, now, tasks, lib, results, editRounds, launchedAt, log, cost, winnersMoney, marginUsd, rate, hasMeta } = input;
  const span = period === "4w" ? 28 * 864e5 : 91 * 864e5;
  const from = now - span, to = now;
  const months = span / (30.4 * 864e5);

  // 1. Winning concepts alive now + 12-week line (from the state log) + born vs faded or lost this month.
  // Alive = a winning state AND still live in Meta (a paused winner left the account).
  const aliveAt = (taskId: string, t: number) => {
    let s: StateLog | null = null;
    for (const e of log) if (e.taskId === taskId && Date.parse(e.at) <= t) s = e;
    return !!s && ALIVE.has(s.state) && s.live !== false;
  };
  const ids = [...new Set(log.map((e) => e.taskId))];
  const aliveNow = Object.values(results).filter((r) => ALIVE.has(r.state) && r.live).length;
  const aliveLine = Array.from({ length: 12 }, (_, i) => {
    const t = now - (11 - i) * 7 * 864e5;
    return { week: new Date(t + 36e5).toISOString().slice(0, 10), n: i === 11 ? aliveNow : ids.filter((id) => aliveAt(id, t)).length };
  });
  const monthStart = Date.parse(`${new Date(now + 36e5).toISOString().slice(0, 7)}-01T00:00:00+01:00`);
  const born = Object.values(results).filter((r) => r.wonAt && Date.parse(r.wonAt) >= monthStart).length;
  const everWon = new Set(Object.values(results).filter((r) => r.everWon).map((r) => r.taskId));
  const fadedIds = (since: number) => new Set(log.filter((e) => everWon.has(e.taskId) && (e.state === "fading" || e.state === "lost" || e.live === false) && Date.parse(e.at) >= since).map((e) => e.taskId));
  const faded = fadedIds(monthStart).size;

  // Settled in the period: won (first win in the period) or lost (verdict in the period).
  let won = 0, settled = 0;
  for (const r of Object.values(results)) {
    const at = r.everWon ? r.wonAt ?? r.stateSince : r.state === "lost" ? r.stateSince : null;
    if (!inP(at, from, to)) continue;
    settled++;
    if (r.everWon) won++;
  }
  const testing = Object.values(results).filter((r) => r.state === "testing" && !r.everWon && r.live).length;
  const winRate = settled ? won / settled : null;

  // 2. Pace needed: launches per month to replace what fades at the current win rate, and to grow +2 winners a month.
  const fadingPerMonth = fadedIds(from).size / months;
  const launchedIn = [...launchedAt.entries()].filter(([, at]) => inP(at, from, to)).map(([id]) => id);
  const actual = launchedIn.length / months;
  const standStill = winRate ? fadingPerMonth / winRate : null;
  const grow = winRate ? (fadingPerMonth + 2) / winRate : null;
  // No settled concept = no verdict; settled but none won = falling behind (nothing replaces what fades).
  const word = !settled ? "NO VERDICT YET" : !winRate ? "FALLING BEHIND" : grow !== null && actual >= grow ? "GROWING PACE" : standStill !== null && actual >= standStill ? "STANDING STILL" : "FALLING BEHIND";

  // 3. The chain in the period: each step's count, conversion from the step before and its median days.
  const created = tasks.filter((t) => inP(t.createdAt, from, to));
  const approvals = tasks.flatMap((t) => t.rounds.filter((x) => x.decision === "approved" && inP(x.decidedAt, from, to)).slice(0, 1).map((x) => ({ t, at: x.decidedAt! })));
  const produced = [...editRounds.entries()].filter(([, rs]) => rs.some((x) => x.decision === "approved" && inP(x.decidedAt, from, to))).map(([id]) => id);
  const libBy = new Map(lib.map((r) => [r.taskId, r]));
  const med = (rows: (LibRow | undefined)[], i: number) => r1(median(rows.filter((r): r is LibRow => !!r).map((r) => r.days[i]).filter((d) => d > 0)));
  const writing = r1(median(created.filter((t) => t.rounds[0]?.submittedAt).map((t) => (Date.parse(t.rounds[0].submittedAt) - Date.parse(t.createdAt)) / 864e5).filter((d) => d >= 0)));
  const review = r1(median(approvals.map(({ t, at }) => (t.rounds[0]?.submittedAt ? (Date.parse(at) - Date.parse(t.rounds[0].submittedAt)) / 864e5 : -1)).filter((d) => d >= 0)));
  const agency = med(produced.map((id) => libBy.get(id)), 3);
  const editing = med(launchedIn.map((id) => libBy.get(id)), 4);
  // Conversion on one cohort: of the items that reached the step before in the period, how many reached this step (≤ 100%).
  const conv = (a: number, b: number) => (b ? a / b : null);
  const approvedIds = new Set(tasks.filter((t) => t.rounds.some((x) => x.decision === "approved")).map((t) => t.id));
  const producedIds = new Set([...editRounds.entries()].filter(([, rs]) => rs.some((x) => x.decision === "approved")).map(([id]) => id));
  const launchedIds = new Set([...launchedAt.entries()].filter(([, at]) => !!at).map(([id]) => id));
  const cApproved = conv(created.filter((t) => approvedIds.has(t.id)).length, created.length);
  const cProduced = conv(approvals.filter(({ t }) => producedIds.has(t.id)).length, approvals.length);
  const cLaunched = conv(produced.filter((id) => launchedIds.has(id)).length, produced.length);
  const steps: ChainStep[] = [
    { key: "created", label: "Tasks created", n: created.length, conv: null, days: writing, daysLabel: "writing", href: "/copywriting?view=pipeline", bottleneck: false },
    { key: "approved", label: "Scripts approved", n: approvals.length, conv: cApproved, days: review, daysLabel: "review", href: "/copywriting?view=pipeline", bottleneck: false },
    { key: "produced", label: "Produced", n: produced.length, conv: cProduced, days: agency, daysLabel: "agency", href: "/editing?view=pipeline", bottleneck: false },
    { key: "launched", label: "Launched", n: launchedIn.length, conv: cLaunched, days: editing, daysLabel: "editing", href: "/editing?view=pipeline", bottleneck: false },
    { key: "won", label: "Won", n: won, conv: winRate, days: null, daysLabel: "", href: "/copywriting?view=library", bottleneck: false },
  ];
  // Bottleneck = the step that takes longest (median days).
  const slowStep = steps.filter((s) => s.days !== null).sort((a, b) => (b.days as number) - (a.days as number))[0];
  if (slowStep) slowStep.bottleneck = true;

  // 4. Speed · idea to live ad: launched in the period, median days per step, split by a dimension.
  const done = lib.filter((r) => r.done && inP(r.launchedAt, from, to));
  // Compared with the same-length window 3 months ago.
  const back = 91 * 864e5;
  const before = lib.filter((r) => r.done && inP(r.launchedAt, from - back, to - back));
  // One definition everywhere: a group's days = the sum of its median days per step.
  const segsOf = (rows: LibRow[]) => STEP_LABELS.map((_, i) => r1(median(rows.map((r) => r.days[i]))) ?? 0);
  const totalOf = (rows: LibRow[]) => (rows.length ? r1(segsOf(rows).reduce((a, b) => a + b, 0)) : null);
  const groupBy = (keyOf: (r: LibRow) => string, byKey = false): SpeedGroup[] => {
    const m = new Map<string, LibRow[]>();
    for (const r of done) m.set(keyOf(r), [...(m.get(keyOf(r)) ?? []), r]);
    const out = [...m.entries()].map(([name, rows]) => {
      const segs = segsOf(rows);
      return { name, segs, total: r1(segs.reduce((a, b) => a + b, 0)) ?? 0, n: rows.length };
    });
    return byKey ? out.sort((a, b) => a.name.localeCompare(b.name)) : out.sort((a, b) => b.total - a.total);
  };
  const thisYm = new Date(now + 36e5).toISOString().slice(0, 7);
  const ymOf = (iso: string) => new Date(Date.parse(iso) + 36e5).toISOString().slice(0, 7);
  const groups = {
    all: groupBy(() => "All scripts"),
    format: groupBy((r) => r.format),
    cw: groupBy((r) => r.copywriter),
    ed: groupBy((r) => r.editor ?? "No editor"),
    month: groupBy((r) => ymOf(r.launchedAt!), true).map((g) => ({ ...g, name: monthLabel(g.name, thisYm) })),
  };
  // "Agency step · 4.5 of 13 d" (all scripts) · "Doctor video · 16 d · agency 6 d" (a split: the slowest group).
  const slowOf = (gs: SpeedGroup[], all = false) => {
    const g = [...gs].sort((a, b) => b.total - a.total)[0];
    if (!g || Math.max(...g.segs) <= 0) return null;
    const i = g.segs.indexOf(Math.max(...g.segs));
    return all ? `${STEP_SHORT[i][0].toUpperCase()}${STEP_SHORT[i].slice(1)} step · ${g.segs[i]} of ${g.total} d` : `${g.name} · ${g.total} d · ${STEP_SHORT[i]} ${g.segs[i]} d`;
  };
  const speed = {
    median: totalOf(done), before: totalOf(before), beforeLabel: "3 months ago", groups,
    slowest: { all: slowOf(groups.all, true), format: slowOf(groups.format), cw: slowOf(groups.cw), ed: slowOf(groups.ed), month: slowOf(groups.month) },
  };

  // 5. Engine cost and return (per month; the period's videos approved × pay per video).
  const videos = produced.length / months;
  const scriptsPerMonth = approvals.length / months;
  const cwMonth = cost.copywriters + cost.copywriterPerScript * scriptsPerMonth;
  const monthCost = cwMonth + cost.agency + cost.strategist + cost.editingPerVideo * videos;
  const periodCost = monthCost * months;
  const winnersInPeriod = Object.values(results).filter((r) => inP(r.wonAt, from, to)).length;
  // Profit earned by winning concepts after ad spend: purchases × margin per purchase − spend (fixed costs, which hold the
  // engine's own pay, are left out so the engine is not counted twice).
  let winnersProfit: number | null = null;
  if (hasMeta) {
    winnersProfit = 0;
    for (const [id, x] of winnersMoney) if (results[id]?.everWon) winnersProfit += (x.sales * marginUsd - x.spendUsd) * rate;
  }
  // Pace bars on one scale (the biggest of the two targets and the actual pace).
  const paceScale = Math.max(1, (grow ?? 0) * 1.12, actual * 1.12);
  return {
    alive: aliveNow, aliveLine, born, faded,
    pace: { standStill: standStill === null ? null : Math.ceil(standStill), grow: grow === null ? null : Math.ceil(grow), actual: Math.round(actual * 10) / 10, fadingPerMonth: Math.round(fadingPerMonth * 10) / 10, winRate, word,
      standBar: standStill === null ? 0 : Math.min(100, (standStill / paceScale) * 100), growBar: grow === null ? 0 : Math.min(100, (grow / paceScale) * 100) },
    chain: steps, won: { won, settled, testing }, speed,
    cost: {
      month: Math.round(monthCost), perLaunched: launchedIn.length ? Math.round(periodCost / launchedIn.length) : null, perWinner: winnersInPeriod ? Math.round(periodCost / winnersInPeriod) : null,
      ret: winnersProfit !== null && periodCost ? Math.round((winnersProfit / periodCost) * 10) / 10 : null,
      parts: `Copywriters ${Math.round(cwMonth).toLocaleString("en-US")}${cost.copywritersNote} · agency ${cost.agency.toLocaleString("en-US")} · editing ${cost.editingPerVideo} × ${Math.round(videos * 10) / 10} videos · strategist ${cost.strategist.toLocaleString("en-US")}`,
      launched: launchedIn.length, winners: winnersInPeriod, winnersProfit: winnersProfit === null ? null : Math.round(winnersProfit),
    },
  };
}
