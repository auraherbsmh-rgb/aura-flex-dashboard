import { notFound } from "next/navigation";
import { LivePreview } from "./client";
import { buildLive, type ConceptInfo } from "@/lib/live-shared";
import type { MetaAd, MetaDay } from "@/lib/meta-shared";
import type { MoneyInputs } from "@/lib/money";

/** Dev preview of Live ads (ENABLE_PREVIEW=1 only). Invented fixtures: no real ad names. */
export default function Preview() {
  if (process.env.ENABLE_PREVIEW !== "1") notFound();
  const now = Date.parse("2026-10-16T09:00:00Z");
  const m: MoneyInputs = {
    businessLineUsd: 4.18, aovBandLowUsd: 20, aovBandHighUsd: 26, exchangeRate: 3.35, killTableUsd: [13, 14, 20, 28, 38.5, 44, 50, 55, 60.5, 66],
    bottleCostTnd: 20.6, deliveryCostTnd: 13, fixedPerOrderTnd: 9.78, bridgeFactor: 0.6279, doorRate1b: 0.691, doorRate2b: 0.826, doorRate3b: 0.872, doorRateAvg: 0.749,
    price1bTnd: 59, price2bTnd: 90, price3bTnd: 129,
  };
  const days = (from: string, n: number) => Array.from({ length: n }, (_, i) => new Date(Date.parse(`${from}T12:00:00Z`) + i * 864e5).toISOString().slice(0, 10));
  const D = (adId: string, day: string, spend: number, purchases = 0): MetaDay => ({ adId, day, spend, purchases, purchaseValue: purchases * 23, impressions: 1500, reach: 1100, linkClicks: 30, plays3s: 450, thruplays: 120, p25: 300, p50: 180, p75: 110, p100: 60 });
  const A = (adId: string, name: string, campaignId = "abo", status = "ACTIVE"): MetaAd => ({ adId, name, campaignId, adsetId: `as-${adId}`, status, createdTime: null });
  const n1 = "UGC_FSB_Problem-Aware_Knee-Prayer_Sami";
  const n2 = "UGC_MSB_Solution-Aware_Knee-Broad_Mervet";
  const n3 = "IMG_CGS_Product-Aware_Knee-Stairs_Hedi";
  const ads = [
    A("1", `${n1}_V1`), A("2", `CBO_${n1}_V1`, "cbo"), A("3", `${n1}_V2`), A("4", `${n1}_V3`, "abo", "PAUSED"),
    A("5", `${n2}_V1`), A("6", `${n2}_V2`),
    A("7", `${n3}_V1`),
    A("8", "VSL_BRD_Most-Aware_Old-Test_V4"), A("9", "UGC_CGH_Solution-Aware_Hips-Broad_Old_V2", "hips"),
  ];
  const daily = [
    ...days("2026-10-09", 7).map((d) => D("1", d, 10, 3)), ...days("2026-10-09", 7).map((d) => D("2", d, 10, 1)),
    ...days("2026-10-13", 3).map((d) => D("3", d, 4, 0)), ...days("2026-10-01", 4).map((d) => D("4", d, 5, 0)),
    ...days("2026-09-14", 14).map((d) => D("5", d, 10, 3)), ...days("2026-09-28", 18).map((d) => D("5", d, 10, 1)),
    ...days("2026-10-12", 4).map((d) => D("6", d, 4, d.endsWith("14") ? 1 : 0)),
    ...days("2026-09-20", 26).map((d) => D("7", d, 6, 2)),
    ...days("2026-10-10", 6).map((d) => D("8", d, 5, 1)), ...days("2026-10-10", 6).map((d) => D("9", d, 4, 1)),
  ];
  const scope = [{ campaignId: "abo", kind: "ABO" as const, track: "knee" }, { campaignId: "cbo", kind: "CBO" as const, track: "knee" }, { campaignId: "hips", kind: "ABO" as const, track: "hips" }];
  const generated = new Map<string, { taskId: string; v: number }>();
  const concepts = new Map<string, ConceptInfo>();
  const add = (taskId: string, base: string, name: string, cell: string, angle: string, format: string, formatCode: string, n: number) => {
    const hooks: ConceptInfo["hooks"] = {};
    for (let v = 1; v <= n; v++) { generated.set(`${base}_V${v}`.toLowerCase(), { taskId, v }); hooks[v] = { type: v % 2 ? "Storytelling" : "Authority", line: `Hook line ${v}`, name: `${base}_V${v}` }; }
    concepts.set(`t:${taskId}`, { key: `t:${taskId}`, name, cell, angle, format, formatCode, track: "knee", copywriter: "Copywriter 1", editor: "Editor 1", launchedAt: "2026-09-14T10:00:00Z", taskId, hooks });
  };
  add("t1", n1, "Sami", "FSB × Problem", "Knee-Prayer", "UGC", "UGC", 5);
  add("t2", n2, "Mervet", "MSB × Solution", "Knee-Broad", "UGC", "UGC", 5);
  add("t3", n3, "Hedi", "CGS × Product", "Knee-Stairs", "Image", "IMG", 3);
  const model = buildLive({ ads, daily, scope, budgets: [], generated, old: new Map(), concepts, money: m, now });
  return (
    <main className="page"><div className="slab"><div className="body">
      <LivePreview live={model.live} unmapped={model.unmapped} />
    </div></div></main>
  );
}
