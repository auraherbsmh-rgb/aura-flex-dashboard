import { TabPage } from "@/components/TabPage";
import { MapPage } from "@/components/Map";
import { requireTab } from "@/lib/viewer";
import { getPickers } from "@/lib/proposals";
import { getCreateTaskContext, getMapData } from "@/lib/tasks";

export const metadata = { title: "Map & performance · Aura Flex" };

/** Map & performance (founders): the map + cell view now; Live ads and results arrive with Meta (phase 3). */
export default async function Page() {
  await requireTab("map");
  const [pickers, map, ctx] = await Promise.all([getPickers(), getMapData(), getCreateTaskContext()]);
  return (
    <TabPage tab="map" title="Map & performance">
      <MapPage data={{ ...map, avatars: pickers.avatars }} pickers={pickers} createCtx={ctx} />
      <div className="unit" style={{ padding: "0 8px" }}>Live ads, the results per cell (won, fading, lost, CPA) and the alerts arrive once Meta is connected (phase 3).</div>
    </TabPage>
  );
}
