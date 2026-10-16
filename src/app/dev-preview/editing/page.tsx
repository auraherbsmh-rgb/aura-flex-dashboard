import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { EditQueue, EditTask, EditorTiles, type EditView } from "@/components/Editing";
import { buildQueue, editorStats, type EditRound } from "@/lib/editing-shared";
import type { Production, TaskRow } from "@/lib/tasks-shared";

/** Local-only preview of screen 9 (ENABLE_PREVIEW=1; never on Vercel). ?as=founder for the founder view. */
export default async function Preview({ searchParams }: { searchParams: Promise<{ task?: string; as?: string }> }) {
  if (process.env.ENABLE_PREVIEW !== "1") notFound();
  const sp = await searchParams;
  const founder = sp.as === "founder";
  const now = Date.parse("2026-10-16T10:00:00Z");
  const T = (id: string, origin = "manual"): TaskRow => ({
    id, status: "details_done", dueOn: "2026-10-20", createdAt: "", copywriter: "Copywriter 1", copywriterId: "c1", avatarCode: "MSB", awareness: "Problem-Aware",
    angleId: "g", angle: "Knee-Broad", angleCode: "Knee-Broad", format: "UGC", formatCode: "UGC", keep: null, note: null, reference: null,
    scriptUrl: "https://docs.google.com/document/d/x", origin, changeFacts: null, rounds: [],
  });
  const P = (taskId: string, extra: Partial<Production> = {}): Production => ({ taskId, footageUrl: "https://drive.google.com/raw", allHooksShot: true, footageGap: null, footageAt: "2026-10-12T08:00:00Z", editorId: "eb", editorName: "Editor B", editDue: "2026-10-17", brief: "Calm, older working man, slow cuts. Show the stairs at work and the bottle in hand at the end.", reference: "https://www.facebook.com/ads/library/?id=1", assignedAt: "2026-10-12T09:00:00Z", editStartedAt: null, ...extra });
  const R = (round: number, decision: EditRound["decision"], extra: Partial<EditRound> = {}): EditRound => ({ round, videoUrl: "https://drive.google.com/v", submittedAt: "2026-10-14T08:00:00Z", decision, loom: null, note: null, decidedBy: "Founder 2", decidedAt: decision ? "2026-10-15T08:00:00Z" : null, ...extra });
  const tasks = [T("hedi"), T("nour", "successor"), T("asma"), T("rania"), T("mervet")];
  const prods = new Map([
    ["hedi", P("hedi", { editStartedAt: "2026-10-13T08:00:00Z", footageGap: "V5 not shot", allHooksShot: false })],
    ["nour", P("nour", { editStartedAt: "2026-10-15T08:00:00Z", editDue: "2026-10-18" })],
    ["asma", P("asma")],
    ["rania", P("rania", { editStartedAt: "2026-10-13T08:00:00Z" })],
    ["mervet", P("mervet", { editStartedAt: "2026-10-10T08:00:00Z" })],
  ]);
  const rounds = new Map([
    ["hedi", [R(1, "changes", { loom: "https://www.loom.com/share/x", note: "Block 3 footage doesn't match the script." })]],
    ["rania", [R(1, null)]],
    ["mervet", [R(1, "approved")]],
  ]);
  const cards = new Map(tasks.map((t) => [t.id, { face: t.id[0].toUpperCase() + t.id.slice(1), cell: "MSB × Problem", angle: "Knee-Broad", format: "UGC", generate: false }]));
  const q = buildQueue(tasks, prods, rounds, cards, { now, notStartedDays: 2, roundAlert: 3 });
  const sel = sp.task ?? "hedi";
  const view: EditView = {
    taskId: sel, title: cards.get(sel)!.face, cellLine: "MSB × Problem · Knee-Broad · UGC",
    state: q.find((x) => x.taskId === sel)!.state, rounds: rounds.get(sel) ?? [], production: prods.get(sel)!, scriptUrl: "https://docs.google.com/document/d/x",
    hooks: [1, 2, 3, 4, 5].map((v) => ({ v, type: v % 2 ? "Storytelling" : "Authority", line: `Hook line ${v}`, headline: null, name: `UGC_MSB_Problem-Aware_Knee-Broad_Hedi_V${v}` })),
    generate: false, payPerVideo: 100, editorName: "Editor B",
  };
  const v = { personId: founder ? "f2" : "eb", name: founder ? "Founder 2" : "Editor B", role: (founder ? "founder_2" : "editor") as "founder_2" | "editor", email: "" };
  return (
    <main className="page">
      <div className="slab">
        <div className="band"><AppHeader viewer={v} active="editing" /><h1 className="h1" style={{ marginTop: 28 }}>{founder ? "Editing" : "Good morning, Editor B"}</h1></div>
        <div className="body">
          <EditorTiles s={editorStats("eb", prods, rounds, cards, { perVideo: 100, rate3d: null }, now)} showAi={false} />
          <div className="ed-layout">
            <EditQueue items={q} selectedId={sel} editors={[["ea", "Editor A"], ["eb", "Editor B"]]} initialEd={null} forFounder={founder} />
            <EditTask key={sel} v={view} isFounder={founder} isEditor={!founder} editors={[]} />
          </div>
        </div>
      </div>
    </main>
  );
}
