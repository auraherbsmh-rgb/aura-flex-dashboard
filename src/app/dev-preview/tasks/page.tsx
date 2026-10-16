import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { ProposalList } from "@/components/Proposals";
import { CreateTaskButton } from "@/components/Tasks";
import { Inbox, TaskView } from "@/components/TaskView";
import { buildNeeds } from "@/lib/needs";
import { NeedsMe } from "@/components/Proposals";
import { ScriptsPipeline } from "@/components/Pipeline";
import { buildPipeline } from "@/lib/pipeline-shared";
import type { Pickers, Proposal } from "@/lib/proposals-shared";
import type { CreateTaskContext, TaskRow } from "@/lib/tasks-shared";

/** Local-only preview of screen 4 (ENABLE_PREVIEW=1; never on Vercel). */
export default async function Preview({ searchParams }: { searchParams: Promise<{ task?: string; view?: string; prod?: string }> }) {
  if (process.env.ENABLE_PREVIEW !== "1") notFound();
  const sp = await searchParams;
  const view = sp.view ?? "founder";
  const pickers: Pickers = {
    avatars: [{ id: "a1", code: "FSB", label: "FSB · female sufferer, broad" }, { id: "a2", code: "FSS", label: "FSS · female sufferer, surgery" }],
    angles: [{ id: "g1", code: "Knee-Broad", label: "Knee-Broad" }, { id: "g2", code: "Knee-Surgery-Fear", label: "Knee-Surgery-Fear" }],
    formats: [{ id: "f1", code: "UGC", label: "UGC" }, { id: "f2", code: "AUTH", label: "Doctor video (AUTH)" }, { id: "f3", code: "VSL", label: "VSL" }, { id: "f4", code: "AI", label: "AI / 3D" }],
  };
  const ctx: CreateTaskContext = {
    angles: [
      { id: "g1", code: "Knee-Broad", label: "Knee-Broad", coreMessage: null },
      { id: "g2", code: "Knee-Surgery-Fear", label: "Knee-Surgery-Fear", coreMessage: "The surgery isn't the only road; your knee can still be helped." },
    ],
    tasks: [
      { id: "t1", avatarId: "a2", awareness: "Problem-Aware", angleId: "g2", formatId: "f1", status: "approved" },
      { id: "t2", avatarId: "a2", awareness: "Problem-Aware", angleId: "g2", formatId: "f1", status: "writing" },
    ],
    copywriters: [
      { id: "c1", name: "Copywriter 1", target: 4, approvedThisWeek: 3, openTasks: 1 },
      { id: "c2", name: "Copywriter 2", target: 4, approvedThisWeek: 4, openTasks: 2 },
    ],
  };
  const base = { createdAt: "", origin: "manual", angleId: "g2", angleCode: "Knee-Surgery-Fear", formatCode: "UGC", scriptUrl: null, changeFacts: { used: [{ label: "UGC", count: 2 }], total: 2, untried: ["Doctor video (AUTH)", "VSL", "AI / 3D"] }, rounds: [] };
  const r1 = { round: 1, scriptUrl: "https://docs.google.com/document/d/abc", submittedAt: "2026-10-15T08:00:00Z", submittedBy: "Copywriter 2", decision: null, loom: null, note: null, decidedBy: null, decidedAt: null };
  const tasks: TaskRow[] = [
    { ...base, id: "t2", status: "writing", dueOn: "2026-10-13", copywriter: "Copywriter 2", copywriterId: "c2", avatarCode: "FSS", awareness: "Problem-Aware", angle: "Knee-Surgery-Fear", format: "UGC", keep: "The surgery isn't the only road; your knee can still be helped.", note: "new face, a doctor's voice", reference: null },
    { ...base, id: "t3", status: "writing", dueOn: "2026-10-22", copywriter: "Copywriter 1", copywriterId: "c1", avatarCode: "FSB", awareness: "Most-Aware", angle: "Knee-Broad", format: "VSL", keep: null, note: null, reference: "Amel V1" },
    { ...base, id: "t4", status: "changes", dueOn: "2026-10-20", copywriter: "Copywriter 1", copywriterId: "c1", avatarCode: "MSP", awareness: "Solution-Aware", angle: "Knee-Standing-Profession", format: "Doctor video (AUTH)", keep: null, note: null, reference: "https://www.facebook.com/ads/library/?id=1", scriptUrl: r1.scriptUrl, rounds: [{ ...r1, submittedBy: "Copywriter 1", decision: "changes", note: "The hook is too slow: start with the stairs.", loom: "https://www.loom.com/share/x", decidedBy: "Founder 1", decidedAt: "2026-10-15T10:00:00Z" }] },
    { ...base, id: "t6", status: "approved", dueOn: "2026-10-18", copywriter: "Copywriter 2", copywriterId: "c2", avatarCode: "FSS", awareness: "Problem-Aware", angle: "Knee-Surgery-Fear", format: "UGC", keep: null, note: null, reference: null, rounds: [{ ...r1, decision: "approved", decidedBy: "Founder 1", decidedAt: "2026-10-15T11:00:00Z" }] },
    { ...base, id: "t7", status: "details_done", dueOn: "2026-10-18", copywriter: "Copywriter 2", copywriterId: "c2", avatarCode: "FSS", awareness: "Problem-Aware", angle: "Knee-Surgery-Fear", format: "UGC", keep: null, note: null, reference: null, rounds: [{ ...r1, decision: "approved", decidedBy: "Founder 1", decidedAt: "2026-10-15T11:00:00Z" }] },
    { ...base, id: "t5", status: "review", dueOn: "2026-10-18", copywriter: "Copywriter 2", copywriterId: "c2", avatarCode: "CGS", awareness: "Problem-Aware", angle: "Father-Suffer", format: "UGC", keep: "A son who couldn't bear watching his father suffer found what actually helped.", note: null, reference: null, scriptUrl: r1.scriptUrl, rounds: [r1] },
  ];
  const sel = tasks.find((t) => t.id === sp.task) ?? tasks[tasks.length - 1];
  const dp = { hookTypes: [{ id: "h1", label: "Storytelling" }, { id: "h2", label: "Myth Busting" }], mainArguments: [{ id: "m1", label: "Mechanism · triple therapy" }], prices: [59, 90, 129] as [number, number, number] };
  const nm = "UGC_FSS_Problem-Aware_Knee-Surgery-Fear_Sami";
  const det = {
    face: "Sami", shootOn: "2026-10-18", generate: false, mainArgumentId: "m1", offer: 2,
    variations: [1, 2, 3, 4, 5].map((i) => ({ hookTypeId: i % 2 ? "h1" : "h2", hookLine: `Hook line number ${i}`, headline: "" })),
    adSetName: nm, confirmedAt: "2026-10-15T12:00:00Z",
    ads: [1, 2, 3, 4, 5].map((i) => ({ v: i, hookType: i % 2 ? "Storytelling" : "Myth Busting", hookLine: `Hook line number ${i}`, headline: null, adName: `${nm}_V${i}` })),
  };
  const needs = buildNeeds({ personId: "f1", name: "Founder 1", role: "founder_1", email: "" }, [], 48, Date.parse("2026-10-15T15:00:00Z"), tasks, 48);
  const p: Proposal = { id: "p1", status: "approved", createdAt: "2026-10-14T10:00:00Z", decidedAt: null, proposedById: "c2", proposedBy: "Copywriter 2", avatarCode: "FSS", awareness: "Problem-Aware", angle: "Knee-Surgery-Fear", isNewAngle: false, why: "Women with a surgery date are the most ready to act.", format: "Doctor video (AUTH)", answer: "Go ahead.", decidedBy: "Founder 1", avatarId: "a2", angleId: "g2", formatId: "f2", hasTask: false };
  const v1 = { personId: "f1", name: "Founder 1", role: "founder_1" as const, email: "" };
  return (
    <main className="page">
      <div className="slab">
        <div className="band"><AppHeader viewer={v1} active="copywriting" /><h1 className="h1" style={{ marginTop: 28 }}>Copywriting</h1></div>
        <div className="body">
          {view === "pipeline" && (
            <ScriptsPipeline
              forFounder
              writers={[["c1", "Copywriter 1"], ["c2", "Copywriter 2"]]}
              data={buildPipeline(tasks.map((t) => ({ ...t, createdAt: "2026-10-14T09:00:00Z" })), [{ taskId: "t7", face: "Sami", shootOn: "2026-10-17", generate: false, confirmedAt: "2026-10-15T12:00:00Z" }], { forFounder: true, reviewHours: 48, detailsDays: 1, weekStart: "2026-10-11T23:00:00.000Z", now: Date.parse("2026-10-16T09:00:00Z") })}
            />
          )}
          <NeedsMe groups={needs} total={needs.reduce((n, g) => n + g.items.length, 0)} />
          <div className="board">
            <aside className="board-side">
              <section className="tray" style={{ padding: "18px 16px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 6px 6px" }}><h2 style={{ margin: 0, fontSize: 18 }}>Inbox</h2><CreateTaskButton ctx={ctx} pickers={pickers} /></div>
                <Inbox tasks={tasks} selectedId={sel.id} forFounder query="" now={Date.parse("2026-10-15T15:00:00Z")} />
              </section>
            </aside>
            <div className="board-main">
              <TaskView key={sel.id} task={sel} history={[{ cell: "FSS × Problem", format: "UGC", status: "approved", month: "Oct 2026" }]} line={4.18} isFounder={view !== "writer"} isOwner={view === "writer"}
                production={sel.id === "t7" && sp.prod === "in" ? { taskId: "t7", footageUrl: "https://drive.google.com/x", allHooksShot: false, footageGap: "V5 not shot", footageAt: "2026-10-16T07:00:00Z", editorId: null, editorName: null, editDue: null, brief: null, reference: null, assignedAt: null, editStartedAt: null, finalUrl: null, launchedAt: null, liveAt: null, liveSource: null } : undefined}
                prodCard={{ taskId: sel.id, face: "Sami", cell: "FSS × Problem", angle: "Knee-Surgery-Fear", format: "UGC", copywriter: "Copywriter 2", shootOn: "2026-10-17", generate: false, hooks: 5, confirmedAt: "2026-10-15T12:00:00Z" }}
                editors={[{ id: "ea", name: "Editor A", doesAi: true, queue: 3 }, { id: "eb", name: "Editor B", doesAi: false, queue: 1 }]}
                details={sel.id === "t7" ? det : sel.id === "t6" ? { ...det, adSetName: null, confirmedAt: null, ads: [], variations: det.variations.slice(0, 2) } : null} detailsPickers={dp} />
            </div>
          </div>
          <section className="card sec"><div className="sh"><h2>Proposals</h2></div><ProposalList proposals={[p, { ...p, id: "p2", hasTask: true }]} showAuthor taskCtx={{ ctx, pickers }} /></section>
          <section className="card sec"><div className="sh"><h2>No copywriter yet</h2></div><div><CreateTaskButton ctx={{ ...ctx, copywriters: [] }} pickers={pickers} label="+ Create task (empty team)" /></div></section>
        </div>
      </div>
    </main>
  );
}
