import { NextResponse } from "next/server";
import { runMetaPull } from "@/lib/meta/pull";

/** Daily Meta pull, called by Vercel Cron (vercel.json) with the CRON_SECRET. Read-only on Meta. */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, message: "Not allowed." }, { status: 401 });
  }
  const result = await runMetaPull();
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
