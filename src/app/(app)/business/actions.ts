"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

export type CashResult = { ok?: string; error?: string };

async function isFounder() {
  const v = await getViewer();
  return v.role === "founder_1" || v.role === "founder_2" ? v : null;
}

/** "↻" on Cash at Shipper, and opening Money when the last read is over an hour old: one overview read. Read-only on Shipper. */
export async function refreshShipperCash(): Promise<CashResult> {
  if (!(await isFounder())) return { error: "Only founders can refresh Shipper figures." };
  const { shipperStatus, saveShipperCash, adminDb, STALE_MS } = await import("@/lib/shipper/pull");
  const { shipperGetPaced } = await import("@/lib/shipper/api");
  if (!shipperStatus().ready) return { error: "Shipper isn't connected yet." };
  const db = adminDb();
  // Shipper's dashboard figures allow 12 reads a minute: never during a pull, never twice within 30 seconds.
  const [{ data: running }, { data: last }] = await Promise.all([
    db.from("shipper_sync").select("started_at").is("finished_at", null).order("id", { ascending: false }).limit(1).maybeSingle(),
    db.from("shipper_cash").select("at").order("day", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (running && Date.now() - Date.parse(running.started_at as string) < STALE_MS) return { error: "The Shipper pull is running: the figures update when it ends (a few minutes)." };
  if (last?.at && Date.now() - Date.parse(last.at as string) < 30_000) return { ok: "Up to date" };
  try {
    const deadline = Date.now() + 20_000;
    const r = await saveShipperCash(db, (path) => shipperGetPaced(path, deadline));
    if (typeof r === "string") return { error: `Not refreshed: ${r}.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Not refreshed." };
  }
  revalidatePath("/business");
  return { ok: "Refreshed" };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** "+ Withdrawal or refund": money taken out of the Shipper balance (Shipper's API doesn't show it). */
export async function addCashOut(kind: "withdrawal" | "refund", amount: number, day: string): Promise<CashResult> {
  const v = await isFounder();
  if (!v) return { error: "Only founders can add withdrawals." };
  if (kind !== "withdrawal" && kind !== "refund") return { error: "Choose withdrawal or customer refund." };
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) return { error: "Enter the amount in TND." };
  const today = new Date(Date.now() + 36e5).toISOString().slice(0, 10);
  if (!DAY.test(day)) return { error: "Choose the date." };
  if (day < "2026-10-19") return { error: "Choose a date from Oct 19, 2026: earlier ones are already counted." };
  if (day > today) return { error: "The date can't be in the future." };
  const supabase = await createClient();
  const { error } = await supabase.from("shipper_cash_out").insert({ kind, amount_tnd: Math.round(amount * 1000) / 1000, day, created_by: v.personId });
  if (error) return { error: "Not saved. Reload the page and try again." };
  revalidatePath("/", "layout");
  return { ok: `${kind === "withdrawal" ? "Withdrawal" : "Customer refund"} of ${amount.toLocaleString("en-US")} TND saved.` };
}

/** Settings → history: delete a mistaken entry (the baseline can't be deleted). */
export async function deleteCashOut(id: string): Promise<CashResult> {
  if (!(await isFounder())) return { error: "Only founders can delete entries." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("shipper_cash_out").delete().eq("id", id).neq("kind", "baseline").select("id");
  if (error || !data?.length) return { error: "Not deleted. Reload the page and try again." };
  revalidatePath("/", "layout");
  return { ok: "Deleted." };
}
