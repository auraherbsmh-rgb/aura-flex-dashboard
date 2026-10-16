import { TabPage } from "@/components/TabPage";
import { MapTabs, type LiveView } from "@/components/MapTabs";
import { requireTab } from "@/lib/viewer";
import { getPickers } from "@/lib/proposals";
import { createClient } from "@/lib/supabase/server";
import { getCreateTaskContext, getMapData, requestTime } from "@/lib/tasks";
import { getLiveData } from "@/lib/meta/live-data";

export const metadata = { title: "Map & performance · Aura Flex" };

/** Map & performance (founders): Map | Live ads. Live ads reads the daily Meta pull (phase 3). */
export default async function Page() {
  await requireTab("map");
  const now = requestTime();
  const supabase = await createClient();
  const mapP = getMapData();
  const [pickers, map, ctx, liveData, formats] = await Promise.all([
    getPickers(), mapP, getCreateTaskContext(), getLiveData(now, mapP),
    supabase.from("list_items").select("id, code, label").eq("list", "format").eq("status", "approved").order("sort"),
  ]);
  const st = liveData.status;
  const live: LiveView = st.ready && liveData.model && liveData.hasData
    ? {
        connected: true, live: liveData.model.live, unmapped: liveData.model.unmapped, frozenEntities: liveData.model.frozenEntities, d3Min: liveData.d3Min,
        lastPull: liveData.lastPull ? `${new Date(Date.parse(liveData.lastPull.started_at) + 36e5).toISOString().slice(0, 16).replace("T", " ")} (Tunisia)` : null,
      }
    : {
        connected: false,
        missing: [!st.token && "META_ACCESS_TOKEN", !st.serviceKey && "SUPABASE_SERVICE_ROLE_KEY"].filter(Boolean) as string[],
        noCron: !st.cronSecret,
        noMoney: liveData.noMoney,
        lastError: liveData.lastPull && !liveData.lastPull.ok ? liveData.lastPull.message : null,
      };
  return (
    <TabPage tab="map" title="Map & performance">
      <MapTabs map={{ ...map, avatars: pickers.avatars }} pickers={pickers} tagPickers={{ ...pickers, formats: (formats.data ?? []) as { id: string; code: string | null; label: string }[] }} createCtx={ctx} live={live} />
    </TabPage>
  );
}
