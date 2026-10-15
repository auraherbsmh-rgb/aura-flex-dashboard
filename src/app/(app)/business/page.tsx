import { TabPage, NotBuiltYet } from "@/components/TabPage";
export const metadata = { title: "Business · Aura Flex" };
export default function Page() {
  return (
    <TabPage tab="business" title="Are we making money?">
      <NotBuiltYet phase="phase 4" what="Money and Creative engine views arrive once month closes and Shipper are connected." />
    </TabPage>
  );
}
