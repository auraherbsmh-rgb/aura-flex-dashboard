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
 * Founders only, temporary: balance simulation (Oct 17). One read: Shipper's money overview over all dates, saved with
 * the time it was read, to compare "everything credited or debited for orders − withdrawals" with Shipper's top bar.
 * Read-only (GET). Removed once the simulation is done.
 */
export default async function Page() {
  await requireTab("settings");
  const now = new Date();
  const today = new Date(now.getTime() + 36e5).toISOString().slice(0, 10);
  const overview = await shipperGet(`/dashboard/overview?start_date=2024-01-01&end_date=${today}`);
  const supabase = await createClient();
  const saved = await supabase.from("shipper_probe").insert({ body: redact({ kind: "balance-sim", at: now.toISOString(), overview: overview.body, error: overview.error }) });
  const time = now.toLocaleTimeString("en-GB", { timeZone: "Africa/Tunis", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return (
    <main className="page"><div className="slab"><div className="body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <section className="card sec">
        <h1 style={{ margin: 0, fontSize: 26 }}>Shipper check · balance</h1>
        <div className="unit">Read at {time} (Tunisia). Now note Shipper&apos;s top-bar balance and send it to Claude. Don&apos;t reload this page.</div>
        <div className={`tag ${saved.error || overview.error ? "t-red" : "t-green"}`} style={{ marginTop: 10 }}><i aria-hidden="true" />{overview.error ? `SHIPPER ERROR · ${overview.error}` : saved.error ? `NOT SAVED · ${saved.error.message}` : "SAVED FOR CLAUDE · NOTHING TO COPY"}</div>
      </section>
      <Block title="Dashboard · overview (all dates)" call={overview} />
    </div></div></main>
  );
}
