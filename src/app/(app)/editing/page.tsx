import { TabPage, NotBuiltYet } from "@/components/TabPage";
export const metadata = { title: "Editing · Aura Flex" };
export default function Page() {
  return (
    <TabPage tab="editing" title="Editing">
      <NotBuiltYet phase="phase 2" what="Your queue, open task and private stats arrive with the production flow." />
    </TabPage>
  );
}
