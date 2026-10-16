import { notFound } from "next/navigation";
import { Scorecard } from "@/components/Scorecard";
import { buildScorecard } from "@/lib/scorecard-shared";
import type { MapConcept } from "@/lib/map-shared";
import type { ConceptResult, Production, TaskRow } from "@/lib/tasks-shared";

/** Dev preview of the copywriter scorecard (ENABLE_PREVIEW=1 only). Invented fixtures. */
export default function Preview() {
  if (process.env.ENABLE_PREVIEW !== "1") notFound();
  const now = Date.parse("2026-10-16T09:00:00Z");
  const T = (id: string, av: string, aw: string, angle: string, format = "UGC", created = "2026-09-10T10:00:00Z"): TaskRow => ({
    id, status: "details_done", dueOn: "2026-09-20", createdAt: created, copywriter: "Copywriter 1", copywriterId: "c1", avatarCode: av, awareness: aw,
    angleId: angle, angle, angleCode: angle, format, formatCode: format === "Doctor video" ? "AUTH" : "UGC", keep: null, note: null, reference: null,
    scriptUrl: "https://docs.google.com/document/d/x", origin: "manual", changeFacts: null, rounds: [],
  });
  const tasks = [
    T("1", "FSB", "Problem-Aware", "Knee-Prayer"), T("2", "CGS", "Problem-Aware", "Father-Suffer"), T("3", "FSS", "Problem-Aware", "Knee-Stairs", "UGC", "2026-10-01T10:00:00Z"),
    T("4", "CGD", "Problem-Aware", "Knee-Broad", "Doctor video", "2026-10-02T10:00:00Z"), T("5", "CGS", "Problem-Aware", "Mosque", "UGC", "2026-08-20T10:00:00Z"),
    T("6", "MSP", "Solution-Aware", "Cartilage", "UGC", "2026-08-10T10:00:00Z"), T("7", "FSB", "Solution-Aware", "Stairs-2", "Doctor video", "2026-09-01T10:00:00Z"),
  ];
  const faces = ["Mervet", "Yassine", "Rania", "Ali", "Hela", "Sonia", "Amel"];
  const types = ["Storytelling", "Educational", "Myth Busting", "Storytelling", "Authority"];
  const concepts: MapConcept[] = tasks.map((t, i) => ({
    taskId: t.id, avatarId: t.avatarCode, avatarCode: t.avatarCode, awareness: t.awareness, angleId: t.angleId, angle: t.angle, angleCode: t.angle, track: "knee",
    format: t.format, formatCode: t.formatCode, origin: "manual", status: "details_done", copywriter: "Copywriter 1", createdAt: t.createdAt, face: faces[i],
    generate: false, vo: false, launchedAt: new Date(Date.parse(t.createdAt) + 6 * 864e5).toISOString(), liveAt: null, holdAt: null,
    variations: types.map((ty, v) => ({ v: v + 1, type: ty, line: ["I couldn’t kneel to pray anymore", "3 things that wear out cartilage", "Why painkillers stop working", "Every morning the stairs were my enemy", "What my doctor told me"][v], name: `UGC_${t.avatarCode}_${t.angle}_${faces[i]}_V${v + 1}` })),
  }));
  const R = (id: string, state: ConceptResult["state"], everWon: boolean, since: string, extra: Partial<ConceptResult> = {}): ConceptResult => ({
    taskId: id, state, stateSince: since, everWon, cpa7: everWon ? 3.1 + Number(id) / 10 : 6.2, line: 4.18, sales7: everWon ? 22 : 3, spend7: 70, bestV: 1, live: state !== "lost",
    variations: types.map((_, v) => ({ v: v + 1, state: v === 0 && everWon ? "won" : v < 3 ? "lost" : "testing", cpa7: null, sales7: 2, spend7: 12, line: 4.18, hookRate: 0.3, hold: 0.25, ctr: 0.015, live: true })),
    seenState: null, winnerNotedAt: null, wonAt: everWon ? since : null,
    totals: { impressions: 120000, plays3s: 38000, thruplays: 8000, clicks: 1700, p25: 14000, p50: 8000, p75: 5000, p100: 2500, spend: 300, sales: 80 }, ...extra,
  });
  const results: Record<string, ConceptResult> = {
    "1": R("1", "won", true, "2026-10-12T05:00:00Z"), "2": R("2", "won", true, "2026-10-09T05:00:00Z"),
    "3": R("3", "testing", false, "2026-10-08T05:00:00Z"), "4": R("4", "testing", false, "2026-10-09T05:00:00Z"),
    "5": R("5", "lost", false, "2026-09-20T05:00:00Z"), "6": R("6", "lost", false, "2026-08-28T05:00:00Z"), "7": R("7", "fading", true, "2026-09-25T05:00:00Z"),
  };
  const productions = new Map<string, Production>(tasks.map((t) => [t.id, { finalUrl: "https://drive.google.com/x" } as Production]));
  const data = buildScorecard({ tasks, concepts, results, productions, bands: { on: true, hook: 27, hold: 23, ctrVideo: 1.2, ctrImage: 1.5, minImpressions: 1000 }, now });
  return (
    <main className="page"><div className="slab"><div className="body">
      <Scorecard data={data} personId="c1" name="Copywriter 1" forFounder={false} cwQuery="" />
    </div></div></main>
  );
}
