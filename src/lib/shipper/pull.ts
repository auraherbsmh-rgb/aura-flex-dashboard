// Server only. The daily Shipper pull (read-only on Shipper): fills shipper_orders, shipper_month, shipper_stock and
// shipper_cash (service role). Mapping in ./map.ts, read from Shipper's real answers (Settings → Shipper check, Oct 17).
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { shipperGet, shipperGetPaced } from "./api";
import { productRow, toCash, toOrderRow, toStock, type ApiOrder, type OrderRow } from "./map";

export type ShipperStatus = { key: boolean; serviceKey: boolean; mapped: boolean; ready: boolean };

const MAPPED = true;
/** First pull reads ~4 months back (Money compares last month with the one before); later pulls refresh 45 days. */
const BACKFILL_DAYS = 125, REFRESH_DAYS = 45;

export function shipperStatus(): ShipperStatus {
  const key = !!process.env.SHIPPER_API_KEY, serviceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { key, serviceKey, mapped: MAPPED, ready: key && serviceKey && MAPPED };
}

const ymd = (ms: number) => new Date(ms + 36e5).toISOString().slice(0, 10); // Tunisia calendar day
const monthStart = (y: number, m: number) => new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
const monthEnd = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);

export async function runShipperPull(): Promise<{ ok: boolean; message: string }> {
  const st = shipperStatus();
  if (!st.ready) return { ok: false, message: "Missing in Vercel: " + [!st.key && "SHIPPER_API_KEY", !st.serviceKey && "SUPABASE_SERVICE_ROLE_KEY"].filter(Boolean).join(", ") };
  const key = process.env.SHIPPER_API_KEY!;
  const db = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: run } = await db.from("shipper_sync").insert({}).select("id").single();
  const finish = async (ok: boolean, message: string, orders = 0) => {
    if (run) await db.from("shipper_sync").update({ finished_at: new Date().toISOString(), ok, message: message.replace(key, "…"), orders }).eq("id", run.id);
    return { ok, message };
  };
  try {
    const now = Date.now(), nowIso = new Date(now).toISOString();
    // 1. Orders (every channel and product; Business keeps Aura Flex): one page of 100 per call, newest first.
    const { count } = await db.from("shipper_orders").select("order_id", { count: "exact", head: true });
    const since = ymd(now - (count ? REFRESH_DAYS : BACKFILL_DAYS) * 864e5), until = ymd(now);
    const rows: OrderRow[] = [];
    for (let page = 1; page <= 80; page++) {
      const c = await shipperGetPaced(`/orders?per_page=100&page=${page}&start_date=${since}&end_date=${until}`);
      if (c.error) throw new Error(`Orders page ${page}: ${c.error}`);
      const body = c.body as { data?: ApiOrder[]; pagination?: { last_page?: number } };
      rows.push(...(body.data ?? []).map((o) => toOrderRow(o, nowIso)));
      if (!body.data?.length || page >= (body.pagination?.last_page ?? page)) break;
    }
    // Keep the first time an order was seen settled (Shipper's list carries no delivery date).
    const ids = rows.map((r) => r.order_id);
    const seen = new Map<string, string | null>();
    for (let i = 0; i < ids.length; i += 500) {
      const { data, error } = await db.from("shipper_orders").select("order_id, settled_at").in("order_id", ids.slice(i, i + 500));
      if (error) throw new Error(`Reading saved orders: ${error.message}`);
      for (const r of data ?? []) seen.set(r.order_id as string, (r.settled_at as string | null) ?? null);
    }
    for (const r of rows) { const s = seen.get(r.order_id); if (s && r.settled_at) r.settled_at = s; }
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await db.from("shipper_orders").upsert(rows.slice(i, i + 500), { onConflict: "order_id" });
      if (error) throw new Error(`Saving orders: ${error.message}`);
    }

    // 2. Shipper's statistics for Aura Flex, this month and the two before (3 calls each; dashboard limit 12 / minute).
    const d = new Date(now + 36e5);
    let months = 0;
    for (let k = 0; k < 3; k++) {
      const y = d.getUTCFullYear(), m = d.getUTCMonth() - k;
      const range = `start_date=${monthStart(y, m)}&end_date=${monthEnd(y, m)}`;
      const perf = await shipperGetPaced(`/dashboard/product-performance?${range}&per_page=50`);
      const prod = productRow(perf.body);
      if (perf.error || !prod) continue;
      const pid = encodeURIComponent(String(prod.retailer_product_id));
      const [web, dm] = [await shipperGetPaced(`/dashboard/confirmation-stats?${range}&retailer_product_id=${pid}`), await shipperGetPaced(`/dashboard/internal-confirmation-stats?${range}&retailer_product_id=${pid}`)];
      if (web.error || dm.error) continue;
      const { error } = await db.from("shipper_month").upsert({ month: monthStart(y, m), web: web.body, dm: dm.body, product: prod, fetched_at: nowIso }, { onConflict: "month" });
      if (error) throw new Error(`Saving month stats: ${error.message}`);
      months++;
    }

    // 3. Stock (Aura Flex bottles at Shipper) and cash (delivered not paid yet, still on its way), today.
    const today = ymd(now);
    const products = await shipperGet("/products?per_page=50");
    const bottles = toStock(products.body);
    if (bottles !== null) await db.from("shipper_stock").upsert({ day: today, bottles }, { onConflict: "day" });
    const overview = await shipperGetPaced(`/dashboard/overview?start_date=${ymd(now - 90 * 864e5)}&end_date=${today}`);
    const cash = toCash(overview.body);
    if (cash) await db.from("shipper_cash").upsert({ day: today, collected_unpaid_tnd: cash.collected, in_transit_tnd: cash.transit }, { onConflict: "day" });

    return finish(true, `Pulled ${rows.length} orders (${since} → ${until}), ${months} month${months === 1 ? "" : "s"} of statistics, stock ${bottles ?? "—"}, cash ${cash ? "ok" : "—"}.`, rows.length);
  } catch (e) {
    return finish(false, e instanceof Error ? e.message : "The Shipper pull failed.");
  }
}
