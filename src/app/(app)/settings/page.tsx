import { TabPage, NotBuiltYet } from "@/components/TabPage";
export const metadata = { title: "Settings · Aura Flex" };
export default function Page() {
  return (
    <TabPage tab="settings" title="Settings">
      <NotBuiltYet phase="screen 2, next" what="Money, people and pay, alerts, data sources and lists are the next screen to be built." />
    </TabPage>
  );
}
