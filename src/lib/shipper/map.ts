/**
 * Shipper API → our tables (pure, tested in tests/shipper.test.ts). Read from Shipper's real answers (Settings →
 * Shipper check, Oct 17): orders list fields, the statuses Shipper sends, and its monthly statistics per product.
 *
 * Channel: Shipper names orders created inside Shipper (internal confirmation = DM / comment orders entered by the
 * team) "Aura herbs"; website orders, confirmed by Shipper's call centre, come in as "Aura Herbs".
 */
export const PRODUCT = "Aura Flex";

export type ApiOrder = {
  id: number | string; status: string | null; store_name: string | null; created_at: string; items_count: number | null;
  shipments_count: number | null; products: { id: number | string; name: string }[] | null; revenue: string | null;
};

export type OrderRow = {
  order_id: string; ordered_at: string; channel: "website" | "dm"; bottles: number; total_tnd: number;
  status: "new" | "confirmed" | "shipped" | "delivered" | "returned" | "cancelled"; reason: null;
  delivery_cost_tnd: null; shipped_at: string | null; settled_at: string | null;
  products: string | null; raw_status: string | null; shipments: number; updated_at: string;
};

export const channelOf = (store: string | null): "website" | "dm" => (store === "Aura herbs" ? "dm" : "website");

export const KNOWN_STATUSES = new Set([null, "Pending", "Fulfilled", "In Transit", "Delivered", "Paid", "Partial Delivery", "Returned", "Partial Return", "Canceled"]);

/** Shipper's order status (computed from its shipments) → our funnel status. */
export function statusOf(raw: string | null, shipments: number): OrderRow["status"] {
  switch (raw) {
    case "Delivered": case "Paid": case "Partial Delivery": return "delivered";
    case "Returned": case "Partial Return": return "returned";
    case "In Transit": return "shipped";
    case "Fulfilled": return "confirmed";
    case "Canceled": return "cancelled";
    case "Pending": return shipments > 0 ? "confirmed" : "new";
    default: return "new"; // null = a fresh lead; other unknown values are reported by the pull (KNOWN_STATUSES)
  }
}

/**
 * settledSeen: when the pull first saw it settled (now on a daily pull). On the first pull (backfill) orders settled long
 * ago get their order date + 2 days instead (Shipper delivers in 1.6 business days on average), so old deliveries
 * don't count as this month's gross sales.
 */
export function toOrderRow(o: ApiOrder, nowIso: string, backfill = false): OrderRow {
  const shipments = Number(o.shipments_count ?? 0);
  const status = statusOf(o.status, shipments);
  const names = (o.products ?? []).map((p) => p.name).sort();
  return {
    order_id: String(o.id), ordered_at: o.created_at, channel: channelOf(o.store_name), bottles: Math.max(0, Number(o.items_count ?? 1)),
    total_tnd: Number(o.revenue ?? 0) || 0, status, reason: null, delivery_cost_tnd: null,
    // Shipper's list has no shipping date: shipped orders count from their order date (usually shipped within a day).
    shipped_at: status === "shipped" || status === "delivered" || status === "returned" ? o.created_at : null,
    // Settled (delivered or returned): Shipper gives no date in the list; the pull keeps the first time it saw it settled.
    settled_at: status === "delivered" || status === "returned" ? (backfill ? new Date(Math.min(Date.parse(o.created_at) + 2 * 864e5, Date.parse(nowIso))).toISOString() : nowIso) : null,
    products: names.length ? names.join("+") : null, raw_status: o.status, shipments, updated_at: nowIso,
  };
}

/** Aura Flex orders, plus orders whose product isn't known yet (a lead not confirmed has no products). */
export const isOurs = (products: string | null) => products === null || products.split("+").includes(PRODUCT);

const num = (x: unknown) => (x === null || x === undefined || x === "" ? 0 : Number(x) || 0);
const amount = (a: unknown) => num((a as { amount?: string | null }[] | undefined)?.[0]?.amount);

export type MonthStats = {
  webLeads: number; dmLeads: number;
  /** Website leads Shipper hasn't called yet or is still calling (no confirmation verdict). */
  webPending: number;
  reasons: { refused: number; unreachable: number; duplicateWrong: number };
  delivered: number; failed: number; revenue: number;
  /** Everything Shipper charged for delivered and failed orders (shipping, confirmation, packaging, follow-up…). */
  fees: number;
};

type Leads = { total?: number; closed_unconfirmed?: number; closed_unreachable?: number; closed_duplicate_wrong?: number; under_process?: number; no_attempt?: number };
type PerfGroup = { count?: number; revenue?: unknown; expenses?: unknown };
type PerfRow = { name: string; retailer_product_id: string | number; delivered_orders?: number; failed_orders?: number; shipments_delivered_paid?: PerfGroup; shipments_delivered_non_paid?: PerfGroup; shipments_failed_delivery?: PerfGroup };

/** The Aura Flex row of /dashboard/product-performance. */
export function productRow(perf: unknown): PerfRow | null {
  return ((perf as { products?: PerfRow[] })?.products ?? []).find((p) => p.name === PRODUCT) ?? null;
}

/** One month from Shipper's statistics: confirmation (website), internal confirmation (DM), product performance. */
export function toMonthStats(web: unknown, dm: unknown, product: unknown): MonthStats | null {
  const w = (web as { stats?: { leads?: Leads } })?.stats?.leads;
  const d = (dm as { stats?: { leads?: Leads } })?.stats?.leads;
  const p = product as PerfRow | null;
  if (!w || !p) return null;
  const g = (k: "shipments_delivered_paid" | "shipments_delivered_non_paid" | "shipments_failed_delivery") => p[k] ?? {};
  return {
    webLeads: num(w.total), dmLeads: num(d?.total), webPending: num(w.under_process) + num(w.no_attempt),
    reasons: { refused: num(w.closed_unconfirmed), unreachable: num(w.closed_unreachable), duplicateWrong: num(w.closed_duplicate_wrong) },
    delivered: num(p.delivered_orders), failed: num(p.failed_orders),
    revenue: amount(g("shipments_delivered_paid").revenue) + amount(g("shipments_delivered_non_paid").revenue),
    fees: -(amount(g("shipments_delivered_paid").expenses) + amount(g("shipments_delivered_non_paid").expenses) + amount(g("shipments_failed_delivery").expenses)),
  };
}

/** Cash at Shipper from /dashboard/overview: delivered but not paid out yet, and what is still on its way. */
export type Cash = { balance: number; deliveredUnpaid: number; pending: number; pendingFeesTaken: number; pendingFeesComing: number; failedFees: number; other: number; otherGroups: string[] };
/**
 * Shipper balance (founder, Oct 17), rebuilt from /dashboard/overview because the API has no balance endpoint:
 * Shipper takes the first fees when an order comes in, the rest at delivery. Balance = delivered not paid (after fees)
 * + pending sales − fees already taken on pending − fees still to come on pending − failed-delivery fees.
 * Checked against Shipper's top bar on Oct 17: 10,093.68 + 17,130 − 2,709.48 − 575.12 − 1,943.08 = 21,996.
 * Any other unpaid group Shipper adds later (returns…) is counted the same way and named in "otherGroups".
 */
export function toCash(overview: unknown): Cash | null {
  type G = { count?: unknown; revenue?: unknown; revenue_expected?: unknown; expenses?: unknown; expenses_expected?: unknown };
  const o = overview as Record<string, G> | null;
  if (!o || typeof o !== "object" || (!o.shipments_delivered_non_paid && !o.shipments_pending)) return null;
  const dn = o.shipments_delivered_non_paid ?? {}, pe = o.shipments_pending ?? {}, fa = o.shipments_failed_delivery ?? {};
  const deliveredUnpaid = amount(dn.revenue) + amount(dn.expenses) + amount(dn.expenses_expected);
  const pending = amount(pe.revenue_expected);
  const pendingFeesTaken = amount(pe.expenses);
  const pendingFeesComing = amount(pe.expenses_expected);
  const failedFees = amount(fa.revenue) + amount(fa.expenses) + amount(fa.expenses_expected);
  const known = new Set(["shipments_delivered_paid", "shipments_delivered_non_paid", "shipments_pending", "shipments_failed_delivery"]);
  let other = 0;
  const otherGroups: string[] = [];
  for (const [k, g] of Object.entries(o)) {
    if (known.has(k) || !k.startsWith("shipments_") || !g || typeof g !== "object" || !("count" in g)) continue;
    otherGroups.push(k);
    other += amount(g.revenue) + amount(g.expenses) + amount(g.expenses_expected);
  }
  const r = (x: number) => Math.round(x * 1000) / 1000;
  return { balance: r(deliveredUnpaid + pending + pendingFeesTaken + pendingFeesComing + failedFees + other), deliveredUnpaid: r(deliveredUnpaid), pending: r(pending), pendingFeesTaken: r(pendingFeesTaken), pendingFeesComing: r(pendingFeesComing), failedFees: r(failedFees), other: r(other), otherGroups };
}

/** Aura Flex bottles at Shipper from /products. */
export function toStock(products: unknown): number | null {
  const p = ((products as { data?: { name: string; available_qte?: number | string | null }[] })?.data ?? []).find((x) => x.name === PRODUCT);
  return p && p.available_qte !== null && p.available_qte !== undefined ? Number(p.available_qte) : null;
}
