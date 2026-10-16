import { notFound } from "next/navigation";
import { Engine } from "@/components/Engine";
import { buildEngine, type StateLog } from "@/lib/engine-shared";
import type { LibRow } from "@/lib/library-shared";
import type { ConceptResult, TaskRow } from "@/lib/tasks-shared";
import type { EditRound } from "@/lib/editing-shared";

/** Dev preview of Business · Creative engine (ENABLE_PREVIEW=1 only). Invented fixtures. */
export default function Preview() {
  if (process.env.ENABLE_PREVIEW !== "1") notFound();
  const now = Date.parse("2026-10-16T09:00:00Z");
  const iso = (daysAgo: number) => new Date(now - daysAgo * 864e5).toISOString();
  const tasks: TaskRow[] = [];
  const lib: LibRow[] = [];
  const results: Record<string, ConceptResult> = {};
  const editRounds = new Map<string, EditRound[]>();
  const launchedAt = new Map<string, string | null>();
  const log: StateLog[] = [];
  const fmts = ["UGC", "UGC", "Doctor video", "UGC", "VSL", "AI / 3D"];
  for (let i = 0; i < 24; i++) {
    const id = `t${i}`, start = 85 - i * 3.4;
    const sub = start - 3, appr = sub - 1.5, conf = appr - 1, foot = conf - 4.5, edit = foot - 2.5, launch = edit - 0.5;
    tasks.push({ id, status: launch > 0 ? "details_done" : "writing", dueOn: "2026-10-20", createdAt: iso(start), copywriter: i % 2 ? "Copywriter 2" : "Copywriter 1", copywriterId: i % 2 ? "c2" : "c1",
      avatarCode: "FSB", awareness: "Problem-Aware", angleId: "g", angle: "Knee-Prayer", angleCode: "Knee-Prayer", format: fmts[i % 6], formatCode: "UGC", keep: null, note: null, reference: null, scriptUrl: null, origin: "manual", changeFacts: null,
      rounds: sub > 0 ? [{ round: 1, submittedAt: iso(sub), decision: appr > 0 ? "approved" : null, decidedAt: appr > 0 ? iso(appr) : null, loom: null, note: null } as TaskRow["rounds"][number]] : [] });
    if (edit > 0) editRounds.set(id, [{ round: 1, submittedAt: iso(edit + 1), decision: "approved", decidedAt: iso(edit), loom: null } as unknown as EditRound]);
    if (launch > 0) {
      launchedAt.set(id, iso(launch));
      lib.push({ taskId: id, name: id, avatarCode: "FSB", awareness: "Problem-Aware", cell: "FSB × Problem", angleId: "g", angle: "Knee-Prayer", format: fmts[i % 6], formatKey: fmts[i % 6], mainArgumentId: "m", offer: null,
        copywriter: i % 2 ? "Copywriter 2" : "Copywriter 1", editor: i % 3 ? "Editor B" : "Editor A", testimonial: false, startedAt: iso(start), approvedAt: iso(appr), launchedAt: iso(launch),
        state: "testing", days: [3 + (i % 2), 1.5, 1, 4.5 + (i % 3 === 0 ? -1.5 : 0.5), 2.5, 0.5], done: true, hooks: [], looms: [], links: [], result: null, isStatic: false });
      const won = i % 3 === 0, lost = i % 3 === 1 && launch > 10;
      if (launch > 6) {
        results[id] = { taskId: id, state: won ? (i === 0 ? "fading" : "won") : lost ? "lost" : "testing", stateSince: iso(launch - 6), everWon: won, cpa7: won ? 3.2 : 6, line: 4.18, sales7: 20, spend7: 70, bestV: 1, live: !lost,
          variations: [], seenState: null, winnerNotedAt: null, wonAt: won ? iso(launch - 6) : null };
        log.push({ taskId: id, state: "testing", at: iso(launch) }, { taskId: id, state: won ? "won" : lost ? "lost" : "testing", at: iso(launch - 6) });
        if (i === 0) log.push({ taskId: id, state: "fading", at: iso(5) });
      }
    }
  }
  const base = { now, tasks, lib, results, editRounds, launchedAt, log, marginUsd: 6.0, rate: 3.35, hasMeta: true,
    cost: { copywriters: 3000, copywriterPerScript: 0, agency: 4000, strategist: 1500, editingPerVideo: 100, copywritersNote: "" },
    winnersMoney: new Map(Object.keys(results).map((id) => [id, { sales: 60, spendUsd: 190 }])) };
  return (
    <main className="page"><div className="slab"><div className="body">
      <Engine w4={buildEngine({ ...base, period: "4w" })} m3={buildEngine({ ...base, period: "3m" })} hasMeta />
    </div></div></main>
  );
}
