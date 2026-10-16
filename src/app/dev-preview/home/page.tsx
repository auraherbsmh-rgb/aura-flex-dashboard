import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { FounderNumbers, HomeHero } from "@/components/Home";
import { NeedsMe } from "@/components/Proposals";
import type { NeedGroup } from "@/lib/needs";

/** Dev preview of the Founder Home (ENABLE_PREVIEW=1 only). ?as=f2 for Founder 2. */
export default async function Preview({ searchParams }: { searchParams: Promise<{ as?: string }> }) {
  if (process.env.ENABLE_PREVIEW !== "1") notFound();
  const f2 = (await searchParams).as === "f2";
  const v = { personId: "p", name: f2 ? "Founder 2" : "Founder 1", role: (f2 ? "founder_2" : "founder_1") as "founder_1" | "founder_2", email: "" };
  const kill = { key: "k-1", adId: "000000000001", name: "UGC_MSB_Solution-Aware_Knee-Broad_Mervet_V2", flag: "kill" as const, reason: "Kill table reached: $16 spent at 1 sale (kill at $14)", concept: "Mervet · MSB × Solution · V2", sinceMs: 0, recheck: null };
  const unmapped = { base: "vsl_brd_most-aware_old-test", example: "VSL_BRD_Most-Aware_Old-Test_V4", adIds: ["9"], live: true, spend7: 30, sales7: 6, formatGuess: "VSL", campaignTrack: "knee" };
  const L = (id: string, label: string, code?: string) => ({ id, code: code ?? label, label });
  const tagPickers = { avatars: ["FSB", "FSS", "MSB", "MSP", "CGD", "CGS"].map((c) => L(c, c)), angles: [L("kb", "Knee-Broad")], formats: [L("ugc", "UGC"), L("vsl", "VSL"), L("img", "Image", "IMG")] };
  const groups: NeedGroup[] = [
    ...(f2 ? [{ name: "KILL · ACT IN META FIRST", tone: "red" as const, items: [
      { key: "k-1", type: "KILL" as const, tagTone: "red" as const, title: "Kill line · pause Mervet · MSB × Solution · V2", sub: kill.reason, age: "5h", ageTone: "red" as const, hours: 5, kill },
    ] }] : []),
    { name: "LATE / OVER 48H", tone: "red", items: [
      { key: "a", type: "REVIEW", tagTone: "blue", title: "Review script: Knee-Broad", sub: "CGS × Problem · Copywriter 1 · round 1", age: "50h", ageTone: "red", hours: 50, href: "/home" },
      { key: "b", type: "OVERDUE", tagTone: "red", title: "FSB × Most script · Copywriter 2", sub: "Knee-Prayer · was due Monday", age: "+2 DAYS", ageTone: "red", hours: 48, href: "/home" },
    ] },
    { name: "THIS WEEK", tone: "amber", items: [
      { key: "u-1", type: "UNMAPPED", tagTone: "grey", title: "Tag an old ad · VSL_BRD_Most-Aware_Old-Test_V4", sub: "1 ad · $30 · 6 sales in 7d", age: "1 DAY", ageTone: "grey", hours: 30, unmapped },
      { key: "c", type: "TESTIMONIAL", tagTone: "amber", title: "New testimonial · tag it or mark not usable", sub: "Support call · repeat buyer", age: "1 DAY", ageTone: "amber", hours: 30 },
    ] },
  ];
  return (
    <main className="page">
      <div className="slab">
        <div className="band">
          <AppHeader viewer={v} active="home" />
          <HomeHero day="16" weekday="Fri" month="October" greeting="Good afternoon" name={v.name} total={3} late={2} oldest="50h" />
        </div>
        <div className="body">
          <FounderNumbers
            initial={f2 ? "f2" : "f1"}
            f1={{ scripts: { done: 5, target: 8, pct: 63, tone: "green", word: "ON PACE · 3 TO GO" } }}
            f2={{ videos: { done: 2, target: 8, pct: 25, tone: "amber", word: "BEHIND · 6 TO GO" }, speed: { total: 6.5, editing: 2, revisions: 1.5, waiting: 3, count: 4 },
              waiting: [{ taskId: "t", title: "FSB × Problem · UGC Mervet", sub: "Approved Tue · 5 hooks", days: 1 }] }}
            blocked1={[{ key: "1", what: "CGS × Problem · Knee-Broad · revision", who: "Copywriter 1", since: 1, text: "3 days", late: true }, { key: "2", what: "Lina · FSB × Solution · UGC · shoot Sat Oct 18", who: "the agency", since: 0, text: "in 2 d", late: false }]}
            blocked2={[{ key: "2", what: "Lina · FSB × Solution · UGC · shoot Sat Oct 18", who: "the agency", since: 0, text: "in 2 d", late: false }]}
          >
            <NeedsMe groups={groups} total={groups.reduce((n, g) => n + g.items.length, 0)} tagPickers={tagPickers} />
          </FounderNumbers>
        </div>
      </div>
    </main>
  );
}
