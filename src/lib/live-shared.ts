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
    if (frozen) for (const s of g.sides) frozenCount.add(kindOf.get(s.ad.campaignId) === "CBO" ? s.ad.campaignId : s.ad.adsetId ?? "");
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
    const state = conceptState(results);
    const t7: Totals = results.reduce((acc, r) => ({ ...acc, spend: acc.spend + r.t7.spend, sales: acc.sales + r.t7.sales, value: acc.value + r.t7.value }), { ...results[0].t7, spend: 0, sales: 0, value: 0 });
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
    const attention = !!top || ["fading", "deteriorating"].includes(state) || lostLive;
    live.push({
      key, kind: c.kind, info, track: info.track ?? c.track,
      group: attention ? "attention" : state === "won" ? "won" : state === "recovering" ? "recovering" : "testing",
      state, flag, flagTone: top ? (top.f === "twin" || top.f === "deteriorating" ? "orange" : "red") : null,
      cpa7: c7.cpa, line, cpa3: t3.sales ? t3.spend / t3.sales : null, sales3: t3.sales, spend7: c7.spend, sales7: c7.sales,
      daysLive: Math.max(...results.map((r) => r.daysLive)),
      live: liveVars, paused: pausedList.length ? `Paused: ${pausedList.join(", ")}` : "",
      isStatic: info.formatCode === "IMG", frozen: liveRes.some((r) => r.frozen),
    });
  }
  const order = { attention: 0, testing: 1, recovering: 2, won: 3 };
  live.sort((a, b) => order[a.group] - order[b.group] || b.spend7 - a.spend7);
  unmapped.sort((a, b) => Number(b.live) - Number(a.live) || b.spend7 - a.spend7);
  return { live, unmapped, states, frozenEntities: frozenCount.size, windows: w };
}
