import { TabPage, NotBuiltYet } from "@/components/TabPage";
export const metadata = { title: "Copywriting · Aura Flex" };
export default function Page() {
  return (
    <TabPage tab="copywriting" title="Copywriting">
      <NotBuiltYet phase="phase 2" what="Inbox, tasks, scripts, the pipeline and the Library arrive with the production flow." />
    </TabPage>
  );
}
