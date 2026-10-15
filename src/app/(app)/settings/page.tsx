import { TabPage } from "@/components/TabPage";
import { requireTab } from "@/lib/viewer";
import { getSettings } from "@/lib/settings/data";
import { SettingsSections, SettingsSwitch, SettingsPills } from "./SettingsView";

export const metadata = { title: "Settings · Aura Flex" };

export default async function SettingsPage() {
  await requireTab("settings");
  const s = await getSettings();
  const today = new Date().toISOString().slice(0, 10);
  return (
    <TabPage tab="settings" title="Settings" roleNote="Founders only" above={<SettingsSwitch />} below={<SettingsPills s={s} today={today} />}>
      <SettingsSections s={s} today={today} />
    </TabPage>
  );
}
