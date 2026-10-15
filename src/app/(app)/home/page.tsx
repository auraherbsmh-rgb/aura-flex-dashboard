import { TabPage, NotBuiltYet } from "@/components/TabPage";
export const metadata = { title: "Home · Aura Flex" };
export default function Page() {
  return (
    <TabPage tab="home" title="Home">
      <NotBuiltYet phase="phase 2" what="Your three numbers, the Needs me list and Blocked arrive with the production flow." />
    </TabPage>
  );
}
