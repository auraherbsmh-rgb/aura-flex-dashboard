import { test } from "node:test";
import assert from "node:assert/strict";
import { leakFinder, profitOf, lineZone, streaks, weekStarts, funnel, type Params } from "../src/lib/business-shared";

// August and September 2026 (File 1, handoff §10 backtest): leads / shipped / delivered per channel.
const AUG: Params = { M: 3102, cpa: 13752 / 3102, tau: 3102 / 3327, dm: 421 / 3102, c: (2356 + 421) / (3327 + 421), r: 2087 / (2356 + 421), v: 76.11 - 1.523 * 20.6, k: 13.11, F: 17813, X: 3.35 };
const SEP: Params = { M: 2900, cpa: 13004.86 / 2900, tau: 2900 / 3095, dm: 406 / 2900, c: 2475 / (3095 + 406), r: 1821 / 2475, v: 77.19 - 1.560 * 20.6, k: 23668 / 1821, F: 17813, X: 3.35 };

test("Business: the model gives the books' profit and the leak finder adds up exactly", () => {
  assert.ok(Math.abs(profitOf(SEP) - -3005) < 5, `September ${profitOf(SEP)}`);
  assert.ok(Math.abs(profitOf(AUG) - 2124) < 25, `August ${profitOf(AUG)}`);
  const { stages, total } = leakFinder(AUG, SEP);
  assert.ok(Math.abs(stages.reduce((n, s) => n + s.amount, 0) - total) < 1e-6);
  const by = Object.fromEntries(stages.map((s) => [s.key, Math.round(s.amount)]));
  // Handoff backtest: confirmation −2,698 · door −1,337 · volume −1,263 · ad cost −532 · order value +573. The split
  // between confirmation and door moves ~100 TND with the DM shipped count (not in File 1; estimated here) — sum unchanged.
  assert.ok(Math.abs(by.conf + by.door - (-2698 - 1337)) < 60, `conf + door ${by.conf + by.door}`);
  assert.ok(by.conf < -2500 && by.door < -1100, `conf ${by.conf} door ${by.door}`);
  assert.ok(Math.abs(by.volume - -1263) < 60, `volume ${by.volume}`);
  assert.ok(Math.abs(by.ads - -532) < 20, `ads ${by.ads}`);
  assert.ok(Math.abs(by.aov - 573) < 60, `aov ${by.aov}`);
  assert.equal(by.fixed, 0);
});

test("Business: line zone, streaks, weeks, funnel", () => {
  assert.equal(lineZone(4.48, 4.18), "red");
  assert.equal(lineZone(4.25, 4.18), "orange");
  assert.equal(lineZone(3.9, 4.18), "green");
  assert.deepEqual(streaks([5, -1, -3, -2, -1]), { loss: 4, gain: 0, up: 2, down: 0 });
  const w = weekStarts(Date.parse("2026-10-16T09:00:00Z"), 12);
  assert.equal(w.length, 12);
  assert.equal(w[11], "2026-10-05");
  const f = funnel([
    { orderId: "1", orderedAt: "2026-09-01T10:00:00Z", channel: "website", bottles: 2, totalTnd: 90, status: "delivered", reason: null, deliveryCostTnd: 13.4, shippedAt: null, settledAt: null },
    { orderId: "2", orderedAt: "2026-09-01T10:00:00Z", channel: "website", bottles: 1, totalTnd: 59, status: "returned", reason: null, deliveryCostTnd: null, shippedAt: null, settledAt: null },
    { orderId: "3", orderedAt: "2026-09-01T10:00:00Z", channel: "website", bottles: 1, totalTnd: 59, status: "cancelled", reason: "duplicate", deliveryCostTnd: null, shippedAt: null, settledAt: null },
    { orderId: "4", orderedAt: "2026-09-01T10:00:00Z", channel: "dm", bottles: 3, totalTnd: 129, status: "shipped", reason: null, deliveryCostTnd: null, shippedAt: null, settledAt: null },
  ], { exchangeRate: 3.35, bottleCostTnd: 20.6, deliveryCostTnd: 13, fixedCostsTnd: 17813, businessLineUsd: 4.18 });
  assert.deepEqual([f.webLeads, f.dmLeads, f.shipped, f.delivered, f.returned, f.open, f.revenue, f.reasons.duplicate], [3, 1, 3, 1, 1, 1, 90, 1]);
  assert.deepEqual(f.door.b1, [0, 1]);
});

test("Business: buildMoney — settled month = books, provisional month estimates open orders, leaks add up to the shown total", async () => {
  const { buildMoney } = await import("../src/lib/business-shared");
  const now = Date.parse("2026-10-16T09:00:00Z");
  const orders: import("../src/lib/business-shared").ShipperOrder[] = [];
  const add = (ym: string, n: number, deliveredShare: number, openShare = 0) => {
    for (let i = 0; i < n; i++) {
      const st = i < n * openShare ? "shipped" : i < n * (openShare + deliveredShare) ? "delivered" : i % 3 === 0 ? "cancelled" : "returned";
      orders.push({ orderId: `${ym}-${i}`, orderedAt: `${ym}-10T10:00:00Z`, channel: i % 10 === 0 ? "dm" : "website", bottles: 1 + (i % 2), totalTnd: i % 2 ? 90 : 59, status: st as "shipped", reason: st === "cancelled" ? "duplicate" : null, deliveryCostTnd: 13, shippedAt: `${ym}-11T10:00:00Z`, settledAt: st === "delivered" || st === "returned" ? `${ym}-15T10:00:00Z` : null });
    }
  };
  add("2026-08", 400, 0.7);
  add("2026-09", 400, 0.6, 0.05);
  const metaDays = [...Array.from({ length: 31 }, (_, i) => ({ day: `2026-08-${String(i + 1).padStart(2, "0")}`, purchases: 12, spendUsd: 50 })), ...Array.from({ length: 30 }, (_, i) => ({ day: `2026-09-${String(i + 1).padStart(2, "0")}`, purchases: 12, spendUsd: 55 }))];
  const bases = [{ month: "2026-08-01", status: "final", base: { exchangeRate: 3.35, bottleCostTnd: 20.6, deliveryCostTnd: 13, fixedCostsTnd: 5000, businessLineUsd: 4.18 } }];
  const v = buildMoney({ orders, metaDays, bases, now });
  const c = v.closed!;
  assert.equal(c.label, "September");
  assert.equal(c.provisional, true, "20 orders still in transit");
  assert.ok(c.delivered > 240, `open orders estimated at the door rate: ${c.delivered}`);
  const profitFromWaterfall = c.waterfall.slice(0, 5).reduce((n, r) => n + r.amount, 0);
  assert.ok(Math.abs(profitFromWaterfall - c.profit) < 1e-6, "waterfall ends at the profit");
  assert.equal(c.leaks!.reduce((n, l) => n + l.shown, 0), Math.round(c.leakTotal!), "shown rows add up to the shown total");
  assert.ok(Math.abs(c.leakTotal! - (c.profit - c.prevProfit!)) < 1e-6);
  assert.equal(v.trend.length, 12);
  assert.equal(v.week.closedLabel, "September");
  // No Meta rows pulled for September: no profit without ad spend; weeks without Meta are marked missing.
  const noMeta = buildMoney({ orders, metaDays: metaDays.filter((d) => d.day < "2026-09-01"), bases, now });
  assert.equal(noMeta.closed!.noMeta, true);
  assert.equal(noMeta.closed!.leaks, null);
  assert.ok(noMeta.trend.filter((p) => p.monday >= "2026-09-01").every((p) => p.missing), "September and later weeks have no Meta data");
  assert.ok(noMeta.trend.some((p) => !p.missing));
  assert.equal(noMeta.week.noMeta, true, "last week without Meta rows: the week tile waits for Meta");
});

test("Engine: buildEngine — chain counts, win rate, pace, bottleneck and cost", async () => {
  const { buildEngine } = await import("../src/lib/engine-shared");
  const now = Date.parse("2026-10-16T09:00:00Z");
  const iso = (d: number) => new Date(now - d * 864e5).toISOString();
  const mk = (id: string, created: number, sub: number, appr: number) => ({ id, copywriterId: id === "a" ? "cw1" : "cw2", createdAt: iso(created), rounds: [{ round: 1, submittedAt: iso(sub), decision: "approved", decidedAt: iso(appr) }] }) as unknown as import("../src/lib/tasks-shared").TaskRow;
  const tasks = [mk("a", 20, 17, 16), mk("b", 15, 12, 10), mk("c", 40, 37, 36)];
  const editRounds = new Map([["a", [{ decision: "approved", decidedAt: iso(8) }]], ["c", [{ decision: "approved", decidedAt: iso(25) }]]]) as unknown as Map<string, import("../src/lib/editing-shared").EditRound[]>;
  const launchedAt = new Map<string, string | null>([["a", iso(7)], ["c", iso(24)]]);
  const lib = ["a", "c"].map((id) => ({ taskId: id, format: "UGC", copywriter: "C1", editor: "E1", launchedAt: launchedAt.get(id), done: true, days: [3, 1, 1, 6, 2, 1] })) as unknown as import("../src/lib/library-shared").LibRow[];
  const r = (taskId: string, state: string, everWon: boolean, at: number) => ({ taskId, state, everWon, wonAt: everWon ? iso(at) : null, stateSince: iso(at), live: state !== "lost" }) as unknown as import("../src/lib/tasks-shared").ConceptResult;
  const results = { a: r("a", "won", true, 3), c: r("c", "lost", false, 20) };
  const log = [{ taskId: "a", state: "won", at: iso(3) }, { taskId: "c", state: "lost", at: iso(20) }];
  const e = buildEngine({ period: "4w", now, tasks, lib, results, editRounds, launchedAt, log, marginUsd: 4.18, rate: 3.35, hasMeta: true,
    cost: { copywriters: 3000, copywriterPerScript: {}, agency: 4000, strategist: 1500, editingPerVideo: 100, copywritersNote: "" }, winnersMoney: new Map([["a", { sales: 50, spendUsd: 150 }]]) });
  assert.deepEqual(e.chain.map((s) => s.n), [2, 2, 2, 2, 1], "created a,b · approved a,b · produced a,c · launched a,c · won a");
  assert.deepEqual(e.won, { won: 1, settled: 2, testing: 0 });
  assert.equal(e.alive, 1);
  assert.equal(e.chain.find((s) => s.bottleneck)!.key, "produced", "agency 6 d is the slowest step");
  assert.equal(e.pace.grow, 4, "(0 fading + 2) ÷ 50% win rate");
  assert.equal(e.pace.word, "STANDING STILL", "2.2 launches/month: enough to replace 0 fading, not to grow");
  assert.equal(e.cost.month, Math.round(8500 + 100 * (2 / (28 / 30.4))), "fixed engine pay + editing × videos per month");
  assert.equal(e.cost.winnersProfit, Math.round((50 * 4.18 - 150) * 3.35));
  assert.ok(e.chain.every((x) => x.conv === null || x.conv <= 1), "conversions are cohort-based, never above 100%");
  assert.equal(e.speed.median, 14, "headline = the All scripts row (sum of step medians)");
  assert.equal(e.speed.groups.all[0].total, 14);
  assert.equal(e.speed.slowest.all, "Agency step · 6 of 14 d");
  assert.equal(e.speed.slowest.format, "UGC · 14 d · agency 6 d");
  assert.deepEqual(e.speed.groups.month.map((g) => g.name), ["September", "October so far"]);
  // A winner paused in Meta leaves "alive" and counts as faded.
  const paused = buildEngine({ period: "4w", now, tasks, lib, results: { ...results, a: { ...results.a, live: false } }, editRounds, launchedAt,
    log: [{ taskId: "a", state: "won", at: iso(10) }, ...log, { taskId: "a", state: "won", live: false, at: iso(1) }], marginUsd: 4.18, rate: 3.35, hasMeta: true,
    cost: { copywriters: 3000, copywriterPerScript: {}, agency: 4000, strategist: 1500, editingPerVideo: 100, copywritersNote: "" }, winnersMoney: new Map() });
  assert.equal(paused.alive, 0);
  assert.equal(paused.aliveLine[10].n, 1, "alive a week ago");
  assert.equal(paused.cost.winnersProfit, 0, "Meta connected, no winner money = 0, not blank");
  assert.equal(paused.faded, 1, "paused this month = faded");
  const resumed = buildEngine({ period: "4w", now, tasks, lib, results, editRounds, launchedAt,
    log: [{ taskId: "a", state: "won", at: iso(10) }, ...log, { taskId: "a", state: "won", live: false, at: iso(2) }, { taskId: "a", state: "won", live: true, at: iso(1) }], marginUsd: 4.18, rate: 3.35, hasMeta: true,
    cost: { copywriters: 0, copywriterPerScript: { cw1: 50 }, agency: 0, strategist: 0, editingPerVideo: 0, copywritersNote: "" }, winnersMoney: new Map() });
  assert.equal(resumed.faded, 0, "paused then turned back on = not faded");
  assert.equal(resumed.cost.month, Math.round((50 * 1) / (28 / 30.4)), "per-script pay × that copywriter's approvals only");
});
