import { TabPage } from "@/components/TabPage";
import { BusinessTabs } from "@/components/BusinessTabs";
import { Money } from "@/components/Money";
import { requireTab } from "@/lib/viewer";
import { requestTime } from "@/lib/tasks";
import { getMoneyData } from "@/lib/business/data";

export const metadata = { title: "Business · Aura Flex" };

/** Business (founders): Money | Creative engine (handoff §10). */
export default async function Page() {
  await requireTab("business");
  const now = requestTime();
  const money = await getMoneyData(now);
  const st = money.status;
  const shipperMissing = st.ready ? null : !st.mapped
    ? "The Shipper API link is set up before launch, from Shipper's API documentation."
    : `Add in Vercel: ${[!st.key && "SHIPPER_API_KEY", !st.url && "SHIPPER_API_URL", !st.serviceKey && "SUPABASE_SERVICE_ROLE_KEY"].filter(Boolean).join(", ")}.`;
  return (
    <TabPage tab="business" title="Business">
      <BusinessTabs
        money={money.noMoney
          ? <section className="card sec"><div className="info">Fill the money numbers in Settings → Money first: the business line, exchange rate, bottle and delivery cost and fixed costs.</div></section>
          : <Money view={money.view} line={money.base.businessLineUsd} fixed={money.base.fixedCostsTnd} stock={money.stock} cash={money.cash} shipperMissing={money.view.hasShipper ? null : shipperMissing} hasMeta={money.hasMeta} />}
        engine={<section className="card sec"><div className="info">Creative engine: next screen.</div></section>}
      />
    </TabPage>
  );
}
