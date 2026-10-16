import { test } from "node:test";
import assert from "node:assert/strict";
import { budgetChanged, conceptCpa7, conceptState, groupAds, judgeVariation, ownerOf, parseName, windows, type MetaAd, type MetaDay } from "../src/lib/meta-shared";
import type { MoneyInputs } from "../src/lib/money";

const SEP: MoneyInputs = {
  businessLineUsd: 4.18, aovBandLowUsd: 20, aovBandHighUsd: 26, exchangeRate: 3.35,
  killTableUsd: [13, 14, 20, 28, 38.5, 44, 50, 55, 60.5, 66],
  bottleCostTnd: 20.6, deliveryCostTnd: 13.0, fixedPerOrderTnd: 9.78, bridgeFactor: 0.6279,
  doorRate1b: 0.691, doorRate2b: 0.826, doorRate3b: 0.872, doorRateAvg: 0.749,
  price1bTnd: 59, price2bTnd: 90, price3bTnd: 129,
};
// Thursday Oct 16 2026, 10:00 Tunisia → yesterday = Oct 15; last full week = Oct 5–11.
const NOW = Date.parse("2026-10-16T09:00:00Z");
const W = windows(NOW);

const ad = (adId: string, name: string, status = "ACTIVE", campaignId = "abo"): MetaAd => ({ adId, name, campaignId, adsetId: `as-${adId}`, status, createdTime: null });
const D = (adId: string, dayStr: string, spend: number, purchases = 0, value = purchases * 23): MetaDay => ({
  adId, day: dayStr, spend, purchases, purchaseValue: value, impressions: 1000, linkClicks: 20, plays3s: 300, thruplays: 90, p25: 200, p50: 120, p75: 80, p100: 40,
});
const days = (from: string, n: number) => Array.from({ length: n }, (_, i) => new Date(Date.parse(`${from}T12:00:00Z`) + i * 864e5).toISOString().slice(0, 10));

test("Meta names: CBO twin, stray spaces, V#, real old names", () => {
  assert.deepEqual(parseName("CBO_UGC_MSB_Solution-Aware_Knee-Broad_BOULBEBA_V2"), { cbo: true, name: "UGC_MSB_Solution-Aware_Knee-Broad_BOULBEBA_V2", key: "ugc_msb_solution-aware_knee-broad_boulbeba_v2", base: "ugc_msb_solution-aware_knee-broad_boulbeba", v: 2 });
  assert.equal(parseName("AUTH_BRD_Product-Aware_Knee-Broad _Mervet_V4").key, "auth_brd_product-aware_knee-broad_mervet_v4");
  assert.equal(parseName("VSL_Variation_4.2").v, null);
  const gen = new Map([["ugc_fsb_problem-aware_knee-prayer_sami_v1", { taskId: "t1", v: 1 }]]);
  const old = new Map([["img_brd_product-aware_benefits_severity", "o1"]]);
  assert.deepEqual(ownerOf("UGC_FSB_Problem-Aware_Knee-Prayer_Sami_V1", gen, old), { kind: "task", taskId: "t1", v: 1 });
  assert.deepEqual(ownerOf("CBO_IMG_BRD_Product-Aware_Benefits_Severity_V1", gen, old), { kind: "old", oldId: "o1", v: 1 });
  assert.equal(ownerOf("UGC_CGH_Solution-Aware_Hips-Broad_Wissem_V2", gen, old).kind, "unmapped");
});

test("Meta windows: 7d / 3d end yesterday, weeks Monday–Sunday", () => {
  assert.deepEqual(W.d7, ["2026-10-09", "2026-10-15"]);
  assert.deepEqual(W.d3, ["2026-10-13", "2026-10-15"]);
  assert.deepEqual(W.weeks[0], ["2026-10-05", "2026-10-11"]);
  assert.deepEqual(W.weeks[1], ["2026-09-28", "2026-10-04"]);
});

test("Meta states: testing, kill line, won, deteriorating, fading, lost; concept takes the best", () => {
  // Testing: 2 sales, $15 spent (kill at $20 for 2 sales).
  const t = judgeVariation("c|1", 1, [{ ad: ad("a", "x"), side: "ABO", rows: [D("a", "2026-10-14", 15, 2)] }], SEP, W, false);
  assert.equal(t.state, "testing");
  assert.deepEqual(t.flags, []);
  // Kill line: 0 sales, $13 spent, still active → Lost + KILL flag.
  const k = judgeVariation("c|2", 2, [{ ad: ad("b", "x"), side: "ABO", rows: [D("b", "2026-10-14", 13, 0)] }], SEP, W, false);
  assert.equal(k.state, "lost");
  assert.deepEqual(k.flags, ["kill"]);
  // Near the kill line (80%+).
  const n = judgeVariation("c|3", 3, [{ ad: ad("c", "x"), side: "ABO", rows: [D("c", "2026-10-14", 11, 0)] }], SEP, W, false);
  assert.deepEqual(n.flags, ["near_kill"]);
  // Budget changed < 48h: no flags.
  assert.deepEqual(judgeVariation("c|2", 2, [{ ad: ad("b", "x"), side: "ABO", rows: [D("b", "2026-10-14", 13, 0)] }], SEP, W, true).flags, []);
  // Won: 7 days at $10 / 3 sales ($3.33 CPA, AOV $23 → business line $4.18).
  const won = judgeVariation("c|4", 4, [{ ad: ad("d", "x"), side: "ABO", rows: days("2026-10-05", 11).map((x) => D("d", x, 10, 3)) }], SEP, W, false);
  assert.equal(won.state, "won");
  assert.ok(Math.abs((won.cpa7 ?? 0) - 3.333) < 0.01);
  // Deteriorating: won in late September, last full week (Oct 5–11) over the line.
  const rows = [...days("2026-09-21", 14).map((x) => D("e", x, 10, 3)), ...days("2026-10-05", 7).map((x) => D("e", x, 10, 1)), ...days("2026-10-12", 4).map((x) => D("e", x, 10, 3))];
  assert.equal(judgeVariation("c|5", 5, [{ ad: ad("e", "x"), side: "ABO", rows }], SEP, W, false).state, "deteriorating");
  // Fading: two full weeks over.
  const rowsF = [...days("2026-09-14", 14).map((x) => D("f", x, 10, 3)), ...days("2026-09-28", 18).map((x) => D("f", x, 10, 1))];
  const fade = judgeVariation("c|6", 6, [{ ad: ad("f", "x"), side: "ABO", rows: rowsF }], SEP, W, false);
  assert.equal(fade.state, "fading");
  assert.ok(fade.flags.includes("fading"));
  assert.equal(conceptState([t, k, fade]), "fading");
  assert.equal(conceptState([t, k]), "testing");
});

test("Meta twins: ABO + CBO sides of one variation, twin split flag, concept CPA counts both", () => {
  const ads = [ad("1", "UGC_FSB_Problem-Aware_Knee-Prayer_Sami_V1"), ad("2", "CBO_UGC_FSB_Problem-Aware_Knee-Prayer_Sami_V1", "ACTIVE", "cbo")];
  const daily = [...days("2026-10-09", 7).map((x) => D("1", x, 10, 3)), ...days("2026-10-09", 7).map((x) => D("2", x, 10, 1))];
  const groups = groupAds(ads, daily, [{ campaignId: "abo", kind: "ABO", track: "knee" }, { campaignId: "cbo", kind: "CBO", track: "knee" }],
    new Map([["ugc_fsb_problem-aware_knee-prayer_sami_v1", { taskId: "t1", v: 1 }]]), new Map());
  assert.equal(groups.size, 1);
  const g = [...groups.values()][0];
  assert.deepEqual(g.sides.map((s) => s.side).sort(), ["ABO", "CBO"]);
  const r = judgeVariation("t:t1|1", 1, g.sides, SEP, W, false);
  assert.ok(r.flags.includes("twin"), "ABO under the line, CBO over");
  const c = conceptCpa7([r]);
  assert.equal(c.sales, 28);
  assert.equal(c.spend, 140);
});

test("Meta budgets: a change within 48h freezes the verdict", () => {
  const b = [{ entityId: "as", day: "2026-10-12", dailyBudget: 10 }, { entityId: "as", day: "2026-10-15", dailyBudget: 10 }, { entityId: "as", day: "2026-10-16", dailyBudget: 13 }];
  assert.equal(budgetChanged("as", b, NOW), true);
  assert.equal(budgetChanged("as", b.slice(0, 2), NOW), false);
});
