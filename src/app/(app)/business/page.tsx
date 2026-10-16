import { perf } from "@/lib/perf";
import { TabPage } from "@/components/TabPage";
import { BusinessTabs } from "@/components/BusinessTabs";
import { Money } from "@/components/Money";
import { requireTab } from "@/lib/viewer";
import { requestTime } from "@/lib/tasks";
import { getMoneyData } from "@/lib/business/data";
import { getEngineData } from "@/lib/business/engine-data";
import { Engine } from "@/components/Engine";

export const metadata = { title: "Business · Aura Flex" };

/** Business (founders): Money | Creative engine (handoff §10). */
export default async function Page() {
  const mark = perf("business");
  await requireTab("business");
  mark("auth");
  const now = requestTime();
  const [money, engine] = await Promise.all([getMoneyData(now), getEngineData(now)]);
  mark("data 2");
  const st = money.status;
  const shipperMissing = st.ready ? null : !st.mapped
    ? "The Shipper API link is set up before launch, from Shipper's API documentation."
    : `Add in Vercel: ${[!st.key && "SHIPPER_API_KEY", !st.url && "SHIPPER_API_URL", !st.serviceKey && "SUPABASE_SERVICE_ROLE_KEY"].filter(Boolean).join(", ")}.`;
  mark("computed");
  return (
    <TabPage tab="business" title="Business">
      <BusinessTabs
        money={money.noMoney
          ? <section className="card sec"><div className="info">Fill the money numbers in Settings → Money first: the business line, exchange rate, bottle and delivery cost and fixed costs.</div></section>
          : <Money view={money.view} line={money.base.businessLineUsd} fixed={money.base.fixedCostsTnd} stock={money.stock} cash={money.cash} shipperMissing={money.view.hasShipper || st.ready ? null : shipperMissing} hasMeta={money.hasMeta}
              shipperNote={st.ready && !money.view.hasShipper ? (money.lastSync?.ok === false ? `Shipper pull: ${money.lastSync.message ?? "failed"}` : "Shipper is connected: waiting for the first pull (06:00, or Settings → Data → Pull now).") : money.lastSync?.ok === false ? `Last Shipper pull failed: ${money.lastSync.message ?? ""}` : null} />}
        engine={<Engine w4={engine.w4} m3={engine.m3} hasMeta={engine.hasMeta} />}
      />
    </TabPage>
  );
}
