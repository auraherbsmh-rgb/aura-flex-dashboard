// Server only: everything Business · Money reads (founders; RLS keeps the Shipper and Meta copies founder-only).
import { createClient } from "@/lib/supabase/server";
import { allRows } from "@/lib/tasks";
import { getRule } from "@/lib/needs";
import { shipperStatus } from "@/lib/shipper/pull";
import { buildMoney, stockDays, tunisDay, type MetaDayTotal, type MonthBase, type ShipperOrder } from "@/lib/business-shared";
import { isOurs, toMonthStats, type MonthStats } from "@/lib/shipper/map";

export async function getMoneyData(now: number) {
  const supabase = await createClient();
  const since = new Date(now - 110 * 864e5).toISOString();
  const sinceDay = tunisDay(now - 110 * 864e5);
  type O = { order_id: string; ordered_at: string; channel: "website" | "dm"; bottles: number; total_tnd: number; status: ShipperOrder["status"]; reason: ShipperOrder["reason"]; delivery_cost_tnd: number | null; shipped_at: string | null; settled_at: string | null; products: string | null };
  type D = { ad_id: string; day: string; spend: number; purchases: number };
  const [orderRows, dayRows, adRows, scope, moneyRows, stock, cash, sync, stockRed, monthRows] = await Promise.all([
    allRows<O>("Shipper orders", (a, b) => supabase.from("shipper_orders").select("order_id, ordered_at, channel, bottles, total_tnd, status, reason, delivery_cost_tnd, shipped_at, settled_at, products").gte("ordered_at", since).order("order_id").range(a, b) as unknown as PromiseLike<{ data: O[] | null; error: unknown }>),
    allRows<D>("Meta results", (a, b) => supabase.from("meta_daily").select("ad_id, day, spend, purchases").gte("day", sinceDay).order("ad_id").order("day").range(a, b) as unknown as PromiseLike<{ data: D[] | null; error: unknown }>),
    allRows<{ ad_id: string; campaign_id: string }>("Meta ads", (a, b) => supabase.from("meta_ads").select("ad_id, campaign_id").order("ad_id").range(a, b) as unknown as PromiseLike<{ data: { ad_id: string; campaign_id: string }[] | null; error: unknown }>),
    supabase.from("campaign_scope").select("campaign_id").eq("active", true),
    supabase.from("money_settings").select("month, status, exchange_rate, bottle_cost_tnd, delivery_cost_tnd, fixed_costs_tnd, business_line_usd").order("month"),
    supabase.from("shipper_stock").select("day, bottles").order("day", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("shipper_cash").select("day, collected_unpaid_tnd, in_transit_tnd").order("day", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("shipper_sync").select("started_at, ok, message").order("id", { ascending: false }).limit(1).maybeSingle(),
    getRule("stock_red_days", 0),
    supabase.from("shipper_month").select("month, web, dm, product"),
  ]);
  // Shipper's own monthly statistics for Aura Flex (leads per channel, reasons, real fees).
  const stats: Record<string, MonthStats> = {};
  for (const r of monthRows.data ?? []) { const s = toMonthStats(r.web, r.dm, r.product); if (s) stats[String(r.month).slice(0, 7)] = s; }
  // Money numbers per month (Settings → Money, monthly ritual): each month is judged with its own row.
  const bases: MonthBase[] = (moneyRows.data ?? []).map((r) => ({
    month: String(r.month), status: String(r.status),
    base: { exchangeRate: Number(r.exchange_rate), bottleCostTnd: Number(r.bottle_cost_tnd), deliveryCostTnd: Number(r.delivery_cost_tnd), fixedCostsTnd: Number(r.fixed_costs_tnd), businessLineUsd: Number(r.business_line_usd) },
  }));
  if (!bases.length) return { status: shipperStatus(), noMoney: true as const };
  const inScope = new Set((scope.data ?? []).map((s) => s.campaign_id as string));
  const adIn = new Set(adRows.filter((a) => inScope.has(a.campaign_id)).map((a) => a.ad_id));
  const byDay = new Map<string, MetaDayTotal>();
  for (const r of dayRows) {
    if (!adIn.has(r.ad_id)) continue;
    const d = byDay.get(r.day) ?? { day: r.day, purchases: 0, spendUsd: 0 };
    d.purchases += r.purchases; d.spendUsd += Number(r.spend);
    byDay.set(r.day, d);
  }
  // Business = Aura Flex: orders with Aura Flex, and leads whose product isn't known yet (not confirmed).
  const orders: ShipperOrder[] = orderRows.filter((o) => isOurs(o.products)).map((o) => ({
    orderId: o.order_id, orderedAt: o.ordered_at, channel: o.channel, bottles: o.bottles, totalTnd: Number(o.total_tnd), status: o.status, reason: o.reason,
    deliveryCostTnd: o.delivery_cost_tnd === null ? null : Number(o.delivery_cost_tnd), shippedAt: o.shipped_at, settledAt: o.settled_at,
  }));
  const base = bases[bases.length - 1].base;
  const view = buildMoney({ orders, metaDays: [...byDay.values()], bases, now, stats });
  const stockBottles = stock.data ? Number(stock.data.bottles) : null;
  return {
    status: shipperStatus(), noMoney: false as const, view, base, hasMeta: byDay.size > 0,
    stock: { bottles: stockBottles, ...stockDays(stockBottles, orders, now), redBelow: stockRed || null },
    cash: cash.data ? { collected: Number(cash.data.collected_unpaid_tnd), transit: Number(cash.data.in_transit_tnd) } : null,
    lastSync: (sync.data as { started_at: string; ok: boolean | null; message: string | null } | null) ?? null,
  };
}
