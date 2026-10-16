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
