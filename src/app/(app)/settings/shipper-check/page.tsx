import { requireTab } from "@/lib/viewer";
import { redact, shipperGet, type ShipperCall } from "@/lib/shipper/api";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Shipper check · Aura Flex" };
export const dynamic = "force-dynamic";

function Block({ title, call }: { title: string; call: ShipperCall }) {
  return (
    <section className="card sec" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
        <span className={`tag ${call.error ? "t-red" : "t-green"}`}><i aria-hidden="true" />{call.error ?? `OK · ${call.ms} ms`}</span>
      </div>
      <code className="unit">GET {call.path}</code>
      <pre style={{ margin: 0, maxHeight: 420, overflow: "auto", background: "#f3f3f0", borderRadius: 14, padding: 12, fontSize: 12 }}>{JSON.stringify(redact(call.body), null, 2)?.slice(0, 20000)}</pre>
    </section>
  );
}

/**
 * Founders only, temporary: what the Shipper API really sends, so the connection is written from real fields, not
 * guesses. Read-only (GET), names / phones / addresses hidden. Removed once the Shipper pull is mapped.
 */
export default async function Page() {
  await requireTab("settings");
  const now = new Date();
  const ym = (d: Date) => d.toISOString().slice(0, 10);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  const range = `start_date=${ym(monthStart)}&end_date=${ym(monthEnd)}`;

  const list = await shipperGet("/orders?per_page=100&page=1");
  const orders = ((list.body as { data?: { id: string | number; status: string | null; store_name?: string | null; external_order_id?: string | null; items_count?: number; revenue?: string; is_paid?: boolean }[] })?.data ?? []);
  const sampleIds = [...new Set(orders.map((o) => o.status))].slice(0, 4).map((s) => orders.find((o) => o.status === s)!.id);
  // One page per status (older orders too), and one full order of each.
  const STATUSES = ["Pending", "Fulfilled", "In Transit", "Delivered", "Partial Delivery", "Returned", "Partial Return", "Canceled", "Paid"];
  const byStatus = await Promise.all(STATUSES.map((st) => shipperGet(`/orders?per_page=5&page=1&status=${encodeURIComponent(st)}`)));
  const firstOf = byStatus.map((c) => ((c.body as { data?: { id: string | number }[] })?.data ?? [])[0]?.id).filter((x) => x !== undefined);
  const [details, products, overview, confirmation, delivery, perf] = await Promise.all([
    Promise.all([...new Set([...sampleIds, ...firstOf])].slice(0, 12).map((id) => shipperGet(`/orders/${id}`))),
    shipperGet("/products?per_page=20"),
    shipperGet(`/dashboard/overview?${range}`),
    shipperGet(`/dashboard/confirmation-stats?${range}`),
    shipperGet(`/dashboard/delivery-stats?${range}`),
    shipperGet(`/dashboard/product-performance?${range}&per_page=20`),
  ]);

  const count = (f: (o: (typeof orders)[number]) => string) => Object.entries(orders.reduce<Record<string, number>>((m, o) => { const k = f(o); m[k] = (m[k] ?? 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]);
  const summary = {
    "orders read (first page)": orders.length,
    "total orders (pagination)": (list.body as { pagination?: { total?: number } })?.pagination?.total ?? "—",
    "by status": count((o) => String(o.status)),
    "by store_name": count((o) => String(o.store_name ?? "(none)")),
    "with external_order_id": count((o) => (o.external_order_id ? "yes (website?)" : "no (manual / DM?)")),
    "items_count values": count((o) => String(o.items_count ?? "—")),
  };

  // Store names vs channel: every order of the last 31 days (up to 1,500), counted by store name and status, next to
  // Shipper's own "Confirmation" and "Internal confirmation" totals for the same dates.
  const d31 = ym(new Date(now.getTime() - 31 * 864e5)), today = ym(now);
  type O = { id: number; status: string | null; store_name: string | null; items_count: number; shipments_count: number; products: { id: number; name: string }[]; created_at: string };
  const recent: O[] = [];
  for (let page = 1; page <= 15; page++) {
    const c = await shipperGet(`/orders?per_page=100&page=${page}&start_date=${d31}&end_date=${today}`);
    const rows = ((c.body as { data?: O[] })?.data ?? []);
    recent.push(...rows);
    if (rows.length < 100) break;
  }
  const tally: Record<string, Record<string, number>> = {};
  for (const o of recent) {
    const k = String(o.store_name);
    tally[k] ??= {};
    for (const key of [`status:${o.status}`, `bottles:${o.items_count}`, `shipments:${o.shipments_count}`, `product:${o.products.map((x) => x.name).sort().join("+") || "(none)"}`, "total"]) tally[k][key] = (tally[k][key] ?? 0) + 1;
  }
  const [conf31, internal31] = await Promise.all([
    shipperGet(`/dashboard/confirmation-stats?start_date=${d31}&end_date=${today}`),
    shipperGet(`/dashboard/internal-confirmation-stats?start_date=${d31}&end_date=${today}`),
  ]);
  const channels = { range: `${d31} → ${today}`, ordersRead: recent.length, byStoreName: tally, shipperConfirmation: conf31.body, internalConfirmation: internal31.body };

  // Saved (redacted) so the connection can be mapped from it without screenshots.
  const supabase = await createClient();
  const snapshot = redact({
    range, summary, channels, list: { ...(list.body as object), data: orders.slice(0, 30) },
    byStatus: Object.fromEntries(STATUSES.map((st, i) => [st, { status: byStatus[i].status, error: byStatus[i].error, body: byStatus[i].body }])),
    details: details.map((d) => ({ path: d.path, status: d.status, body: d.body })),
    products: products.body, overview: overview.body, confirmation: confirmation.body, delivery: delivery.body, productPerformance: perf.body,
  });
  const saved = await supabase.from("shipper_probe").insert({ body: snapshot });

  return (
    <main className="page"><div className="slab"><div className="body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <section className="card sec">
        <h1 style={{ margin: 0, fontSize: 26 }}>Shipper check</h1>
        <div className="unit">Temporary page for founders: what the Shipper API sends. Read-only; names, phones and addresses are hidden. Dashboard stats cover {ym(monthStart)} → {ym(monthEnd)}.</div>
        <div className={`tag ${saved.error ? "t-red" : "t-green"}`} style={{ marginTop: 10 }}><i aria-hidden="true" />{saved.error ? `NOT SAVED · ${saved.error.message}` : "SAVED FOR CLAUDE · NOTHING TO COPY"}</div>
        <pre style={{ marginTop: 12, background: "#f3f3f0", borderRadius: 14, padding: 12, fontSize: 13, whiteSpace: "pre-wrap" }}>{JSON.stringify(summary, null, 2)}</pre>
      </section>
      <Block title="Orders · list (first 100)" call={{ ...list, body: { ...(list.body as object), data: orders.slice(0, 10) } }} />
      {details.map((d, i) => <Block key={d.path} title={`Order detail ${i + 1} · status ${String(orders.find((o) => `/orders/${o.id}` === d.path)?.status)}`} call={d} />)}
      <Block title="Products (stock)" call={products} />
      <Block title="Dashboard · overview (money)" call={overview} />
      <Block title="Dashboard · confirmation stats" call={confirmation} />
      <Block title="Dashboard · delivery stats" call={delivery} />
      <Block title="Dashboard · product performance" call={perf} />
      <Block title={`Store names, last 31 days (${recent.length} orders)`} call={{ path: `/orders · ${channels.range}`, status: 200, ms: 0, body: tally, error: null }} />
      <Block title="Internal confirmation (last 31 days)" call={internal31} />
    </div></div></main>
  );
}
