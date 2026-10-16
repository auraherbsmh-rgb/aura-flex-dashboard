/**
 * Meta results → variations → concepts (data model §3, handoff §7 / §9, File 3 §1–§2). Pure functions, tested.
 *
 * Matching: a name starting with CBO_ is the CBO side of the same creative; the rest must equal a name the dashboard
 * generated (Script details / Testimonial) → linked to that variation. Else its base name (without _V#) may have been
 * tagged through "Tag an old ad" → linked to that old concept. Else UNMAPPED.
 * Windows end yesterday (Tunisia day): today is still attributing. Weeks run Monday–Sunday.
 */
import { killSpendFor, lineForOrderValue, type MoneyInputs } from "./money";

export type MetaAd = { adId: string; name: string; campaignId: string; adsetId: string | null; status: string | null; createdTime: string | null };
export type MetaDay = {
  adId: string; day: string; spend: number; purchases: number; purchaseValue: number; impressions: number; reach: number; linkClicks: number;
  plays3s: number; thruplays: number; p25: number; p50: number; p75: number; p100: number;
};
export type Scope = { campaignId: string; kind: "ABO" | "CBO"; track: string };
export type Budget = { entityId: string; day: string; dailyBudget: number | null };

export type State = "won" | "deteriorating" | "fading" | "recovering" | "testing" | "lost";
export const STATE_ORDER: State[] = ["won", "deteriorating", "fading", "recovering", "testing", "lost"];
export const STATE_TAG: Record<State, { word: string; tone: string }> = {
  won: { word: "WON", tone: "t-green" },
  deteriorating: { word: "DETERIORATING", tone: "t-orange" },
  fading: { word: "FADING", tone: "t-red" },
  recovering: { word: "RECOVERING", tone: "t-blue" },
  testing: { word: "TESTING", tone: "t-amber" },
  lost: { word: "LOST", tone: "t-grey" },
};
export type Flag = "kill" | "near_kill" | "fading" | "deteriorating" | "twin";

/** Normalised name: spaces around "_" removed, CBO_ split off, lower case for matching. */
export function parseName(raw: string) {
  const clean = raw.trim().replace(/\s*_\s*/g, "_").replace(/\s+/g, " ");
  const cbo = /^cbo_/i.test(clean);
  const name = cbo ? clean.slice(4) : clean;
  const m = name.match(/^(.*)_V(\d+)$/i);
  return { cbo, name, key: name.toLowerCase(), base: (m ? m[1] : name).toLowerCase(), v: m ? Number(m[2]) : null };
}

export type Owner =
  | { kind: "task"; taskId: string; v: number }
  | { kind: "old"; oldId: string; v: number | null }
  | { kind: "unmapped"; base: string };

/** Which concept an ad belongs to. `generated` maps lower-case dashboard ad names → task + V#; `old` maps lower-case base names → old concept. */
export function ownerOf(name: string, generated: Map<string, { taskId: string; v: number }>, old: Map<string, string>): Owner {
  const p = parseName(name);
  const g = generated.get(p.key);
  if (g) return { kind: "task", taskId: g.taskId, v: g.v };
  const o = old.get(p.base);
  if (o) return { kind: "old", oldId: o, v: p.v };
  return { kind: "unmapped", base: p.base };
}

const day = (ms: number) => new Date(ms + 36e5).toISOString().slice(0, 10); // Tunisia day
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

export type Totals = { spend: number; sales: number; value: number; impressions: number; reach: number; clicks: number; plays3s: number; thruplays: number; p25: number; p50: number; p75: number; p100: number };
const ZERO: Totals = { spend: 0, sales: 0, value: 0, impressions: 0, reach: 0, clicks: 0, plays3s: 0, thruplays: 0, p25: 0, p50: 0, p75: 0, p100: 0 };
export function sum(rows: MetaDay[], from?: string, to?: string): Totals {
  const t = { ...ZERO };
  for (const r of rows) {
    if ((from && r.day < from) || (to && r.day > to)) continue;
    t.spend += r.spend; t.sales += r.purchases; t.value += r.purchaseValue; t.impressions += r.impressions; t.reach += r.reach; t.clicks += r.linkClicks;
    t.plays3s += r.plays3s; t.thruplays += r.thruplays; t.p25 += r.p25; t.p50 += r.p50; t.p75 += r.p75; t.p100 += r.p100;
  }
  return t;
}
export const cpa = (t: Totals) => (t.sales ? t.spend / t.sales : null);

export type Windows = { yesterday: string; d7: [string, string]; d3: [string, string]; d30: [string, string]; weeks: [string, string][] };
/** Windows ending yesterday; `weeks` = the last 5 full Monday–Sunday weeks, newest first. */
export function windows(now: number): Windows {
  const y = day(now - 864e5);
  const today = day(now);
  const dow = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7; // 0 = Monday
  const lastSunday = addDays(today, -dow - 1);
  const weeks: [string, string][] = [];
  for (let i = 0; i < 5; i++) weeks.push([addDays(lastSunday, -6 - 7 * i), addDays(lastSunday, -7 * i)]);
  return { yesterday: y, d7: [addDays(y, -6), y], d3: [addDays(y, -2), y], d30: [addDays(y, -29), y], weeks };
}

/** The line a set of results is judged against: from its order value (File 3 §2); no sale yet → business line. */
export function lineFor(t: Totals, m: MoneyInputs): number {
  if (!t.sales || !t.value) return m.businessLineUsd;
  return lineForOrderValue(t.value / t.sales, m);
}

export type SideResult = { adId: string; side: "ABO" | "CBO"; status: string | null; live: boolean; t7: Totals; t3: Totals; life: Totals; line: number };
export type VariationResult = {
  key: string; // concept key + V#
  v: number | null;
  sides: SideResult[];
  live: boolean;
  life: Totals; t7: Totals; t3: Totals; t30: Totals;
  weeks: { from: string; to: string; cpa: number | null; sales: number }[];
  line: number;
  cpa7: number | null; cpa3: number | null; cpaLife: number | null;
  state: State;
  everWon: boolean;
  flags: Flag[];
  frozen: boolean;
  hookRate: number | null; hold: number | null; ctr: number | null;
  daysLive: number;
};

const LIVE = new Set(["ACTIVE", "IN_PROCESS", "WITH_ISSUES"]);
export const isLive = (status: string | null) => !!status && LIVE.has(status);

/**
 * One variation (both sides) → numbers, state and flags.
 * States (File 3 + handoff §7, founder decisions Oct 15): Testing under 10 sales and under its kill-table spend ·
 * Lost: kill-table spend reached with 0–9 sales, or never Won and 10+ sales with 2 full weeks in a row over its line,
 * or paused while never Won · Won: 10+ sales, $40+ spend, 7d CPA under its line (and stays won) · Deteriorating: was Won,
 * last full week over · Fading: was Won, 2 full weeks in a row over · Recovering: was Won, 30d over, 7d under.
 */
export function judgeVariation(
  key: string, v: number | null,
  sides: { ad: MetaAd; side: "ABO" | "CBO"; rows: MetaDay[] }[],
  m: MoneyInputs, w: Windows, frozen: boolean,
): VariationResult {
  const all = sides.flatMap((s) => s.rows);
  const life = sum(all, undefined, w.yesterday);
  const t7 = sum(all, ...w.d7);
  const t3 = sum(all, ...w.d3);
  const t30 = sum(all, ...w.d30);
  const line = lineFor(t7.sales ? t7 : life, m);
  const weeks = w.weeks.map(([from, to]) => { const t = sum(all, from, to); return { from, to, cpa: cpa(t), sales: t.sales }; });
  const over = (c: number | null, spend: number) => (c === null ? spend > line : c > line);
  const weekOver = (i: number) => { const t = sum(all, ...w.weeks[i]); return t.spend > 0 && over(cpa(t), t.spend); };
  const live = sides.some((s) => isLive(s.ad.status));
  const cpa7 = cpa(t7);

  // Won at some point: 10+ sales and $40+ spent by the end of a full week (or yesterday) with that 7d CPA under the line.
  const checkpoints = [w.d7, ...w.weeks];
  const everWon = checkpoints.some(([from, to]) => {
    const upto = sum(all, undefined, to);
    const win = sum(all, from, to);
    return upto.sales >= 10 && upto.spend >= 40 && win.sales > 0 && (cpa(win) ?? Infinity) <= line;
  });

  let state: State;
  const kill = life.sales < 10 ? killSpendFor(life.sales, m) : null;
  if (everWon) {
    if (weekOver(0) && weekOver(1)) state = "fading";
    else if (weekOver(0)) state = "deteriorating";
    else if (cpa7 !== null && cpa7 <= line && over(cpa(t30), t30.spend)) state = "recovering";
    else state = "won";
  } else if (kill !== null && life.spend >= kill) state = "lost";
  else if (life.sales >= 10 && weekOver(0) && weekOver(1)) state = "lost";
  else if (!live && life.spend > 0 && sides.every((s) => s.ad.status === "PAUSED" || s.ad.status === "ADSET_PAUSED" || s.ad.status === "CAMPAIGN_PAUSED")) state = "lost";
  else state = "testing";

  const flags: Flag[] = [];
  if (live && !frozen) {
    if (kill !== null && life.spend >= kill) flags.push("kill");
    else if (kill !== null && life.spend >= 0.8 * kill) flags.push("near_kill");
    if (state === "fading") flags.push("fading");
    if (state === "deteriorating") flags.push("deteriorating");
    const sideRes = sides.map((s) => sum(s.rows, ...w.d7));
    if (sides.length === 2 && sideRes.every((t) => t.sales >= 5)) {
      const o = sideRes.map((t) => (cpa(t) ?? Infinity) > line);
      if (o[0] !== o[1]) flags.push("twin");
    }
  }

  const firstDay = all.filter((r) => r.spend > 0).map((r) => r.day).sort()[0];
  return {
    key, v,
    sides: sides.map((s) => {
      const st7 = sum(s.rows, ...w.d7);
      return { adId: s.ad.adId, side: s.side, status: s.ad.status, live: isLive(s.ad.status), t7: st7, t3: sum(s.rows, ...w.d3), life: sum(s.rows, undefined, w.yesterday), line: lineFor(st7.sales ? st7 : life, m) };
    }),
    live, life, t7, t3, t30, weeks, line,
    cpa7, cpa3: cpa(t3), cpaLife: cpa(life),
    state, everWon, flags, frozen,
    hookRate: t7.impressions ? t7.plays3s / t7.impressions : null,
    hold: t7.plays3s ? t7.thruplays / t7.plays3s : null,
    ctr: t7.impressions ? t7.clicks / t7.impressions : null,
    daysLive: firstDay ? Math.max(1, Math.round((Date.parse(w.yesterday) - Date.parse(firstDay)) / 864e5) + 1) : 0,
  };
}

/** Budget changed in the last 48h on this ad set (ABO) or campaign (CBO) → no verdict (File 4 §4, Live ads trust line). */
export function budgetChanged(entityId: string | null, budgets: Budget[], now: number): boolean {
  if (!entityId) return false;
  const list = budgets.filter((b) => b.entityId === entityId).sort((a, b) => a.day.localeCompare(b.day));
  const today = day(now);
  const recent = list.filter((b) => b.day >= addDays(today, -2));
  const before = list.filter((b) => b.day < addDays(today, -2)).at(-1);
  const seq = [before, ...recent].filter(Boolean) as Budget[];
  for (let i = 1; i < seq.length; i++) if (seq[i].dailyBudget !== seq[i - 1].dailyBudget) return true;
  return false;
}

/** A concept takes the state of its best variation; its 7d CPA counts every live variation, both sides. */
export function conceptState(vars: VariationResult[]): State {
  return vars.map((v) => v.state).sort((a, b) => STATE_ORDER.indexOf(a) - STATE_ORDER.indexOf(b))[0] ?? "testing";
}
export function conceptCpa7(vars: VariationResult[]) {
  const live = vars.filter((v) => v.live);
  const spend = live.reduce((n, v) => n + v.t7.spend, 0);
  const sales = live.reduce((n, v) => n + v.t7.sales, 0);
  return { spend, sales, cpa: sales ? spend / sales : null };
}

/** Group the ads of the account into variations by owner (task V# / old concept V# / unmapped base). */
export function groupAds(
  ads: MetaAd[], daily: MetaDay[], scope: Scope[],
  generated: Map<string, { taskId: string; v: number }>, old: Map<string, string>,
) {
  const kindOf = new Map(scope.map((s) => [s.campaignId, s.kind]));
  const rowsBy = new Map<string, MetaDay[]>();
  for (const r of daily) { const l = rowsBy.get(r.adId) ?? []; l.push(r); rowsBy.set(r.adId, l); }
  const groups = new Map<string, { owner: Owner; v: number | null; sides: { ad: MetaAd; side: "ABO" | "CBO"; rows: MetaDay[] }[] }>();
  for (const ad of ads) {
    if (!kindOf.has(ad.campaignId)) continue;
    const owner = ownerOf(ad.name, generated, old);
    const p = parseName(ad.name);
    const side: "ABO" | "CBO" = p.cbo || kindOf.get(ad.campaignId) === "CBO" ? "CBO" : "ABO";
    const concept = owner.kind === "task" ? `t:${owner.taskId}` : owner.kind === "old" ? `o:${owner.oldId}` : `u:${owner.base}`;
    const v = owner.kind === "unmapped" ? p.v : owner.v;
    const key = `${concept}|${v ?? "?"}`;
    const g = groups.get(key) ?? { owner, v, sides: [] };
    g.sides.push({ ad, side, rows: rowsBy.get(ad.adId) ?? [] });
    groups.set(key, g);
  }
  return groups;
}

/** Days of Meta results loaded to judge a concept (Live ads and the results refresh use the same window, so a win
 * stays visible for a year; older data is not judged). */
export const JUDGE_DAYS = 400;
/** Pages (Live ads, Home) read a shorter window for speed; past wins come from concept_results (judged on JUDGE_DAYS). */
export const PAGE_DAYS = 120;
