// Server only. The daily Shipper pull (read-only on Shipper): fills shipper_orders, shipper_month, shipper_stock and
// shipper_cash (service role). Mapping in ./map.ts, read from Shipper's real answers (Settings → Shipper check, Oct 17).
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { shipperGetPaced } from "./api";
import { KNOWN_STATUSES, productRow, toCash, toOrderRow, toStock, type ApiOrder, type OrderRow } from "./map";

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

/** A run with no end after 10 minutes was stopped by the platform (time limit): it counts as failed. */
export const STALE_MS = 10 * 60_000;
export type SyncRow = { started_at: string; finished_at?: string | null; ok: boolean | null; message: string | null };
export function staleAsFailed<T extends SyncRow>(r: T | null): T | null {
  if (!r || r.finished_at || r.ok !== null || Date.now() - Date.parse(r.started_at) < STALE_MS) return r;
  return { ...r, ok: false, message: "stopped before the end (time limit): press Pull now in Settings to finish" };
}

export async function runShipperPull(): Promise<{ ok: boolean; message: string }> {
  const st = shipperStatus();
  if (!st.ready) return { ok: false, message: "Missing in Vercel: " + [!st.key && "SHIPPER_API_KEY", !st.serviceKey && "SUPABASE_SERVICE_ROLE_KEY"].filter(Boolean).join(", ") };
  const key = process.env.SHIPPER_API_KEY!;
  const db = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  // One pull at a time ("Pull now" and the daily run share Shipper's per-minute limits).
  const { data: running } = await db.from("shipper_sync").select("started_at").is("finished_at", null).order("id", { ascending: false }).limit(1).maybeSingle();
  if (running && Date.now() - Date.parse(running.started_at as string) < STALE_MS) return { ok: false, message: "A Shipper pull is already running. Try again in a few minutes." };
  const { data: run } = await db.from("shipper_sync").insert({}).select("id").single();
  const finish = async (ok: boolean, message: string, orders = 0) => {
    if (run) await db.from("shipper_sync").update({ finished_at: new Date().toISOString(), ok, message: message.replace(key, "…"), orders }).eq("id", run.id);
    return { ok, message };
  };
  const t0 = Date.now();
  const deadline = t0 + 270_000; // stop cleanly before the platform's 300 s limit
  const call = async (path: string) => {
    if (Date.now() > deadline) throw new Error("Stopped before the time limit: run the Shipper pull again to finish.");
    return shipperGetPaced(path, deadline);
  };
  const notes: string[] = [];
  try {
    const now = Date.now(), nowIso = new Date(now).toISOString();
    // 1. Orders (every channel and product; Business keeps Aura Flex): one page of 100 per call, newest first.
    //    Backfill until the saved orders reach ~4 months back (also after a first pull that stopped half-way).
    const { data: oldest } = await db.from("shipper_orders").select("ordered_at").order("ordered_at").limit(1).maybeSingle();
    const backfill = !oldest || Date.parse(oldest.ordered_at as string) > now - (BACKFILL_DAYS - 5) * 864e5;
    // A backfill that stopped half-way (newest pages saved first) goes on from the oldest saved order.
    const since = ymd(now - (backfill ? BACKFILL_DAYS : REFRESH_DAYS) * 864e5), until = backfill && oldest ? ymd(Date.parse(oldest.ordered_at as string)) : ymd(now);
    const byId = new Map<string, OrderRow>();
    const unknown = new Set<string>();
    // Saved every 10 pages, so a run stopped by the time limit keeps what it read (the next run goes on from there).
    const saved = new Set<string>();
    const flush = async (only?: OrderRow[]) => {
      const rows = (only ?? [...byId.values()].filter((r) => !saved.has(r.order_id)));
      const ids = rows.map((r) => r.order_id);
      const seen = new Map<string, string | null>();
      for (let i = 0; i < ids.length; i += 500) {
        const { data, error } = await db.from("shipper_orders").select("order_id, settled_at").in("order_id", ids.slice(i, i + 500));
        if (error) throw new Error(`Reading saved orders: ${error.message}`);
        for (const r of data ?? []) seen.set(r.order_id as string, (r.settled_at as string | null) ?? null);
      }
      // Keep the first time an order was seen settled (Shipper's list carries no delivery date).
      for (const r of rows) { const s = seen.get(r.order_id); if (s && r.settled_at) r.settled_at = s; }
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await db.from("shipper_orders").upsert(rows.slice(i, i + 500), { onConflict: "order_id" });
        if (error) throw new Error(`Saving orders: ${error.message}`);
      }
      for (const id of ids) saved.add(id);
    };
    const MAX_PAGES = 90;
    for (let page = 1; page <= MAX_PAGES; page++) {
      const c = await call(`/orders?per_page=100&page=${page}&start_date=${since}&end_date=${until}`);
      if (c.error) throw new Error(`Orders page ${page}: ${c.error}`);
      const body = c.body as { data?: ApiOrder[]; pagination?: { last_page?: number } };
      // Newest first: a new order arriving mid-pull shifts pages, so the same order can come twice (kept once).
      for (const o of body.data ?? []) { if (!KNOWN_STATUSES.has(o.status)) unknown.add(String(o.status)); byId.set(String(o.id), toOrderRow(o, nowIso, backfill)); }
      const last = body.pagination?.last_page ?? page;
      if (page === MAX_PAGES && last > MAX_PAGES) throw new Error(`More than ${MAX_PAGES * 100} orders since ${since}: not all were read.`);
      if (page % 10 === 0) await flush();
      if (!body.data?.length || page >= last) break;
    }
    await flush();
    // Shipper lists some cancelled orders as "Pending" (cancelled shipment): its Canceled filter knows them.
    const cancelledNow: OrderRow[] = [];
    for (let page = 1; page <= 20; page++) {
      const c = await call(`/orders?per_page=100&page=${page}&status=Canceled&start_date=${since}&end_date=${until}`);
      if (c.error) { notes.push(`cancelled list not read (${c.error})`); break; }
      const body = c.body as { data?: ApiOrder[]; pagination?: { last_page?: number } };
      for (const o of body.data ?? []) { const r = byId.get(String(o.id)); if (r && r.status !== "delivered" && r.status !== "returned" && r.status !== "cancelled") { r.status = "cancelled"; r.settled_at = null; cancelledNow.push(r); } }
      if (!body.data?.length || page >= (body.pagination?.last_page ?? page)) break;
    }
    if (cancelledNow.length) await flush(cancelledNow);
    const rows = [...byId.values()];
    if (unknown.size) notes.push(`unknown Shipper status: ${[...unknown].join(", ")} (counted as new)`);

    // 2. Shipper's statistics for Aura Flex, this month and the two before (3 calls each; dashboard limit 12 / minute).
    const d = new Date(now + 36e5);
    let months = 0;
    const got: number[] = [];
    for (let k = 0; k < 3; k++) {
      const y = d.getUTCFullYear(), m = d.getUTCMonth() - k;
      const label = monthStart(y, m).slice(0, 7);
      const range = `start_date=${monthStart(y, m)}&end_date=${monthEnd(y, m)}`;
      const perf = await call(`/dashboard/product-performance?${range}&per_page=50`);
      const prod = productRow(perf.body);
      if (perf.error || !prod) { notes.push(`${label} statistics not read (${perf.error ?? "no Aura Flex row"})`); continue; }
      const pid = encodeURIComponent(String(prod.retailer_product_id));
      const web = await call(`/dashboard/confirmation-stats?${range}&retailer_product_id=${pid}`);
      const dm = await call(`/dashboard/internal-confirmation-stats?${range}&retailer_product_id=${pid}`);
      if (web.error || dm.error) { notes.push(`${label} statistics not read (${web.error ?? dm.error})`); continue; }
      const { error } = await db.from("shipper_month").upsert({ month: monthStart(y, m), web: web.body, dm: dm.body, product: prod, fetched_at: nowIso }, { onConflict: "month" });
      if (error) throw new Error(`Saving month stats: ${error.message}`);
      months++;
      got.push(k);
    }

    // 3. Stock (Aura Flex bottles at Shipper) and cash (delivered not paid yet, still on its way), today.
    const today = ymd(now);
    const products = await call("/products?per_page=50");
    const bottles = toStock(products.body);
    if (bottles !== null) { const { error } = await db.from("shipper_stock").upsert({ day: today, bottles }, { onConflict: "day" }); if (error) throw new Error(`Saving stock: ${error.message}`); }
    else notes.push(`stock not read (${products.error ?? "no Aura Flex product"})`);
    const overview = await call(`/dashboard/overview?start_date=${ymd(now - 90 * 864e5)}&end_date=${today}`);
    const cash = toCash(overview.body);
    if (cash) { const { error } = await db.from("shipper_cash").upsert({ day: today, collected_unpaid_tnd: cash.collected, in_transit_tnd: cash.transit }, { onConflict: "day" }); if (error) throw new Error(`Saving cash: ${error.message}`); }
    else notes.push(`cash not read (${overview.error ?? "no figures"})`);

    const msg = `Pulled ${rows.length} orders (${since} → ${until}), ${months} of 3 months of statistics, stock ${bottles ?? "—"}, cash ${cash ? "ok" : "—"} in ${Math.round((Date.now() - t0) / 1000)} s.${notes.length ? ` Note: ${notes.join("; ")}.` : ""}`;
    // Last month and the one before are needed; this month may have no statistics yet in its first days.
    return finish(got.includes(1) && got.includes(2) && (got.includes(0) || d.getUTCDate() <= 3), msg, rows.length);
  } catch (e) {
    return finish(false, e instanceof Error ? e.message : "The Shipper pull failed.");
  }
}
