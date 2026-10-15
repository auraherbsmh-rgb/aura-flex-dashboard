import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { ProposalList } from "@/components/Proposals";
import { CreateTaskButton, TaskList } from "@/components/Tasks";
import type { Pickers, Proposal } from "@/lib/proposals-shared";
import type { CreateTaskContext, TaskRow } from "@/lib/tasks-shared";

/** Local-only preview of screen 4 (ENABLE_PREVIEW=1; never on Vercel). */
export default function Preview() {
  if (process.env.ENABLE_PREVIEW !== "1") notFound();
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
  const tasks: TaskRow[] = [
    { id: "t2", status: "writing", dueOn: "2026-10-13", createdAt: "", copywriter: "Copywriter 2", copywriterId: "c2", avatarCode: "FSS", awareness: "Problem-Aware", angle: "Knee-Surgery-Fear", format: "UGC", keep: "The surgery isn't the only road; your knee can still be helped.", note: "new face, a doctor's voice", reference: null },
    { id: "t3", status: "writing", dueOn: "2026-10-22", createdAt: "", copywriter: "Copywriter 1", copywriterId: "c1", avatarCode: "FSB", awareness: "Most-Aware", angle: "Knee-Broad", format: "VSL", keep: null, note: null, reference: "Amel V1" },
  ];
  const p: Proposal = { id: "p1", status: "approved", createdAt: "2026-10-14T10:00:00Z", decidedAt: null, proposedById: "c2", proposedBy: "Copywriter 2", avatarCode: "FSS", awareness: "Problem-Aware", angle: "Knee-Surgery-Fear", isNewAngle: false, why: "Women with a surgery date are the most ready to act.", format: "Doctor video (AUTH)", answer: "Go ahead.", decidedBy: "Founder 1", avatarId: "a2", angleId: "g2", formatId: "f2", hasTask: false };
  const v1 = { personId: "f1", name: "Founder 1", role: "founder_1" as const, email: "" };
  return (
    <main className="page">
      <div className="slab">
        <div className="band"><AppHeader viewer={v1} active="copywriting" /><h1 className="h1" style={{ marginTop: 28 }}>Copywriting</h1></div>
        <div className="body">
          <section className="card sec"><div className="sh"><h2>Tasks</h2></div><div><CreateTaskButton ctx={ctx} pickers={pickers} /></div><TaskList tasks={tasks} showWriter /></section>
          <section className="card sec"><div className="sh"><h2>Proposals</h2></div><ProposalList proposals={[p, { ...p, id: "p2", hasTask: true }]} showAuthor taskCtx={{ ctx, pickers }} /></section>
          <section className="card sec"><div className="sh"><h2>No copywriter yet</h2></div><div><CreateTaskButton ctx={{ ...ctx, copywriters: [] }} pickers={pickers} label="+ Create task (empty team)" /></div></section>
        </div>
      </div>
    </main>
  );
}
