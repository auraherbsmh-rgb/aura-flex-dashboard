/**
 * Live ads model (handoff §9, artboard "Live ads"): one row per concept that has a live variation, problems first,
 * with its variations (ABO / CBO sides). Also gives every concept's state to the map, Library and inbox (results).
 * Pure: the page loads the data, this turns it into rows. Tested in tests/meta.test.ts.
 */
import { budgetChanged, conceptCpa7, conceptState, cpa, groupAds, judgeVariation, lineFor, parseName, windows, type Budget, type Flag, type MetaAd, type MetaDay, type Scope, type State, type Totals, type VariationResult } from "./meta-shared";
import type { MoneyInputs } from "./money";

export type ConceptInfo = {
  key: string; // "t:<task id>" or "o:<old concept id>"
  name: string; cell: string; angle: string; format: string; formatCode: string; track: string | null;
  copywriter: string | null; editor: string | null; launchedAt: string | null; taskId: string | null;
  hooks: Record<number, { type: string | null; line: string; name: string }>;
};

export type LiveVariation = {
  v: number | null; name: string; type: string | null; line: string | null; why: string; hot: boolean;
  res: VariationResult; adIds: string[];
};
export type LiveConcept = {
  key: string; kind: "task" | "old" | "unmapped"; info: ConceptInfo;
  group: "attention" | "testing" | "recovering" | "won";
  state: State; flag: string | null; flagTone: "red" | "orange" | null;
  cpa7: number | null; line: number; cpa3: number | null; sales3: number; spend7: number; sales7: number; daysLive: number;
  live: LiveVariation[]; paused: string; isStatic: boolean; frozen: boolean; track: string | null;
};
export type Unmapped = { base: string; example: string; adIds: string[]; live: boolean; spend7: number; sales7: number; formatGuess: string; campaignTrack: string | null };

const money = (n: number) => `$${n < 10 ? n.toFixed(2) : Math.round(n)}`;

/** Why a variation sits where it does (artboard "why here"), in plain words. */
export function whyHere(r: VariationResult, m: MoneyInputs): string {
  const kill = r.life.sales < 10 ? m.killTableUsd[r.life.sales] : null;
  if (r.frozen) return "Budget changed in the last 48h: no verdict yet";
  if (r.flags.includes("kill") && kill != null) return `Kill table reached: ${money(r.life.spend)} spent at ${r.life.sales} sale${r.life.sales === 1 ? "" : "s"} (kill at ${money(kill)})`;
  if (r.flags.includes("twin")) {
    const [a, b] = r.sides;
    const aOver = (cpa(a.t7) ?? Infinity) > r.line;
    return `${aOver ? b.side : a.side} healthy, ${aOver ? a.side : b.side} over the line: check the twin handoff`;
  }
  if (r.state === "fading") return `Weeks: ${r.weeks.slice(0, 2).reverse().map((w) => (w.cpa === null ? "no sale" : money(w.cpa))).join(" → ")}, over own line ${money(r.line)}`;
  if (r.state === "deteriorating") return "Won, now 1 week over its own line";
  if (r.state === "recovering") return "30d above its line, last 7d back under";
  if (r.state === "won") return "Under its own line, stable";
  if (r.state === "lost") return r.life.sales >= 10 ? "2 full weeks over its own line, never won" : "Lost: never won";
  if (r.flags.includes("near_kill") && kill != null) return `${money(r.life.spend)} spent, ${r.life.sales} sale${r.life.sales === 1 ? "" : "s"}: ${money(Math.max(0, kill - r.life.spend))} left before the kill line (${money(kill)})`;
  return `To win: ${Math.min(r.life.sales, 10)} / 10 sales · ${money(Math.min(r.life.spend, 40))} / $40${kill != null && r.life.spend < 0.8 * kill ? " · kill line safe" : ""}`;
}

const FLAG_WORD: Record<Flag, string> = { kill: "KILL LINE", near_kill: "NEAR KILL LINE", fading: "FADING", deteriorating: "DETERIORATING", twin: "TWIN SPLIT" };

export function buildLive(input: {
  ads: MetaAd[]; daily: MetaDay[]; scope: Scope[]; budgets: Budget[];
  generated: Map<string, { taskId: string; v: number }>; old: Map<string, string>;
  concepts: Map<string, ConceptInfo>; money: MoneyInputs; now: number;
}) {
  const { ads, daily, scope, budgets, generated, old, concepts, money: m, now } = input;
  const w = windows(now);
  const trackOf = new Map(scope.map((s) => [s.campaignId, s.track]));
  const kindOf = new Map(scope.map((s) => [s.campaignId, s.kind]));
  const groups = groupAds(ads, daily, scope, generated, old);

  const byConcept = new Map<string, { kind: "task" | "old" | "unmapped"; vars: { res: VariationResult; adIds: string[]; names: string[] }[]; track: string | null }>();
  const frozenCount = new Set<string>();
  for (const [key, g] of groups) {
    const concept = key.split("|")[0];
    // Freeze when any side's ad set (ABO) or campaign (CBO) changed budget in the last 48h.
    const frozen = g.sides.some((s) => budgetChanged(kindOf.get(s.ad.campaignId) === "CBO" ? s.ad.campaignId : s.ad.adsetId, budgets, now));
    if (frozen) for (const s of g.sides) { const id = kindOf.get(s.ad.campaignId) === "CBO" ? s.ad.campaignId : s.ad.adsetId; if (id) frozenCount.add(id); }
    const res = judgeVariation(key, g.v, g.sides, m, w, frozen);
    const c = byConcept.get(concept) ?? { kind: g.owner.kind, vars: [], track: trackOf.get(g.sides[0].ad.campaignId) ?? null };
    c.vars.push({ res, adIds: g.sides.map((s) => s.ad.adId), names: g.sides.map((s) => s.ad.name) });
    byConcept.set(concept, c);
  }

  const live: LiveConcept[] = [];
  const unmapped: Unmapped[] = [];
  const states = new Map<string, { state: State; cpa7: number | null; line: number; vars: VariationResult[] }>();
  for (const [key, c] of byConcept) {
    const results = c.vars.map((x) => x.res);
    // A live concept is judged on its live variations only (a paused V1 that once won does not make it Won).
    const judged = results.some((r) => r.live) ? results.filter((r) => r.live) : results;
    const state = conceptState(judged);
    const t7: Totals = judged.reduce((acc, r) => ({ ...acc, spend: acc.spend + r.t7.spend, sales: acc.sales + r.t7.sales, value: acc.value + r.t7.value }), { ...judged[0].t7, spend: 0, sales: 0, value: 0 });
    const line = lineFor(t7, m);
    states.set(key, { state, cpa7: conceptCpa7(results).cpa, line, vars: results });
    if (c.kind === "unmapped") {
      const first = c.vars[0];
      const base = key.slice(2);
      const p = parseName(first.names[0]);
      unmapped.push({
        base, example: p.name, adIds: c.vars.flatMap((x) => x.adIds), live: results.some((r) => r.live),
        spend7: results.reduce((n, r) => n + r.t7.spend, 0), sales7: results.reduce((n, r) => n + r.t7.sales, 0),
        formatGuess: p.name.split("_")[0].toUpperCase(), campaignTrack: c.track,
      });
      continue;
    }
    if (!results.some((r) => r.live)) continue;
    const info = concepts.get(key) ?? { key, name: "Unknown", cell: "—", angle: "—", format: "—", formatCode: "?", track: c.track, copywriter: null, editor: null, launchedAt: null, taskId: null, hooks: {} };
    const liveVars = c.vars.filter((x) => x.res.live).map((x) => {
      const h = x.res.v !== null ? info.hooks[x.res.v] : undefined;
      return { v: x.res.v, name: h?.name ?? parseName(x.names[0]).name, type: h?.type ?? null, line: h?.line ?? null, why: whyHere(x.res, m), hot: x.res.flags.length > 0 || ["fading", "deteriorating", "lost"].includes(x.res.state), res: x.res, adIds: x.adIds };
    }).sort((a, b) => Number(b.hot) - Number(a.hot) || (a.v ?? 99) - (b.v ?? 99));
    const flags = results.filter((r) => r.live).flatMap((r) => r.flags.map((f) => ({ f, v: r.v })));
    const top = flags.find((x) => x.f === "kill") ?? flags.find((x) => x.f === "twin") ?? flags.find((x) => x.f === "near_kill") ?? flags[0];
    const flag = top ? (top.f === "twin" ? `TWIN SPLIT ON V${top.v}` : top.f === "near_kill" ? `${flags.filter((x) => x.f === "near_kill").length} VARIATION${flags.filter((x) => x.f === "near_kill").length > 1 ? "S" : ""} NEAR KILL LINE` : FLAG_WORD[top.f]) : null;
    const liveRes = liveVars.map((x) => x.res);
    const t3 = liveRes.reduce((acc, r) => ({ spend: acc.spend + r.t3.spend, sales: acc.sales + r.t3.sales }), { spend: 0, sales: 0 });
    const c7 = conceptCpa7(results);
    const pausedList = c.vars.filter((x) => !x.res.live && x.res.life.spend > 0).map((x) => `V${x.res.v ?? "?"}${info.hooks[x.res.v ?? -1]?.type ? ` ${info.hooks[x.res.v ?? -1]?.type}` : ""}`);
    const lostLive = liveRes.some((r) => r.state === "lost");
    // Budget changed in the last 48h: those variations have no verdict (no flags). The concept shows "no verdict" only when
    // every live variation is frozen; while any is, it cannot be Won / Recovering, but a flag on another ad set still counts.
    const anyFrozen = liveRes.some((r) => r.frozen);
    const frozen = liveRes.every((r) => r.frozen);
    const attention = !!top || (!anyFrozen && (["fading", "deteriorating"].includes(state) || lostLive));
    live.push({
      key, kind: c.kind, info, track: info.track ?? c.track,
      group: attention ? "attention" : anyFrozen ? "testing" : state === "won" ? "won" : state === "recovering" ? "recovering" : "testing",
      state, flag, flagTone: top ? (top.f === "twin" || top.f === "deteriorating" ? "orange" : "red") : null,
      cpa7: c7.cpa, line, cpa3: t3.sales ? t3.spend / t3.sales : null, sales3: t3.sales, spend7: c7.spend, sales7: c7.sales,
      daysLive: Math.max(...liveRes.map((r) => r.daysLive)),
      live: liveVars, paused: pausedList.length ? `Paused: ${pausedList.join(", ")}` : "",
      isStatic: info.formatCode === "IMG", frozen,
    });
  }
  const order = { attention: 0, testing: 1, recovering: 2, won: 3 };
  live.sort((a, b) => order[a.group] - order[b.group] || b.spend7 - a.spend7);
  unmapped.sort((a, b) => Number(b.live) - Number(a.live) || b.spend7 - a.spend7);
  return { live, unmapped, states, frozenEntities: frozenCount.size, windows: w };
}

/* ───────────── Home items from Live ads (Meta 4) ───────────── */

export type PauseAnswer = { adId: string; answer: "paused" | "not_now"; reason: string | null; answeredAt: string };
export type KillNeed = {
  key: string; adId: string; name: string; flag: Exclude<Flag, "near_kill">; reason: string; concept: string;
  /** When the problem started (kill table crossed, this week's verdict, or the last "Not now"). */
  sinceMs: number;
  /** Set when the founder said "Done, paused in Meta" but a later pull still finds the ad active. */
  recheck: string | null;
};
export type UnmappedNeed = { key: string; u: Unmapped; sinceMs: number };

const FLAG_ORDER: Exclude<Flag, "near_kill">[] = ["kill", "fading", "deteriorating", "twin"];
const pullMs = (dayStr: string) => Date.parse(`${dayStr}T05:00:00Z`); // the 06:00 Tunisia pull of that day
const nextDay = (d: string) => new Date(Date.parse(`${d}T12:00:00Z`) + 864e5).toISOString().slice(0, 10);

/**
 * KILL items (handoff §4 "Problem ads", §11): every live ad of a variation flagged kill line / fading / deteriorating,
 * and the over-the-line side of a twin split. Answers: "Done, paused" hides the item until the next pull, which verifies
 * (still active → back, marked "still active"); "Not now" hides it until the next pull, then it returns if still flagged.
 */
export function killNeeds(input: {
  live: LiveConcept[]; daily: MetaDay[]; adNames: Map<string, string>; answers: PauseAnswer[];
  lastPullAt: string | null; money: MoneyInputs; now: number;
}): KillNeed[] {
  const { live, daily, adNames, answers, lastPullAt, money: m, now } = input;
  const w = windows(now);
  const pulled = lastPullAt ? Date.parse(lastPullAt) : 0;
  const rowsBy = new Map<string, MetaDay[]>();
  for (const r of daily) rowsBy.set(r.adId, [...(rowsBy.get(r.adId) ?? []), r]);
  const lastAnswer = new Map<string, PauseAnswer>();
  for (const a of [...answers].sort((x, y) => x.answeredAt.localeCompare(y.answeredAt))) lastAnswer.set(a.adId, a);
  const out: KillNeed[] = [];
  for (const c of live) {
    for (const v of c.live) {
      const flag = FLAG_ORDER.find((f) => v.res.flags.includes(f));
      if (!flag) continue;
      // Which ads to pause: every live side, or for a twin split only the side over the line.
      const sides = v.res.sides.filter((s) => s.live && (flag !== "twin" || (cpa(s.t7) ?? Infinity) > v.res.line));
      // When it started: the kill table crossing day, else this week's Monday pull (weekly verdicts), else the last pull.
      let since = pulled || now;
      if (flag === "kill") {
        const rows = v.adIds.flatMap((id) => rowsBy.get(id) ?? []).sort((a, b) => a.day.localeCompare(b.day));
        let spend = 0, sales = 0;
        for (const r of rows) {
          spend += r.spend; sales += r.purchases;
          if (sales < 10 && spend >= m.killTableUsd[sales]) { since = pullMs(nextDay(r.day)); break; }
        }
      } else if (flag === "fading" || flag === "deteriorating") since = pullMs(nextDay(w.weeks[0][1]));
      for (const s of sides) {
        const ans = lastAnswer.get(s.adId);
        let recheck: string | null = null;
        let start = since;
        if (ans) {
          const at = Date.parse(ans.answeredAt);
          if (at >= pulled) continue; // answered since the last pull: wait for the next one
          if (ans.answer === "paused") recheck = `Marked paused ${new Date(at + 36e5).toISOString().slice(5, 10).replace("-", "/")}, still active in Meta`;
          else start = Math.max(start, at);
        }
        out.push({
          key: `k-${s.adId}`, adId: s.adId, name: adNames.get(s.adId) ?? v.name, flag, reason: whyHere(v.res, m),
          concept: `${c.info.name} · ${c.info.cell} · V${v.v ?? "?"}${s.side === "CBO" ? " · CBO" : ""}`, sinceMs: Math.min(start, now), recheck,
        });
      }
    }
  }
  return out;
}

/** UNMAPPED items (both founders): live ads in scope whose name matches no task and no tagged old concept. */
export function unmappedNeeds(unmapped: Unmapped[], firstSeen: Map<string, string>, now: number): UnmappedNeed[] {
  return unmapped.filter((u) => u.live).map((u) => {
    const seen = u.adIds.map((id) => firstSeen.get(id)).filter(Boolean).map((t) => Date.parse(t as string));
    return { key: `u-${u.base}`, u, sinceMs: seen.length ? Math.min(...seen) : now };
  });
}
