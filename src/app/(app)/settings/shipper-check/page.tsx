import { requireTab } from "@/lib/viewer";
import { redact, shipperGet, type ShipperCall } from "@/lib/shipper/api";

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
  const [details, products, overview, confirmation, delivery] = await Promise.all([
    Promise.all(sampleIds.map((id) => shipperGet(`/orders/${id}`))),
    shipperGet("/products?per_page=20"),
    shipperGet(`/dashboard/overview?${range}`),
    shipperGet(`/dashboard/confirmation-stats?${range}`),
    shipperGet(`/dashboard/delivery-stats?${range}`),
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

  return (
    <main className="page"><div className="slab"><div className="body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <section className="card sec">
        <h1 style={{ margin: 0, fontSize: 26 }}>Shipper check</h1>
        <div className="unit">Temporary page for founders: what the Shipper API sends. Read-only; names, phones and addresses are hidden. Dashboard stats cover {ym(monthStart)} → {ym(monthEnd)}.</div>
        <pre style={{ marginTop: 12, background: "#f3f3f0", borderRadius: 14, padding: 12, fontSize: 13, whiteSpace: "pre-wrap" }}>{JSON.stringify(summary, null, 2)}</pre>
      </section>
      <Block title="Orders · list (first 100)" call={{ ...list, body: { ...(list.body as object), data: orders.slice(0, 10) } }} />
      {details.map((d, i) => <Block key={d.path} title={`Order detail ${i + 1} · status ${String(orders.find((o) => `/orders/${o.id}` === d.path)?.status)}`} call={d} />)}
      <Block title="Products (stock)" call={products} />
      <Block title="Dashboard · overview (money)" call={overview} />
      <Block title="Dashboard · confirmation stats" call={confirmation} />
      <Block title="Dashboard · delivery stats" call={delivery} />
    </div></div></main>
  );
}
