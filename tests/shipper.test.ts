import { test } from "node:test";
import assert from "node:assert/strict";
import { fixedCharges, shipperBalance } from "../src/lib/shipper/cash";
import { channelOf, isOurs, statusOf, toCash, toMonthStats, toOrderRow, toStock } from "../src/lib/shipper/map";

// Shapes copied from Shipper's real answers (Settings → Shipper check, Oct 17), personal data removed.
test("Shipper: orders map to channel, status, bottles and product", () => {
  assert.equal(channelOf("Aura herbs"), "dm");
  assert.equal(channelOf("Aura Herbs"), "website");
  assert.equal(statusOf(null, 0), "new");
  assert.equal(statusOf("Pending", 0), "new");
  assert.equal(statusOf("Pending", 1), "confirmed");
  assert.equal(statusOf("Fulfilled", 1), "confirmed");
  assert.equal(statusOf("In Transit", 1), "shipped");
  assert.equal(statusOf("Paid", 1), "delivered");
  assert.equal(statusOf("Delivered", 1), "delivered");
  assert.equal(statusOf("Returned", 1), "returned");
  assert.equal(statusOf("Canceled", 0), "cancelled");
  const r = toOrderRow({ id: 39312, status: "Delivered", store_name: "Aura Herbs", created_at: "2026-10-15T19:02:13.000000Z", items_count: 2, shipments_count: 1, products: [{ id: 17, name: "Aura Flex" }], revenue: "90" }, "2026-10-17T05:30:00Z");
  assert.deepEqual([r.order_id, r.channel, r.status, r.bottles, r.total_tnd, r.products, r.shipped_at, r.settled_at], ["39312", "website", "delivered", 2, 90, "Aura Flex", "2026-10-15T19:02:13.000000Z", "2026-10-17T05:30:00Z"]);
  const lead = toOrderRow({ id: 39412, status: null, store_name: "Aura Herbs", created_at: "2026-10-17T03:31:11Z", items_count: 1, shipments_count: 0, products: [], revenue: "0" }, "2026-10-17T05:30:00Z");
  assert.deepEqual([lead.status, lead.products, lead.settled_at], ["new", null, null]);
  // First pull: an old delivery is dated order date + 2 days, not "today" (else it counts as this month's gross).
  const old = toOrderRow({ id: 1, status: "Paid", store_name: "Aura Herbs", created_at: "2026-07-01T10:00:00Z", items_count: 1, shipments_count: 1, products: [{ id: 17, name: "Aura Flex" }], revenue: "59" }, "2026-10-17T05:30:00Z", true);
  assert.equal(old.settled_at, "2026-07-03T10:00:00.000Z");
  assert.ok(isOurs(null) && isOurs("Aura Flex") && isOurs("Ashwagandha+Aura Flex") && !isOurs("Ashwagandha"));
});

test("Shipper: month statistics, cash and stock", () => {
  const money = (x: string) => [{ amount: x, currency: { ISO_4217: "TND" } }];
  const product = {
    name: "Aura Flex", retailer_product_id: "17", delivered_orders: 1813, failed_orders: 610,
    shipments_delivered_paid: { count: 1813, revenue: money("140069.0"), expenses: money("-22114.88") },
    shipments_delivered_non_paid: { count: 0, revenue: [{ amount: null }], expenses: money("-0") },
    shipments_failed_delivery: { count: 610, revenue: money("0"), expenses: money("-2221.1") },
  };
  const web = { stats: { leads: { total: 3027, confirmed: 1979, closed_unconfirmed: 300, closed_unreachable: 239, closed_duplicate_wrong: 293 } }, has_stats: true };
  const dm = { stats: { leads: { total: 471, confirmed: 471 } }, has_stats: true };
  const s = toMonthStats(web, dm, product)!;
  assert.deepEqual([s.webLeads, s.dmLeads, s.delivered, s.failed, s.revenue], [3027, 471, 1813, 610, 140069]);
  assert.deepEqual(s.reasons, { refused: 300, unreachable: 239, duplicateWrong: 293 });
  assert.ok(Math.abs(s.fees - 24335.98) < 1e-6, "fees for delivered + failed orders");
  assert.ok(Math.abs(s.fees / s.delivered - 13.42) < 0.01, "about 13.4 TND per delivered order");
  assert.equal(toMonthStats({ status: 429 }, dm, product), null, "rate-limited answer = no stats");
  // Oct 19 05:42 read vs Shipper's top bar 32,779.84 (no withdrawal since Oct 17): balance exact to the dinar.
  const g = (n: number, rt: string, et: string, rev = "0", exp = "0") => ({ count: n, revenue: money(rev), expenses: money(exp), revenue_transferred: money(rt), expenses_transferred: money(et) });
  const c = toCash({ shipments_delivered_paid: g(18727, "1323328.266666666668", "-222102.16"), shipments_delivered_non_paid: g(50, "0", "-609.1", "4122", "-609.1"), shipments_failed_delivery: g(8033, "0", "-27018.89"), shipments_pending: g(284, "0", "-2571.48"), stats_by_order_type: {} })!;
  assert.equal(c.transferred, 1071026.637);
  assert.equal(c.deliveredUnpaid, 3512.9);
  assert.equal(c.deliveredCount, 50);
  assert.equal(Math.round(shipperBalance(c.transferred, 1038246.8, "2026-10-19") * 100) / 100, 32779.84);
  assert.equal(toCash({}), null);
  assert.equal(toCash({ shipments_pending: { count: 1 } }), null);
});

test("fixed Shipper charges after the baseline day", () => {
  assert.equal(fixedCharges("2026-10-19", "2026-10-31"), 0);
  assert.equal(fixedCharges("2026-10-19", "2026-11-01"), 19);
  assert.equal(fixedCharges("2026-10-19", "2026-11-08"), 20);
  assert.equal(fixedCharges("2026-10-19", "2027-01-10"), 60);
  assert.equal(fixedCharges("2026-10-19", "2026-10-19"), 0);
  assert.equal(toStock({ data: [{ name: "Aura Flex", available_qte: 218 }, { name: "Ashwagandha", available_qte: 38 }] }), 218);
});

test("Shipper: Shipper's statistics replace order counts for leads, reasons and fees", async () => {
  const { withStats } = await import("../src/lib/business-shared");
  const f = { webLeads: 3500, dmLeads: 400, shipped: 2400, delivered: 1800, returned: 600, open: 0, pending: 40, confirmedWaiting: 2, revenue: 140000, bottles: 2800, deliveryCost: 1800 * 13, webShipped: 2000,
    reasons: { duplicate: 0, disqualified: 0, unreachable: 0, wrong_number: 0 }, door: { b1: [0, 0] as [number, number], b2: [0, 0] as [number, number], b3: [0, 0] as [number, number] } };
  const g = withStats(f, { webLeads: 3027, dmLeads: 471, webPending: 13, reasons: { refused: 300, unreachable: 239, duplicateWrong: 293 }, delivered: 1813, failed: 610, revenue: 140069, fees: 24335.98 });
  assert.deepEqual([g.webLeads, g.dmLeads, g.reasons.disqualified, g.reasons.duplicate, g.pending], [3027, 471, 300, 293, 15]);
  assert.ok(Math.abs(g.deliveryCost / g.delivered - 24335.98 / 1813) < 1e-9, "Shipper's real fee per delivered order");
  assert.equal(withStats(f, undefined), f);
});

test("TND amounts as founders type them", async () => {
  const { parseTnd } = await import("../src/lib/parse");
  assert.equal(parseTnd("7060"), 7060);
  assert.equal(parseTnd("7 060"), 7060);
  assert.equal(parseTnd("7,060"), 7060);
  assert.equal(parseTnd("24,003"), 24003);
  assert.equal(parseTnd("1,234,567.5"), 1234567.5);
  assert.equal(parseTnd("7060,5"), 7060.5);
  assert.equal(parseTnd("7060.500"), 7060.5);
  assert.equal(parseTnd("7060 TND"), 7060);
  assert.equal(parseTnd(""), null);
  assert.ok(Number.isNaN(parseTnd("abc")));
});
