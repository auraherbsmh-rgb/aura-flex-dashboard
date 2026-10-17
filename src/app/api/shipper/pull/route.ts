import { NextResponse } from "next/server";
import { runShipperPull } from "@/lib/shipper/pull";

/** Daily Shipper pull, called by Vercel Cron (vercel.json) with the CRON_SECRET. Read-only on Shipper. */
export const dynamic = "force-dynamic";
// The first pull reads ~4 months and waits out Shipper's per-minute limits.
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, message: "Not allowed." }, { status: 401 });
  }
  const result = await runShipperPull();
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
