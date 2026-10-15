import { test } from "node:test";
import assert from "node:assert/strict";
import { lineForOrderValue, ownLineForBottles, ownLineExact, isAtKillLine, killSpendFor, type MoneyInputs } from "../src/lib/money";

// September 2026 close, FINAL (File 1, File 3 v3.4).
const SEP: MoneyInputs = {
  businessLineUsd: 4.18, aovBandLowUsd: 20, aovBandHighUsd: 26, exchangeRate: 3.35,
  killTableUsd: [13, 14, 20, 28, 38.5, 44, 50, 55, 60.5, 66],
  bottleCostTnd: 20.6, deliveryCostTnd: 13.0, fixedPerOrderTnd: 9.78, bridgeFactor: 0.6279,
  doorRate1b: 0.691, doorRate2b: 0.826, doorRate3b: 0.872, doorRateAvg: 0.749,
  price1bTnd: 59, price2bTnd: 90, price3bTnd: 129,
};

test("own lines per bottle count match File 3 §2: $2.70 · $5.38 · $9.69", () => {
  assert.equal(ownLineForBottles(1, SEP), 2.7);
  assert.equal(ownLineForBottles(2, SEP), 5.38);
  assert.equal(ownLineForBottles(3, SEP), 9.69);
});

test("File 3 example: order value $31.90 → own line ≈ $7.20 (exact formula $7.19)", () => {
  const exact = ownLineExact(31.9, SEP);
  assert.ok(Math.abs(exact - 7.2) < 0.015, `got ${exact}`);
  assert.equal(lineForOrderValue(31.9, SEP), 7.19);
});

test("order value inside the AOV band is judged on the business line $4.18", () => {
  assert.equal(lineForOrderValue(23.04, SEP), 4.18);
  assert.equal(lineForOrderValue(20, SEP), 4.18);
  assert.equal(lineForOrderValue(26, SEP), 4.18);
});

test("kill table (File 3 §1, Oct 13 owner rows)", () => {
  assert.equal(isAtKillLine(0, 13, SEP), true);
  assert.equal(isAtKillLine(0, 12.99, SEP), false);
  assert.equal(isAtKillLine(2, 19.9, SEP), false);
  assert.equal(isAtKillLine(2, 20, SEP), true);
  assert.equal(isAtKillLine(3, 28, SEP), true);
  assert.equal(killSpendFor(10, SEP), null);
});
