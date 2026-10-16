import { notFound } from "next/navigation";
import { Money } from "@/components/Money";
import { buildMoney, stockDays, type MetaDayTotal, type ShipperOrder } from "@/lib/business-shared";

/** Dev preview of Business · Money (ENABLE_PREVIEW=1 only). Invented orders shaped like Aug–Oct 2026. ?ship=0 = no Shipper. */
export default async function Preview({ searchParams }: { searchParams: Promise<{ ship?: string }> }) {
  if (process.env.ENABLE_PREVIEW !== "1") notFound();
  const noShip = (await searchParams).ship === "0";
  const now = Date.parse("2026-10-16T09:00:00Z");
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const orders: ShipperOrder[] = [];
  const meta: MetaDayTotal[] = [];
  const month = (ym: string, days: number, web: number, dm: number, conf: number, door: number, M: number, spend: number) => {
    for (let d = 1; d <= days; d++) {
      const day = `${ym}-${String(d).padStart(2, "0")}`;
      meta.push({ day, purchases: Math.round(M / days), spendUsd: spend / days });
      const make = (channel: "website" | "dm", n: number) => {
        for (let i = 0; i < n; i++) {
          const b = rnd() < 0.55 ? 1 : rnd() < 0.8 ? 2 : 3;
          const shipped = channel === "dm" || rnd() < conf;
          const age = now - Date.parse(`${day}T12:00:00Z`);
          const settled = age > 12 * 864e5 || rnd() < 0.5;
          const deliveredOk = rnd() < door + (b - 1) * 0.06;
          orders.push({
            orderId: `${day}-${channel}-${i}`, orderedAt: `${day}T10:00:00Z`, channel, bottles: b, totalTnd: b === 1 ? 59 : b === 2 ? 90 : 129,
            status: !shipped ? "cancelled" : !settled ? "shipped" : deliveredOk ? "delivered" : "returned",
            reason: shipped ? null : (["duplicate", "disqualified", "unreachable", "wrong_number"] as const)[Math.floor(rnd() * 4)],
            deliveryCostTnd: channel === "dm" ? 10.9 : 13.4, shippedAt: shipped ? new Date(Date.parse(`${day}T12:00:00Z`) + 864e5).toISOString() : null,
            settledAt: settled && shipped ? new Date(Date.parse(`${day}T12:00:00Z`) + 4 * 864e5).toISOString() : null,
          });
        }
      };
      make("website", Math.round(web / days));
      make("dm", Math.round(dm / days));
    }
  };
  month("2026-07", 31, 3047, 400, 0.72, 0.72, 2794, 12500);
  month("2026-08", 31, 3327, 421, 0.71, 0.72, 3102, 13752);
  month("2026-09", 30, 3095, 406, 0.66, 0.70, 2900, 13005);
  month("2026-10", 15, 1500, 200, 0.68, 0.71, 1450, 6600);
  const view = buildMoney({ orders: noShip ? [] : orders, metaDays: meta, bases: [{ month: "2026-09-01", status: "final", base: { exchangeRate: 3.35, bottleCostTnd: 20.6, deliveryCostTnd: 13, fixedCostsTnd: 17813, businessLineUsd: 4.18 } }], now });
  return (
    <main className="page"><div className="slab"><div className="body">
      <Money view={view} line={4.18} fixed={17813} hasMeta
        stock={noShip ? { bottles: null, days: null, perDay: 0, redBelow: null } : { bottles: 2400, ...stockDays(2400, orders, now), redBelow: 21 }}
        cash={noShip ? null : { collected: 38200, transit: 21400 }}
        shipperMissing={noShip ? "The Shipper API link is set up before launch, from Shipper's API documentation." : null} />
    </div></div></main>
  );
}
