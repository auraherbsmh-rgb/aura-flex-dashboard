import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { PlanWeek, type PlanItemView, type PlanView } from "@/components/PlanWeek";
import type { Pickers } from "@/lib/proposals-shared";
import type { CreateTaskContext } from "@/lib/tasks-shared";

/** Local-only preview of the Monday plan (ENABLE_PREVIEW=1; never on Vercel). Sample data. */
export default async function Preview({ searchParams }: { searchParams: Promise<{ locked?: string }> }) {
  if (process.env.ENABLE_PREVIEW !== "1") notFound();
  const sp = await searchParams;
  const pickers: Pickers = {
    avatars: [{ id: "a1", code: "FSB", label: "FSB · female sufferer, broad" }, { id: "a2", code: "CGS", label: "CGS · caregiver son" }],
    angles: [{ id: "g1", code: "Knee-Broad", label: "Knee-Broad" }],
    formats: [{ id: "f1", code: "UGC", label: "UGC" }],
  };
  const ctx: CreateTaskContext = { angles: [{ id: "g1", code: "Knee-Broad", label: "Knee-Broad", coreMessage: null }], tasks: [], copywriters: [{ id: "c1", name: "Copywriter 1", target: 4, approvedThisWeek: 1, openTasks: 2 }] };
  const it = (o: Partial<PlanItemView>): PlanItemView => ({
    id: "x", kind: "double_down", name: "Mounir · new concept 1", meta: "Double down · FSB × Most · Benefits · UGC", stage: "Task not created", tone: "t-orange",
    closed: false, carry: false, added: null, dropped: null, hasTask: false, sourceTask: "w1", prefill: null, ...o,
  });
  const pre = (id: string) => ({ planItem: id, proposalId: null, avatarId: "a1", awareness: "Most-Aware", angleId: "g1", formatId: "f1", label: "Double down" });
  const locked = sp.locked === "1";
  const view: PlanView = {
    weekLabel: "Mon 26 Oct", prevLabel: "Mon 19 Oct", cap: 8, locked: locked ? "Mon 10:40 by Ghazi" : null,
    items: [
      it({ id: "c1", name: "Morning stairs", meta: "Double down · FSB × Problem · Copywriter 2", stage: "Script changes", tone: "t-blue", carry: true, hasTask: true }),
      it({ id: "d1", prefill: pre("d1") }),
      it({ id: "d2", name: "Mounir · new concept 2", stage: "Writing", tone: "t-blue", hasTask: true }),
      it({ id: "n1", kind: "new_test", name: "CGS × Solution", meta: "New test · son worried about his mother", prefill: { ...pre("n1"), angleId: null, formatId: null }, added: locked ? "ADDED WED" : null }),
      it({ id: "l1", kind: "launch", name: "Benefits V3", meta: "Launch · FSB × Most · Benefits · UGC", stage: "Waiting to launch", tone: "t-orange", sourceTask: "v1" }),
      it({ id: "x1", kind: "new_test", name: "FSB × Product", meta: "New test", dropped: { reason: "No capacity this week", by: "Ghazi" } }),
    ],
    lastWeek: [
      it({ id: "p1", name: "Mervet", stage: "Launched", tone: "t-green", closed: true }),
      it({ id: "p2", name: "Hedi", dropped: { reason: "Replaced by another script", by: "Ghazi" } }),
      it({ id: "c1", name: "Morning stairs", stage: "Script changes", tone: "t-blue" }),
    ],
    tests: [{ taskId: "t1", name: "Mervet", cell: "FSB × Problem · Knee-Broad · UGC", launched: "Tue 20 Oct", word: "STILL TESTING", tone: "t-grey", line: "CPA $6.20 · line $5.85 · 4 purchases (7 days)" }],
    winners: [{ taskId: "w1", name: "Mounir", cell: "FSB × Most · Benefits · UGC", line: "CPA $4.10 · line $5.85 · 14 purchases (7 days)" }],
    launches: [{ taskId: "v1", name: "Benefits V3", title: "FSB × Most · UGC Benefits V3", sub: "Approved Thu · 5 hooks", days: 3 }, { taskId: "v2", name: "Ingredients", title: "BRD × Product · AI / 3D", sub: "Approved Fri · 1 hook", days: 2 }],
    log: locked ? [{ when: "Wed 14:12", who: "Ghazi", what: "Added a new test · son worried about his mother" }, { when: "Mon 10:40", who: "Ghazi", what: "Locked the plan · 5 items" }] : [],
    coverage: [
      { id: "a1", code: "FSB", label: "FSB", cells: [{ awareness: "Problem-Aware", total: 4, working: 1, lost: 2, moving: 1, planned: 0 }, { awareness: "Solution-Aware", total: 2, working: 0, lost: 2, moving: 0, planned: 0 }, { awareness: "Product-Aware", total: 0, working: 0, lost: 0, moving: 0, planned: 0 }, { awareness: "Most-Aware", total: 3, working: 1, lost: 1, moving: 1, planned: 2 }] },
      { id: "a2", code: "CGS", label: "CGS", cells: [{ awareness: "Problem-Aware", total: 1, working: 0, lost: 0, moving: 1, planned: 0 }, { awareness: "Solution-Aware", total: 0, working: 0, lost: 0, moving: 0, planned: 1 }, { awareness: "Product-Aware", total: 0, working: 0, lost: 0, moving: 0, planned: 0 }, { awareness: "Most-Aware", total: 0, working: 0, lost: 0, moving: 0, planned: 0 }] },
    ],
    hasMeta: true, ok: true,
  };
  return (
    <main className="page"><div className="slab"><div className="band">
      <AppHeader viewer={{ role: "founder_1", name: "Ghazi", personId: "p", email: "" } as never} active="home" />
      <div style={{ marginTop: 28 }}><h1 className="h1">Plan the week</h1></div>
    </div><div className="body">
      <PlanWeek view={view} ctx={ctx} pickers={pickers} order={{ items: [{ taskId: "o1", name: "Mounir 2", meta: "FSB × Most · UGC", late: false }, { taskId: "o2", name: "Sami", meta: "FSS × Problem · AUTH", late: true }], prio: { o1: { pos: 1, sug: 1, grp: 2, manual: false, dueOn: "2026-10-30", why: { winner: null, cell: { alive: 1, bestCpa: 4.1, spendDay: 22, tested: 3, won: 1, lost: 1 } } }, o2: { pos: 2, sug: 2, grp: 3, manual: false, dueOn: "2026-10-31", why: { winner: null, cell: { alive: 0, bestCpa: null, spendDay: null, tested: 0, won: 0, lost: 0 } } } }, version: 0, now: Date.parse("2026-10-28T10:00:00Z") }} />
    </div></div></main>
  );
}
