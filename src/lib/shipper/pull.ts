// Server only. The daily Shipper pull: fills shipper_orders, shipper_stock and shipper_cash (service role).
// Built switched off: it runs once SHIPPER_API_KEY (+ SHIPPER_API_URL) and SUPABASE_SERVICE_ROLE_KEY are set in Vercel.
// The field mapping (toShipperOrder) is written against Shipper's API documentation before launch — nothing is guessed.
import { createClient as createAdminClient } from "@supabase/supabase-js";

export type ShipperStatus = { key: boolean; url: boolean; serviceKey: boolean; mapped: boolean; ready: boolean };

/** Set to true once toShipperOrder / stock / cash read Shipper's real fields (documentation in hand). */
const MAPPED = false;

export function shipperStatus(): ShipperStatus {
  const key = !!process.env.SHIPPER_API_KEY, url = !!process.env.SHIPPER_API_URL, serviceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { key, url, serviceKey, mapped: MAPPED, ready: key && url && serviceKey && MAPPED };
}

export async function runShipperPull(): Promise<{ ok: boolean; message: string }> {
  const st = shipperStatus();
  if (!st.mapped) return { ok: false, message: "Shipper is not connected yet: the API mapping is written once Shipper's API documentation is in hand." };
  if (!st.ready) return { ok: false, message: "Missing in Vercel: " + [!st.key && "SHIPPER_API_KEY", !st.url && "SHIPPER_API_URL", !st.serviceKey && "SUPABASE_SERVICE_ROLE_KEY"].filter(Boolean).join(", ") };
  const db = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: run } = await db.from("shipper_sync").insert({}).select("id").single();
  const finish = async (ok: boolean, message: string, orders = 0) => {
    if (run) await db.from("shipper_sync").update({ finished_at: new Date().toISOString(), ok, message, orders }).eq("id", run.id);
    return { ok, message };
  };
  // Before launch: fetch orders updated in the last 45 days (Aura Flex rows only — the account also sells Ashwagandha),
  // map each with toShipperOrder, upsert into shipper_orders; today's stock and cash into shipper_stock / shipper_cash.
  return finish(false, "Shipper pull not written yet.");
}
