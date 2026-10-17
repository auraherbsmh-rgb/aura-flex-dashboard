import { perf } from "@/lib/perf";
import { TabPage } from "@/components/TabPage";
import { requireTab } from "@/lib/viewer";
import { getSettings } from "@/lib/settings/data";
import { SettingsSections, SettingsSwitch, SettingsPills } from "./SettingsView";

// "Pull now" for Shipper reads ~4 months on the first run and waits out Shipper's per-minute limits.
export const maxDuration = 300;

export const metadata = { title: "Settings · Aura Flex" };

export default async function SettingsPage() {
  const mark = perf("settings");
  await requireTab("settings");
  mark("auth");
  const s = await getSettings();
  mark("data 2");
  const today = new Date().toISOString().slice(0, 10);
  mark("computed");
  return (
    <TabPage tab="settings" title="Settings" roleNote="Founders only" above={<SettingsSwitch />} below={<SettingsPills s={s} today={today} />}>
      <SettingsSections s={s} today={today} />
    </TabPage>
  );
}
