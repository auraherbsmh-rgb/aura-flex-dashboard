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
  adId, day: dayStr, spend, purchases, purchaseValue: value, impressions: 1000, reach: 700, linkClicks: 20, plays3s: 300, thruplays: 90, p25: 200, p50: 120, p75: 80, p100: 40,
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

test("Live ads: a concept is judged on its live variations; a budget change freezes its verdict", async () => {
  const { buildLive } = await import("../src/lib/live-shared");
  const base = "UGC_FSB_Problem-Aware_Knee-Prayer_Sami";
  const ads = [ad("1", `${base}_V1`, "PAUSED"), ad("2", `${base}_V2`)];
  const daily = [...days("2026-09-21", 21).map((x) => D("1", x, 10, 3)), ...days("2026-10-13", 3).map((x) => D("2", x, 3, 0))];
  const generated = new Map([[`${base}_v1`.toLowerCase(), { taskId: "t1", v: 1 }], [`${base}_v2`.toLowerCase(), { taskId: "t1", v: 2 }]]);
  const info = { key: "t:t1", name: "Sami", cell: "FSB × Problem", angle: "Knee-Prayer", format: "UGC", formatCode: "UGC", track: "knee", copywriter: null, editor: null, launchedAt: null, taskId: "t1", hooks: {} };
  const scope = [{ campaignId: "abo", kind: "ABO" as const, track: "knee" }];
  const run = (budgets: { entityId: string; day: string; dailyBudget: number }[]) =>
    buildLive({ ads, daily, scope, budgets, generated, old: new Map(), concepts: new Map([["t:t1", info]]), money: SEP, now: NOW }).live[0];
  const c = run([]);
  assert.equal(c.state, "testing", "paused V1 won once, live V2 is testing");
  assert.equal(c.group, "testing");
  const f = run([{ entityId: "as-2", day: "2026-10-13", dailyBudget: 10 }, { entityId: "as-2", day: "2026-10-16", dailyBudget: 13 }]);
  assert.equal(f.frozen, true);
  assert.equal(f.group, "testing");
});

test("KILL items: kill line ad → Founder 2 first, answers hide until the next pull, a paused ad still active comes back", async () => {
  const { buildLive, killNeeds, unmappedNeeds } = await import("../src/lib/live-shared");
  const { buildNeeds } = await import("../src/lib/needs");
  const base = "UGC_FSB_Problem-Aware_Knee-Prayer_Sami";
  const ads = [ad("1", `${base}_V1`), ad("9", "VSL_BRD_Most-Aware_Old_V4")];
  const daily = [...days("2026-10-12", 4).map((x) => D("1", x, 4, 0)), D("9", "2026-10-14", 5, 1)];
  const generated = new Map([[`${base}_v1`.toLowerCase(), { taskId: "t1", v: 1 }]]);
  const info = { key: "t:t1", name: "Sami", cell: "FSB × Problem", angle: "Knee-Prayer", format: "UGC", formatCode: "UGC", track: "knee", copywriter: null, editor: null, launchedAt: null, taskId: "t1", hooks: {} };
  const model = buildLive({ ads, daily, scope: [{ campaignId: "abo", kind: "ABO", track: "knee" }], budgets: [], generated, old: new Map(), concepts: new Map([["t:t1", info]]), money: SEP, now: NOW });
  const pull = "2026-10-16T05:00:00Z";
  const k = (answers: { adId: string; answer: "paused" | "not_now"; reason: string | null; answeredAt: string }[]) =>
    killNeeds({ live: model.live, daily, adNames: new Map(ads.map((a) => [a.adId, a.name])), answers, lastPullAt: pull, money: SEP, now: NOW });
  const items = k([]);
  assert.equal(items.length, 1);
  assert.equal(items[0].flag, "kill");
  assert.equal(items[0].name, `${base}_V1`);
  // Cumulative $16 at 0 sales passes the $13 kill line on Oct 15 → counted from the Oct 16 pull.
  assert.equal(new Date(items[0].sinceMs).toISOString(), "2026-10-16T05:00:00.000Z");
  assert.equal(k([{ adId: "1", answer: "paused", reason: null, answeredAt: "2026-10-16T08:00:00Z" }]).length, 0, "answered after the pull: wait");
  const back = k([{ adId: "1", answer: "paused", reason: null, answeredAt: "2026-10-15T08:00:00Z" }]);
  assert.match(back[0].recheck ?? "", /still active/);
  // An old "paused" answer (before the previous pull) is history: the item is new, no "still active".
  const old = killNeeds({ live: model.live, daily, adNames: new Map(), answers: [{ adId: "1", answer: "paused", reason: null, answeredAt: "2026-09-20T08:00:00Z" }], lastPullAt: pull, prevPullAt: "2026-10-15T05:00:00Z", money: SEP, now: NOW });
  assert.equal(old[0].recheck, null);
  const v = (role: "founder_1" | "founder_2") => ({ personId: "p", name: "F", role, email: "" });
  const um = unmappedNeeds(model.unmapped, new Map([["9", "2026-10-10T05:00:00Z"]]), NOW);
  assert.equal(um.length, 1);
  const g2 = buildNeeds(v("founder_2"), [], 48, NOW, [], 48, { cards: new Map(), productions: new Map(), footageLateDays: 2, assignLateDays: 2, kills: items, unmapped: um });
  assert.equal(g2[0].name, "KILL · ACT IN META FIRST");
  assert.ok(g2.flatMap((g) => g.items).some((i) => i.type === "UNMAPPED"));
  const g1 = buildNeeds(v("founder_1"), [], 48, NOW, [], 48, { cards: new Map(), productions: new Map(), footageLateDays: 2, assignLateDays: 2, kills: items, unmapped: um });
  assert.ok(!g1.flatMap((g) => g.items).some((i) => i.kill), "Founder 1 covers only after 48h");
  assert.ok(g1.flatMap((g) => g.items).some((i) => i.type === "UNMAPPED"));
});

test("Meta 5: concept results, map cells with results, RESULT inbox, winners and successors", async () => {
  const { buildLive, conceptResultRows } = await import("../src/lib/live-shared");
  const { buildMap } = await import("../src/lib/map-shared");
  const { inboxLine } = await import("../src/lib/tasks-shared");
  const { successorNeeds, winRate, winnersToNote } = await import("../src/lib/home-shared");
  // A won concept (V1 won, V2 testing): its CPA is the won variation's.
  const base = "UGC_FSB_Problem-Aware_Knee-Prayer_Sami";
  const ads = [ad("1", `${base}_V1`), ad("2", `${base}_V2`)];
  const daily = [...days("2026-10-05", 11).map((x) => D("1", x, 10, 3)), ...days("2026-10-13", 3).map((x) => D("2", x, 3, 0))];
  const generated = new Map([[`${base}_v1`.toLowerCase(), { taskId: "t1", v: 1 }], [`${base}_v2`.toLowerCase(), { taskId: "t1", v: 2 }]]);
  const model = buildLive({ ads, daily, scope: [{ campaignId: "abo", kind: "ABO", track: "knee" }], budgets: [], generated, old: new Map(), concepts: new Map(), money: SEP, now: NOW });
  const rows = conceptResultRows(model.states);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].state, "won");
  assert.equal(rows[0].best_v, 1);
  assert.ok(Math.abs((rows[0].cpa7 ?? 0) - 3.333) < 0.01);
  assert.equal(rows[0].ever_won, true);
  assert.equal(rows[0].variations.length, 2);

  // Map: a won concept + one in production → green box "WON", the dots show both; test + writing stay neutral.
  const C = (id: string, extra: Record<string, unknown>) => ({
    taskId: id, avatarId: "a", avatarCode: "FSB", awareness: "Problem-Aware", angleId: "g", angle: "Knee-Prayer", angleCode: "Knee-Prayer", track: "knee",
    format: "UGC", formatCode: "UGC", origin: "manual", status: "details_done", copywriter: "C1", createdAt: "2026-10-01T10:00:00Z", face: "Sami",
    generate: false, vo: false, launchedAt: null, liveAt: null, holdAt: null, variations: [], ...extra,
  });
  const cell = (cs: ReturnType<typeof C>[]) => buildMap(cs as never, [{ id: "a", code: "FSB", label: "FSB" }])[0].cells[0];
  const won = cell([C("1", { resultState: "won", launchedAt: "2026-10-05T10:00:00Z" }), C("2", {}), C("3", { resultState: "won", launchedAt: "2026-10-05T10:00:00Z" })]);
  assert.equal(won.state, "won");
  assert.equal(won.mixed, false);
  assert.equal(won.word, "WON ×2");
  assert.equal(won.counts.production, 1);
  const neutral = cell([C("1", { launchedAt: "2026-10-05T10:00:00Z" }), C("2", { status: "writing" })]);
  assert.equal(neutral.mixed, true);
  assert.equal(neutral.word, "2 CONCEPTS");
  assert.equal(cell([C("1", { resultState: "testing", launchedAt: "x" })]).word, "TEST");

  // Inbox: a new verdict is a RESULT item on top for the copywriter until seen; founders see the state only.
  const t = { id: "t1", status: "details_done", dueOn: "2026-10-10", createdAt: "2026-10-01T10:00:00Z", copywriter: "C1", copywriterId: "c1", avatarCode: "FSB", awareness: "Problem-Aware", angleId: "g", angle: "Knee-Prayer", angleCode: "Knee-Prayer", format: "UGC", formatCode: "UGC", keep: null, note: null, reference: null, scriptUrl: null, origin: "manual", changeFacts: null, rounds: [] };
  const res = { taskId: "t1", state: "won" as const, stateSince: "2026-10-15T05:00:00Z", everWon: true, cpa7: 3.33, line: 4.18, sales7: 21, spend7: 70, bestV: 1, live: true, variations: [], seenState: null, winnerNotedAt: null };
  assert.equal(inboxLine(t, false, NOW, res).tag, "RESULT · WON");
  assert.equal(inboxLine(t, false, NOW, res).rank, 0);
  assert.equal(inboxLine(t, false, NOW, { ...res, seenState: "won" }).tag, "WON");
  assert.equal(inboxLine(t, true, NOW, res).tag, "WON");
  assert.equal(inboxLine(t, false, NOW, { ...res, state: "testing" }).tag, "LIVE · TESTING");

  // Home: win rate, WINNER to note, fading winner with / without a successor.
  const lost = { ...t, id: "t2" };
  const results = { t1: res, t2: { ...res, taskId: "t2", state: "lost" as const, everWon: false } };
  assert.deepEqual(winRate([t, lost], results, NOW), { won: 1, settled: 2, pct: 50 });
  assert.equal(winnersToNote([t], results, new Map([["t1", "Sami"]]), new Map([["t1", [{ v: 1, type: "Storytelling", line: "I could not pray" }]]]))[0].hook?.line, "I could not pray");
  const fading = { t1: { ...res, state: "fading" as const } };
  assert.equal(successorNeeds([t], fading, new Map()).length, 1);
  const succ = { ...t, id: "t3", status: "writing", createdAt: "2026-10-14T10:00:00Z" };
  assert.equal(successorNeeds([t, succ], fading, new Map()).length, 0, "a newer task in the same cell and angle is the successor");
});
